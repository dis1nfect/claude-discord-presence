---
description: Modell für den Discord-Status wählen (auto, Opus 5.5, Sonnet 5.5, Haiku 5.5, Fable 5.2 oder eigener Text)
argument-hint: "[auto|Opus 5.5|Sonnet 5.5|Haiku 5.5|Fable 5.2|freier Text]"
allowed-tools: Bash(node:*), AskUserQuestion
---

Gewünschtes Modell: `$ARGUMENTS`

Wenn oben kein Modell steht, frag den Nutzer mit AskUserQuestion, welches Modell angezeigt werden soll. Optionen:
- "auto" – erkennt das gerade benutzte Modell automatisch aus der Session
- "Opus 5.5"
- "Sonnet 5.5"
- "Haiku 5.5"
(Über "Other" kann jeder beliebige Text eingegeben werden, z. B. "Fable 5.2".)

Setze für `<MODELL>` nur den gewählten Text ein. Entferne Anführungszeichen, Backticks, `$`, `;`, `&`, `|`, `<`, `>` und Zeilenumbrüche, damit keine Shell-Befehle ausgeführt werden.

Führe dann aus (Modell in Anführungszeichen einsetzen):

```
node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" model "<MODELL>"
```

Bestätige kurz auf Deutsch.
