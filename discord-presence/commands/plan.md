---
description: Abo für den Discord-Status wählen (Free, Pro, Max 5x, Max 20x, Team, Enterprise, API)
argument-hint: "[Free|Pro|Max 5x|Max 20x|Team|Enterprise|API]"
allowed-tools: Bash(node:*), AskUserQuestion
---

Gewünschtes Abo: `$ARGUMENTS`

Wenn oben kein Abo steht, frag den Nutzer mit AskUserQuestion, welches Abo angezeigt werden soll (Optionen: Pro, Max 5x, Max 20x, API – über "Other" geht Free, Team, Enterprise oder freier Text).

Setze für `<ABO>` nur den gewählten Text ein. Entferne Anführungszeichen, Backticks, `$`, `;`, `&`, `|`, `<`, `>` und Zeilenumbrüche, damit keine Shell-Befehle ausgeführt werden.

Führe dann aus (Abo in Anführungszeichen einsetzen):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" plan "<ABO>"
```

Bestätige kurz auf Deutsch. Die Änderung erscheint innerhalb weniger Sekunden in Discord.
