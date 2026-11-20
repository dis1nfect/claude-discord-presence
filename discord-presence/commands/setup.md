---
description: Discord-Status einrichten (Application ID, Abo, Modell)
argument-hint: "[Discord Application ID]"
allowed-tools: Bash(node:*), AskUserQuestion
---

Richte das Discord-Presence-Plugin für den Nutzer ein. Antworte in der Sprache, in der der Nutzer schreibt.

Aktuelle Konfiguration:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" show`

Mitgegebene Application ID (kann leer sein): `$ARGUMENTS`

Schritte:

1. **Application ID.** Wenn oben eine ID mitgegeben wurde, nutze sie. Ist sonst noch keine `clientId` gesetzt, erkläre kurz:
   - https://discord.com/developers/applications öffnen → "New Application" → Name z. B. **Vibe Coding** oder **ClaudeCode** (dieser Name steht später als "Spielt …" im Profil; Discord lehnt Namen ab, die "Claude" als eigenes Wort enthalten).
   - Unter "General Information" die **Application ID** kopieren.
   - Optional: Unter "Rich Presence → Art Assets" ein Bild mit dem Namen `claude` hochladen (wird als großes Bild angezeigt).
   Bitte den Nutzer dann, die ID einzufügen. Übernimm ausschließlich die Ziffern der Eingabe (keine Leerzeichen, Anführungszeichen oder Sonderzeichen) und setze sie mit:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" client-id "<ID>"`
2. **Abo.** Frag mit AskUserQuestion nach dem Abo (Pro, Max 5x, Max 20x, API; "Other" für Free/Team/Enterprise) und setze es mit
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" plan "<ABO>"`
3. **Modell.** Frag mit AskUserQuestion nach dem Modell (auto – automatisch erkennen, Opus 5.5, Sonnet 5.5, Haiku 5.5; "Other" für freien Text) und setze es mit
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" model "<MODELL>"`
4. Aktiviere den Status: `node "${CLAUDE_PLUGIN_ROOT}/scripts/config.js" on`
5. Sag dem Nutzer, dass die Discord-Desktop-App laufen muss und unter *Einstellungen → Aktivitätsprivatsphäre* "Aktuelle Aktivität als Statusnachricht teilen" an sein muss. Weitere Befehle: `/discord-presence:plan`, `/discord-presence:model`, `/discord-presence:status`, `/discord-presence:toggle`.
