/**
 * claude-ui — Claude Code-style UI for pi.
 *
 * Transcript customization, no behavior changes:
 *
 *   ⏺ Read(src/index.ts)
 *     ⎿  Read 50 lines (ctrl+o to expand)
 *
 * - Tool calls render as accent bullets: `⏺ ToolName(args)`
 * - Tool results render indented with the `⎿` hook, Claude Code style
 * - Compact summaries for read, bash, edit, write, grep, find, ls
 * - Shell-less rendering (renderShell: "self") — no boxed background
 * - Assistant text gets a leading `⏺` bullet (toggle: /claude-bullets)
 * - Claude-style working indicator (✽)
 * - Expansion still works with the normal expand-outputs keybinding
 *
 * Works by re-registering each built-in tool with the same name and
 * delegating execute() to the original implementation; only rendering
 * is overridden.
 */

import type {
	BashToolDetails,
	EditToolDetails,
	ExtensionAPI,
	FindToolDetails,
	GrepToolDetails,
	LsToolDetails,
	ReadToolDetails,
} from "@earendil-works/pi-coding-agent";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
	keyHint,
} from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";

const BULLET = "⏺"; // tool call / assistant bullet
const HOOK = "⎿"; // result hook, Claude Code style
const INDENT = "  "; // indent before the hook
const BODY_INDENT = "    "; // indent for expanded detail lines

function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type ThemeLike = {
	fg: (color: string, text: string) => string;
	bold: (text: string) => string;
};

/** `⏺ ToolName(detail)` */
function header(theme: ThemeLike, label: string, detail?: string): Text {
	const bullet = theme.fg("dim", BULLET);
	const call = detail ? `${theme.bold(label)}(${truncate(detail, 120)})` : theme.bold(label);
	return new Text(`${bullet} ${theme.fg("toolTitle", call)}`, 0, 0);
}

/** keyHint() needs an initialized theme; degrade gracefully. */
function expandHint(): string {
	try {
		return keyHint("app.tools.expand", "to expand");
	} catch {
		return "ctrl+o to expand";
	}
}

/** `  ⎿  summary` (+ optional expand hint) */
function summary(
	theme: ThemeLike,
	text: string,
	opts: { style?: "default" | "dim" | "success" | "error"; hint?: boolean } = {},
): string {
	const hook = theme.fg("dim", `${INDENT}${HOOK}`);
	const styled = opts.style && opts.style !== "default" ? theme.fg(opts.style as any, text) : text;
	const hint = opts.hint ? theme.fg("dim", ` (${expandHint()})`) : "";
	return `${hook}  ${styled}${hint}`;
}

/** First line of the result text content, if any. */
function firstContentLine(result: { content?: Array<{ type: string; text?: string }> }): string | undefined {
	const content = result.content?.[0];
	return content?.type === "text" ? content.text : undefined;
}

function isErrorResult(result: { content?: Array<{ type: string; text?: string }> }, text?: string): boolean {
	return !!text && /^error/i.test(text.trimStart());
}

/** Error line for failed results: `  ⎿  Error …` in red. */
function errorLine(theme: ThemeLike, result: { content?: Array<{ type: string; text?: string }> }): Text {
	const text = firstContentLine(result) ?? "Unknown error";
	return new Text(summary(theme, truncate(text.split("\n")[0], 160), { style: "error" }), 0, 0);
}

/** Dim expandable detail lines under the summary. */
function detailLines(lines: string[], max: number, theme: ThemeLike, style: "dim" | "default" = "dim"): string {
	const shown = lines.slice(0, max);
	let out = "";
	for (const line of shown) {
		out += `\n${BODY_INDENT}${theme.fg(style as any, line)}`;
	}
	if (lines.length > max) {
		out += `\n${BODY_INDENT}${theme.fg("dim", `… ${lines.length - max} more lines`)}`;
	}
	return out;
}

export default function (pi: ExtensionAPI) {
	const cwd = process.cwd();
	let assistantBullets = true;

	// ---------------------------------------------------------------- state

	pi.on("session_start", async (_event, ctx) => {
		for (const entry of ctx.sessionManager.getEntries()) {
			if (entry.type === "custom" && entry.customType === "claude-ui:state") {
				const data = entry.data as { assistantBullets?: boolean } | undefined;
				if (typeof data?.assistantBullets === "boolean") assistantBullets = data.assistantBullets;
			}
		}

		if (ctx.mode === "tui") {
			const accent = (s: string) => ctx.ui.theme.fg("accent", s);
			ctx.ui.setWorkingIndicator({
				frames: [accent("✽"), accent("✶"), accent("✻"), accent("✶")],
				intervalMs: 180,
			});
		}
	});

	pi.registerCommand("claude-bullets", {
		description: "Toggle the ⏺ bullet on assistant text (Claude Code style)",
		handler: async (_args, ctx) => {
			assistantBullets = !assistantBullets;
			pi.appendEntry("claude-ui:state", { assistantBullets });
			ctx.ui.notify(`Assistant bullets: ${assistantBullets ? "on" : "off"}`, "info");
		},
	});

	// Assistant text gets a leading bullet, like Claude Code.
	pi.registerMarkdownTransformer((markdown, { messageType }) => {
		if (!assistantBullets || messageType !== "assistant" || !markdown.trim()) return markdown;
		return `${BULLET} ${markdown}`;
	});

	// ---------------------------------------------------------------- read

	const originalRead = createReadTool(cwd);
	pi.registerTool({
		name: "read",
		label: "read",
		description: originalRead.description,
		parameters: originalRead.parameters,
		renderShell: "self",

		async execute(toolCallId, params, signal, onUpdate) {
			return originalRead.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme) {
			let detail = args.path;
			const range: string[] = [];
			if (args.offset) range.push(`offset ${args.offset}`);
			if (args.limit) range.push(`limit ${args.limit}`);
			if (range.length) detail += ` (${range.join(", ")})`;
			return header(theme, "Read", detail);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Container();

			const details = result.details as ReadToolDetails | undefined;
			const content = result.content?.[0];

			if (content?.type === "image") {
				return new Text(summary(theme, "Read image"), 0, 0);
			}

			const text = content?.type === "text" ? content.text : "";
			if (isErrorResult(result, text)) return errorLine(theme, result);

			const lines = text.split("\n");
			let out = summary(theme, `Read ${lines.length} ${lines.length === 1 ? "line" : "lines"}`, {
				hint: !expanded && lines.length > 1,
			});

			if (details?.truncation?.truncated) {
				out += theme.fg("warning", ` [truncated from ${details.truncation.totalLines}]`);
			}

			if (expanded) out += detailLines(lines, 20, theme);
			return new Text(out, 0, 0);
		},
	});

	// ---------------------------------------------------------------- bash

	const originalBash = createBashTool(cwd);
	pi.registerTool({
		name: "bash",
		label: "bash",
		description: originalBash.description,
		parameters: originalBash.parameters,
		renderShell: "self",

		async execute(toolCallId, params, signal, onUpdate) {
			return originalBash.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme) {
			const cmd = args.command.split("\n");
			const first = cmd[0] + (cmd.length > 1 ? "…" : "");
			return header(theme, "Bash", first);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details as BashToolDetails | undefined;
			const text = firstContentLine(result) ?? "";
			const lines = text.split("\n");

			if (isPartial) {
				// Live output while running: last few lines, dimmed.
				const preview = lines.slice(-3).filter((l) => l.trim());
				let out = summary(theme, "Running…", { style: "dim" });
				if (preview.length) out += detailLines(preview, 3, theme);
				return new Text(out, 0, 0);
			}

			const exitMatch = text.match(/exit code: (\d+)/);
			const exitCode = exitMatch ? Number(exitMatch[1]) : null;

			// Output lines excluding pi's trailing status line.
			const output = lines
				.filter((l) => !/^\(.*exit code: \d+.*\)$/.test(l.trim()))
				.filter((l) => l.trimEnd().length > 0);

			if (exitCode !== null && exitCode !== 0) {
				let out = summary(theme, `Exit code ${exitCode}`, { style: "error", hint: !expanded && output.length > 0 });
				if (expanded) out += detailLines(output, 20, theme);
				return new Text(out, 0, 0);
			}

			if (output.length === 0) {
				return new Text(summary(theme, "(no output)", { style: "dim" }), 0, 0);
			}

			// Claude Code shows a short preview of the output, not just a count.
			const previewCount = expanded ? 20 : 3;
			let out = summary(theme, truncate(output[0], 140), {
				hint: !expanded && output.length > previewCount,
			});
			if (output.length > 1) {
				out += detailLines(output.slice(1), previewCount - 1, theme);
				if (!expanded && output.length > previewCount) {
					out += `\n${BODY_INDENT}${theme.fg("dim", `… ${output.length - previewCount} more lines`)}`;
				}
			}
			if (details?.truncation?.truncated) {
				out += `\n${BODY_INDENT}${theme.fg("warning", "[output truncated]")}`;
			}
			return new Text(out, 0, 0);
		},
	});

	// ---------------------------------------------------------------- edit

	const originalEdit = createEditTool(cwd);
	pi.registerTool({
		name: "edit",
		label: "edit",
		description: originalEdit.description,
		parameters: originalEdit.parameters,
		renderShell: "self",

		async execute(toolCallId, params, signal, onUpdate) {
			return originalEdit.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme) {
			return header(theme, "Update", args.path);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Container();

			const details = result.details as EditToolDetails | undefined;
			const text = firstContentLine(result);
			if (isErrorResult(result, text) || !details?.diff) {
				if (text) return errorLine(theme, result);
				return new Text(summary(theme, "Updated"), 0, 0);
			}

			const diffLines = details.diff.split("\n");
			let additions = 0;
			let removals = 0;
			for (const line of diffLines) {
				if (line.startsWith("+") && !line.startsWith("+++")) additions++;
				if (line.startsWith("-") && !line.startsWith("---")) removals++;
			}

			const parts: string[] = [];
			if (additions) parts.push(`${additions} ${additions === 1 ? "addition" : "additions"}`);
			if (removals) parts.push(`${removals} ${removals === 1 ? "removal" : "removals"}`);
			const stats = parts.length ? ` with ${parts.join(" and ")}` : "";

			let out = summary(theme, `Updated${stats}`, { hint: !expanded && diffLines.length > 0 });

			if (expanded) {
				for (const line of diffLines.slice(0, 30)) {
					let styled: string;
					if (line.startsWith("+") && !line.startsWith("+++")) styled = theme.fg("success", line);
					else if (line.startsWith("-") && !line.startsWith("---")) styled = theme.fg("error", line);
					else styled = theme.fg("dim", line);
					out += `\n${BODY_INDENT}${styled}`;
				}
				if (diffLines.length > 30) {
					out += `\n${BODY_INDENT}${theme.fg("dim", `… ${diffLines.length - 30} more diff lines`)}`;
				}
			}
			return new Text(out, 0, 0);
		},
	});

	// ---------------------------------------------------------------- write

	const originalWrite = createWriteTool(cwd);
	pi.registerTool({
		name: "write",
		label: "write",
		description: originalWrite.description,
		parameters: originalWrite.parameters,
		renderShell: "self",

		async execute(toolCallId, params, signal, onUpdate) {
			return originalWrite.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme) {
			return header(theme, "Write", args.path);
		},

		renderResult(result, { isPartial }, theme, context) {
			if (isPartial) return new Container();

			const text = firstContentLine(result);
			if (isErrorResult(result, text)) return errorLine(theme, result);

			const lineCount = (context.args as { content?: string })?.content?.split("\n").length;
			const word = /^created/i.test(text ?? "") ? "Created" : "Wrote";
			const size = lineCount ? ` (${lineCount} lines)` : "";
			return new Text(summary(theme, `${word} ${(context.args as { path?: string })?.path ?? "file"}${size}`), 0, 0);
		},
	});

	// ---------------------------------------------------------------- grep

	const originalGrep = createGrepTool(cwd);
	pi.registerTool({
		name: "grep",
		label: "grep",
		description: originalGrep.description,
		parameters: originalGrep.parameters,
		renderShell: "self",

		async execute(toolCallId, params, signal, onUpdate) {
			return originalGrep.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme) {
			let detail = `"${args.pattern}"`;
			if (args.path && args.path !== ".") detail += ` in ${args.path}`;
			if (args.glob) detail += ` (${args.glob})`;
			return header(theme, "Grep", detail);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Container();

			const details = result.details as GrepToolDetails | undefined;
			const text = firstContentLine(result);
			if (isErrorResult(result, text)) return errorLine(theme, result);

			const lines = (text ?? "").split("\n").filter((l) => l.trim() && l.trim() !== "--");
			if (lines.length === 0 || /no matches/i.test(text ?? "")) {
				return new Text(summary(theme, "No matches", { style: "dim" }), 0, 0);
			}

			let out = summary(theme, `Found ${lines.length} ${lines.length === 1 ? "match" : "matches"}`, {
				hint: !expanded,
			});
			if (details?.matchLimitReached) {
				out += theme.fg("warning", ` (limit ${details.matchLimitReached} reached)`);
			}
			if (expanded) out += detailLines(lines, 20, theme);
			return new Text(out, 0, 0);
		},
	});

	// ---------------------------------------------------------------- find

	const originalFind = createFindTool(cwd);
	pi.registerTool({
		name: "find",
		label: "find",
		description: originalFind.description,
		parameters: originalFind.parameters,
		renderShell: "self",

		async execute(toolCallId, params, signal, onUpdate) {
			return originalFind.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme) {
			let detail = `"${args.pattern}"`;
			if (args.path && args.path !== ".") detail += ` in ${args.path}`;
			return header(theme, "Glob", detail);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Container();

			const details = result.details as FindToolDetails | undefined;
			const text = firstContentLine(result);
			if (isErrorResult(result, text)) return errorLine(theme, result);

			const lines = (text ?? "").split("\n").filter((l) => l.trim());
			if (lines.length === 0 || /no files/i.test(text ?? "")) {
				return new Text(summary(theme, "No files found", { style: "dim" }), 0, 0);
			}

			let out = summary(theme, `Found ${lines.length} ${lines.length === 1 ? "file" : "files"}`, {
				hint: !expanded && lines.length > 5,
			});
			if (details?.resultLimitReached) {
				out += theme.fg("warning", ` (limit ${details.resultLimitReached} reached)`);
			}

			// Show a short list even collapsed, like Claude Code.
			const previewCount = expanded ? 20 : 5;
			out += detailLines(lines, previewCount, theme);
			return new Text(out, 0, 0);
		},
	});

	// ---------------------------------------------------------------- ls

	const originalLs = createLsTool(cwd);
	pi.registerTool({
		name: "ls",
		label: "ls",
		description: originalLs.description,
		parameters: originalLs.parameters,
		renderShell: "self",

		async execute(toolCallId, params, signal, onUpdate) {
			return originalLs.execute(toolCallId, params, signal, onUpdate);
		},

		renderCall(args, theme) {
			return header(theme, "LS", args.path && args.path !== "." ? args.path : undefined);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Container();

			const text = firstContentLine(result);
			if (isErrorResult(result, text)) return errorLine(theme, result);

			const lines = (text ?? "").split("\n").filter((l) => l.trim());
			let out = summary(theme, `Listed ${lines.length} entries`, {
				hint: !expanded && lines.length > 8,
			});
			if (expanded) out += detailLines(lines, 25, theme);
			else out += detailLines(lines.slice(0, 8), 8, theme);
			return new Text(out, 0, 0);
		},
	});
}
