/**
 * slash-anywhere
 *
 * Faz o dropdown de comandos (extensões, prompt templates, skills) abrir ao
 * digitar "/" em qualquer posição da linha — não só no início.
 *
 * Como funciona:
 * 1. addAutocompleteProvider: intercepta getSuggestions e, ao detectar
 *    `/palavra` no meio do texto (barra após espaço ou no início da linha),
 *    retorna os comandos de pi.getCommands() com fuzzy match. Em qualquer
 *    outra situação delega para o provider built-in (slash no início da linha,
 *    paths, @attachments).
 * 2. setEditorComponent: cria um CustomEditor normal e sobrescreve o método
 *    interno `isInSlashCommandContext` para aceitar `/` após whitespace.
 *    Sem isso o editor nunca pediria sugestões ao digitar "/" no meio do
 *    texto (o pi-tui também filtra "/" dos triggerCharacters).
 *
 * Caveats:
 * - Um comando completado no meio da mensagem NÃO é executado ao enviar: o
 *   dispatch do pi exige "/" como primeiro caractere da mensagem. Aqui a
 *   correção é só de UX/autocomplete.
 * - O override de `isInSlashCommandContext` depende de nome interno do
 *   pi-tui; se um update quebrar, basta apagar esta extensão.
 * - pi.getCommands() lista comandos de extensões, templates e skills — os
 *   comandos built-in da TUI (/model, /settings, ...) só aparecem com "/"
 *   no início da linha (comportamento built-in, preservado).
 */

import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter } from "@earendil-works/pi-tui";

// "/palavra" no fim do texto antes do cursor, com a barra no início da
// linha ou logo após whitespace. O [^\s/]* evita interceptar paths
// absolutos como /tmp/foo.
const INLINE_SLASH = /(?:^|\s)\/([^\s/]*)$/;

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		// ------------------------------------------------------------------
		// 1) Provider de autocomplete: comandos para "/" inline
		// ------------------------------------------------------------------
		ctx.ui.addAutocompleteProvider((current) => ({
			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const line = lines[cursorLine] ?? "";
				const before = line.slice(0, cursorCol);

				// Linha começando com "/" (ignorando indent): mantém o
				// comportamento built-in, que inclui os comandos da TUI.
				if (before.trimStart().startsWith("/")) {
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}

				const match = before.match(INLINE_SLASH);
				if (!match) {
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}

				const word = match[1] ?? "";
				const candidates = pi.getCommands().map((cmd) => ({
					name: cmd.name,
					description: cmd.description,
				}));
				const items = fuzzyFilter(candidates, word, (c) => c.name).map((c) => ({
					value: `/${c.name}`,
					label: `/${c.name}`,
					description: c.description,
				}));

				if (items.length === 0) {
					// Sem comando compatível: deixa o built-in tentar path completion.
					return current.getSuggestions(lines, cursorLine, cursorCol, options);
				}

				return { prefix: `/${word}`, items };
			},

			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				const line = lines[cursorLine] ?? "";
				const beforePrefix = line.slice(0, cursorCol - prefix.length);

				// Só tratamos o caso inline (nossos items têm value com "/"
				// e existe texto antes do prefixo). O resto delega.
				const isInlineSlash =
					prefix.startsWith("/") && item.value.startsWith("/") && beforePrefix.trim() !== "";
				if (!isInlineSlash) {
					return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
				}

				const after = line.slice(cursorCol);
				// Adiciona espaço após o comando (como o built-in), sem duplicar
				// quando já existe whitespace logo após o cursor
				const suffix = /^\s/.test(after) ? "" : " ";
				const newLines = [...lines];
				newLines[cursorLine] = `${beforePrefix}${item.value}${suffix}${after}`;
				return {
					lines: newLines,
					cursorLine,
					cursorCol: beforePrefix.length + item.value.length + (suffix ? 1 : 0),
				};
			},

			shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
				const before = (lines[cursorLine] ?? "").slice(0, cursorCol);
				// Permite Tab como gatilho também sobre "/palavra" inline.
				if (INLINE_SLASH.test(before)) return true;
				return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
			},
		}));

		// ------------------------------------------------------------------
		// 2) Editor: permite que "/" no meio do texto dispare o autocomplete
		// ------------------------------------------------------------------
		const previousFactory = ctx.ui.getEditorComponent();
		ctx.ui.setEditorComponent((tui, theme, keybindings) => {
			const editor = previousFactory
				? previousFactory(tui, theme, keybindings)
				: new CustomEditor(tui, theme, keybindings);

			const original = editor.isInSlashCommandContext?.bind(editor);
			editor.isInSlashCommandContext = (textBeforeCursor: string) =>
				(original?.(textBeforeCursor) ?? false) || INLINE_SLASH.test(textBeforeCursor);

			return editor;
		});
	});
}
