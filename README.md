# pi setup

My personal [pi](https://github.com/badlogic/pi) coding agent setup (`~/.pi/agent`).

## Versioned content

- `settings.json` — theme, default model, TUI preferences
- `extensions/` — custom extensions:
  - `ask-user/` — the `ask_user` tool (multiple-choice question via TUI popup, adapted from [davis7dotsh/my-pi-setup](https://github.com/davis7dotsh/my-pi-setup/tree/main/extensions/ask-user) with the `effect` dependency removed)
  - `orca-agent-status.ts`
  - `orca-prefill.ts`
  - `orca-titlebar-spinner.ts`
  - `statusline.ts`
- `models.example.json` — template for `models.json` (API key redacted)

## Not versioned (`.gitignore`)

- `auth.json`, `models.json`, `models-store.json` — credentials
- `trust.json`, `sessions/`, `bin/` — machine-local state

To set up on another machine: install pi, clone this repo to `~/.pi/agent`,
copy `models.example.json` to `models.json` and fill in the `apiKey`, then log
in normally to generate `auth.json`.
