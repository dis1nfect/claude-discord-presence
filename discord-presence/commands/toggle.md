---
description: Discord-Status an- oder ausschalten
argument-hint: "[on|off]"
allowed-tools: Bash(node:*)
---

Gewünscht: `$ARGUMENTS`

Wenn "on"/"an" oder "off"/"aus" angegeben ist, führe entsprechend `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" on` bzw. `... off` aus. Ohne Argument: lies mit `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" show` den Wert `enabled` und schalte ihn um. Bestätige kurz auf Deutsch.
