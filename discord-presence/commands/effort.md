---
description: Effort-Level für den Discord-Status wählen (auto, Low, Medium, High, Extra High, Max, off oder eigener Text)
argument-hint: "[auto|Low|Medium|High|Extra High|Max|off|freier Text]"
allowed-tools: Bash(node:*), AskUserQuestion
---

Gewünschtes Effort-Level: `$ARGUMENTS`

Wenn oben kein Level steht, frag den Nutzer mit AskUserQuestion, welches Effort-Level angezeigt werden soll. Optionen:
- "auto" – erkennt das aktuelle Effort-Level automatisch aus der Session (folgt auch Änderungen)
- "High"
- "Max"
- "off" – Effort-Level nicht anzeigen
(Über "Other" geht Low, Medium, Extra High oder jeder beliebige Text, z. B. "Ultrathink".)

Setze für `<EFFORT>` nur den gewählten Text ein. Entferne Anführungszeichen, Backticks, `$`, `;`, `&`, `|`, `<`, `>` und Zeilenumbrüche, damit keine Shell-Befehle ausgeführt werden.

Führe dann aus (Level in Anführungszeichen einsetzen):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" effort "<EFFORT>"
```

Bestätige kurz in der Sprache des Nutzers. Feste Stufen erscheinen als „High Effort“ usw., eigener Text genau so, wie er eingegeben wurde.
