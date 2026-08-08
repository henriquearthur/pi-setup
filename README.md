# pi setup

Meu setup pessoal do [pi](https://github.com/badlogic/pi) coding agent (`~/.pi/agent`).

## Conteúdo versionado

- `settings.json` — tema, modelo default, preferências do TUI
- `extensions/` — extensões customizadas:
  - `ask-user/` — tool `ask_user` (pergunta de múltipla escolha via popup TUI, adaptada de [davis7dotsh/my-pi-setup](https://github.com/davis7dotsh/my-pi-setup/tree/main/extensions/ask-user), sem a dependência `effect`)
  - `orca-agent-status.ts`
  - `orca-prefill.ts`
  - `orca-titlebar-spinner.ts`
  - `statusline.ts`
- `models.example.json` — formato do `models.json` (com a API key redigida)

## Não versionado (`.gitignore`)

- `auth.json`, `models.json`, `models-store.json` — credenciais
- `trust.json`, `sessions/`, `bin/` — estado local da máquina

Para usar em outra máquina: instalar o pi, clonar este repo em `~/.pi/agent`,
copiar `models.example.json` para `models.json` preenchendo a `apiKey`, e fazer
login normal para gerar o `auth.json`.
