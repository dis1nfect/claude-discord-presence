---
description: Aktuelle Discord-Status-Einstellungen anzeigen
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" show`

Fasse die Einstellungen oben kurz auf Deutsch zusammen (Abo, Modell, Application ID gesetzt?, Daemon läuft?). Wenn `clientId` leer ist, verweise auf `/discord-presence:setup`.
Weitere Optionen lassen sich mit `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" set <key> <wert>` ändern, z. B. `showProject false` (Projektname verbergen), `showElapsed`, `showPlan`, `largeImage` (Asset-Name oder https-URL), `smallImage`, `buttonLabel`/`buttonUrl`.
