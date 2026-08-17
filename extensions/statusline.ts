import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { basename } from "node:path";

const STATUS_ID = "readable-statusline";

function formatCwd(cwd: string): string {
  return basename(cwd) || cwd;
}

function formatTokens(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}M`;
}

function render(ctx: ExtensionContext): void {
  const theme = ctx.ui.theme;
  const model = ctx.model;
  const usage = ctx.getContextUsage();
  const cwd = formatCwd(ctx.cwd);
  const reasoning = ctx.thinkingLevel ?? "off";
  const percent = usage?.percent == null ? "—" : `${usage.percent.toFixed(1)}%`;
  const tokens = usage ? `${formatTokens(usage.tokens)} / ${formatTokens(usage.contextWindow)}` : "—";

  const parts = [
    theme.fg("accent", `${model?.provider ?? "—"}/${model?.id ?? "—"}`),
    theme.fg("dim", "│"),
    theme.fg("warning", reasoning),
    theme.fg("dim", "│"),
    theme.fg("muted", `ctx: ${percent} (${tokens})`),
    theme.fg("dim", "│"),
    theme.fg("muted", cwd),
  ];

  ctx.ui.setStatus(STATUS_ID, parts.join(" "));
}

export default function (pi: ExtensionAPI): void {
  let currentContext: ExtensionContext | undefined;

  pi.on("session_start", async (_event, ctx) => {
    currentContext = ctx;
    ctx.ui.setFooter((_, theme) => ({
      render: (width: number) => {
        if (!currentContext) return [""];
        // Reuse the same readable statusline, but replace the built-in footer entirely.
        const model = currentContext.model;
        const usage = currentContext.getContextUsage();
        const cwd = formatCwd(currentContext.cwd);
        const reasoning = currentContext.thinkingLevel ?? "off";
        const percent = usage?.percent == null ? "—" : `${usage.percent.toFixed(1)}%`;
        const tokens = usage ? `${formatTokens(usage.tokens)} / ${formatTokens(usage.contextWindow)}` : "—";
        const left = [
          theme.fg("accent", `${model?.provider ?? "—"}/${model?.id ?? "—"}`),
          theme.fg("dim", "│"),
          theme.fg("warning", reasoning),
          theme.fg("dim", "│"),
          theme.fg("muted", `ctx: ${percent} (${tokens})`),
        ].join(" ");
        const right = theme.fg("muted", cwd);
        const rightWithinWidth = truncateToWidth(right, width, "");
        const leftWithinWidth = truncateToWidth(
          left,
          Math.max(0, width - visibleWidth(rightWithinWidth) - 1),
          "",
        );
        const gap = " ".repeat(
          Math.max(1, width - visibleWidth(leftWithinWidth) - visibleWidth(rightWithinWidth)),
        );
        return [truncateToWidth(leftWithinWidth + gap + rightWithinWidth, width, "")];
      },
      invalidate() {},
    }));
    render(ctx);
  });

  const update = async (_event: unknown, ctx: ExtensionContext) => {
    currentContext = ctx;
    render(ctx);
  };
  pi.on("turn_start", update);
  pi.on("turn_end", update);
  pi.on("message_end", update);
  pi.on("model_select", update);
  pi.on("thinking_level_select", update);
  pi.on("session_compact", update);
}
