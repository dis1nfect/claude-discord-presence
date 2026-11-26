# Claude Code → Discord Rich Presence

A [Claude Code](https://claude.com/claude-code) plugin that shows your current Claude Code session as an activity on your Discord profile. You choose which **plan**, **model** and **effort level** it displays.

```
Playing Vibe Coding
Working on my-project                    ← or "Waiting for approval in …" / "Idle in …"
Fable 5.2 · High Effort · Claude Max 5x  ← model · effort · plan (all up to you)
01:23 elapsed
```

- Live status: **Working** while Claude runs, **Waiting for approval** at a permission prompt, **Idle** when the turn is done
- Pick your plan: Free, Pro, Max 5x, Max 20x, Team, Enterprise, API, or any text
- Pick your model: Opus, Sonnet, Haiku, Fable, any text, or `auto` (read from the session, follows `/model` switches)
- Pick your effort level: Low, Medium, High, Extra High, Max, any text, `auto` (read from the session, follows effort changes) or `off`
- Several sessions open at once? The most recently active one is shown, and the count appears in the image tooltip
- No dependencies, only Node.js. Works on Windows, macOS and Linux

> **Note:** This is a community project. It is not made by, affiliated with or endorsed by Anthropic or Discord.

---

## Requirements

- **Claude Code** (CLI, or the Code tab in the desktop app)
- **Node.js** 18 or newer on your `PATH`
- The **Discord desktop app** running on the same computer. Discord in the browser cannot show Rich Presence.
- Discord → *Settings → Activity Privacy* → **Share your detected activities with others** turned on

## 1. Create a Discord application (once, about 1 minute)

Discord shows the activity under the name of an application that you own.

1. Open <https://discord.com/developers/applications> and click **New Application**.
2. Give it a name. This is what appears after "Playing …", for example **Vibe Coding** or **ClaudeCode**.
   > Discord rejects names that contain *Claude* as a separate word ("Claude Code" fails with error 50277).
3. Under **General Information**, copy the **Application ID**.
4. *(Optional)* Under **Rich Presence → Art Assets**, upload an image named `claude`. It becomes the large picture. It can take a few minutes before Discord shows new assets.

## 2. Install the plugin

Inside Claude Code (these are slash commands, not terminal commands):

```
/plugin marketplace add dis1nfect/claude-discord-presence
/plugin install discord-presence@claude-discord-presence
```

Or from a normal terminal:

```bash
claude plugin marketplace add dis1nfect/claude-discord-presence
claude plugin install discord-presence@claude-discord-presence
```

<details>
<summary><b>Alternative: install from the release zip</b></summary>

1. Download `claude-discord-presence-vX.Y.Z.zip` from [Releases](https://github.com/dis1nfect/claude-discord-presence/releases) and extract it to a folder you keep, for example `~/claude-plugins/`.
2. Add the extracted folder as a local marketplace and install from it:
   ```bash
   claude plugin marketplace add ~/claude-plugins/claude-discord-presence
   claude plugin install discord-presence@claude-discord-presence
   ```
   Don't delete the folder afterwards. Claude Code loads the plugin from there.

</details>

Then **restart Claude Code** (or open a new session) so the hooks load.

## 3. Set it up

In Claude Code:

```
/discord-presence:setup YOUR_APPLICATION_ID
```

The setup asks for your plan, model and effort level and turns the status on. Send a prompt, and your profile updates within a few seconds.

## Usage

| Command | What it does |
| --- | --- |
| `/discord-presence:setup [id]` | Guided setup: Application ID, plan, model, effort |
| `/discord-presence:plan Max 20x` | Set the plan: `Free`, `Pro`, `Max 5x`, `Max 20x`, `Team`, `Enterprise`, `API` or any text |
| `/discord-presence:model Opus 5.5` | Set the model: `auto`, `Opus 5.5`, `Sonnet 5.5`, `Haiku 5.5`, `Fable 5.2` or any text |
| `/discord-presence:effort High` | Set the effort level: `auto`, `Low`, `Medium`, `High`, `Extra High`, `Max`, any text, or `off` to hide it |
| `/discord-presence:status` | Show the current settings and whether the background process is running |
| `/discord-presence:toggle [on\|off]` | Turn the Discord status on or off |

### More options

All settings live in `~/.claude/discord-presence/config.json`. You can change them with the bundled script. `<plugin>` is the plugin's install folder; inside Claude Code you can also just ask Claude to change a setting.

```bash
node <plugin>/scripts/config.js show                       # print all settings
node <plugin>/scripts/config.js set showProject false      # hide the project/folder name
node <plugin>/scripts/config.js set showElapsed false      # hide the timer
node <plugin>/scripts/config.js set showPlan false         # hide the plan
node <plugin>/scripts/config.js set largeImage https://example.com/logo.png   # asset key or https URL
node <plugin>/scripts/config.js set largeImageText "Claude Code"              # tooltip of the large image
node <plugin>/scripts/config.js set smallImage my_asset    # small corner image
node <plugin>/scripts/config.js set buttonLabel "My GitHub"
node <plugin>/scripts/config.js set buttonUrl https://github.com/you
node <plugin>/scripts/config.js restart                    # restart the background process
```

| Key | Default | Meaning |
| --- | --- | --- |
| `enabled` | `true` | Status on/off |
| `clientId` | `""` | Your Discord Application ID |
| `plan` | `Pro` | Plan text |
| `model` | `auto` | Model text, or `auto` to detect it |
| `effort` | `auto` | Effort level (`Low` … `Max` are shown as "High Effort" etc.), any text shown as-is, or `auto` to detect it |
| `showEffort` | `true` | Show the effort level next to the model |
| `showProject` | `true` | Show the name of the project folder |
| `showElapsed` | `true` | Show elapsed time since the session started |
| `showPlan` | `true` | Show the plan next to the model |
| `largeImage` | `claude` | Art asset key or https image URL |
| `largeImageText` | `Claude Code` | Tooltip of the large image |
| `smallImage` | `""` | Optional small image (asset key or URL) |
| `buttonLabel` / `buttonUrl` | `""` | Optional button under the activity |

## How it works

```
Claude Code hooks ──► ~/.claude/discord-presence/sessions/<id>.json ──► daemon.js ──► Discord IPC pipe
```

- **Hooks** (`SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Notification`, `Stop`, `SessionEnd`) run `scripts/hook.js`. It writes a small state file for each session and starts the background process if it isn't running. The hook prints nothing and always exits successfully, so it never gets in Claude's way.
- **`scripts/daemon.js`** keeps a single connection to Discord's local IPC socket (`\\?\pipe\discord-ipc-N` on Windows, `discord-ipc-N` in the temp or runtime folder on macOS and Linux) and sends `SET_ACTIVITY` whenever the shown state changes, within Discord's rate limit.
- When the last session ends, the daemon clears your activity and exits after about 20 seconds.
- Nothing leaves your machine except the activity text sent to your local Discord client.

Files: `~/.claude/discord-presence/config.json` (settings), `daemon.log` (log), `sessions/` (one small file per open session).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Nothing shows up | Is the Discord **desktop** app running? Is *Activity Privacy → Share detected activities* on? Run `/discord-presence:status` and check that a `clientId` is set and the daemon is running. |
| `Invalid Client ID` in `daemon.log` | The Application ID is wrong. Copy it again from the Developer Portal and run `/discord-presence:setup`. |
| Status stuck after a crash | Run `node <plugin>/scripts/config.js restart`. Stale sessions are removed automatically after 12 hours. |
| No image | Upload an art asset named exactly `claude`, or set `largeImage` to an https URL. New assets can take a few minutes to appear. |
| Slash commands missing | Restart Claude Code after installing. Run `/plugin` to check that `discord-presence` is enabled. |

Log: `~/.claude/discord-presence/daemon.log`

## Uninstall

```
/plugin uninstall discord-presence@claude-discord-presence
```

Optionally delete `~/.claude/discord-presence/`.

---

## 🇩🇪 Kurzanleitung

1. Auf <https://discord.com/developers/applications> eine **New Application** anlegen. Gib ihr einen Namen **ohne** „Claude“ als eigenes Wort, z. B. „Vibe Coding“, und kopiere die **Application ID**.
2. In Claude Code:
   ```
   /plugin marketplace add dis1nfect/claude-discord-presence
   /plugin install discord-presence@claude-discord-presence
   ```
3. Claude Code neu starten, dann `/discord-presence:setup DEINE_ID` ausführen. Der Befehl fragt nach Abo, Modell und Effort-Level.
4. Später ändern: `/discord-presence:plan Max 20x`, `/discord-presence:model Opus 5.5` und `/discord-presence:effort High` (jeweils auch `auto`; Effort zusätzlich `off`).

Voraussetzungen: die Discord-Desktop-App, und unter *Einstellungen → Aktivitätsprivatsphäre* muss „Erkannte Aktivitäten mit anderen teilen“ eingeschaltet sein.

## License

[MIT](LICENSE)
