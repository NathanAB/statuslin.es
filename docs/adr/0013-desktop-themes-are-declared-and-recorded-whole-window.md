# Desktop themes are declared by the operator and recorded whole-window

Accepted 2026-11-23. A Desktop theme is a look a mod's code sets in Claude Desktop (GLOSSARY.md), and nothing in a plugin lists the looks its code can set: Anthropic's example pack keeps 38 of them in its own TypeScript and switches between them with its own slash command. So the operator declares each Desktop theme a mod version carries, and statuslin.es records each one in the real Claude Desktop (ADR 0004) as a still of the whole window.

## What changes

1. **The operator declares a mod's Desktop themes**, in the mod's curation entry beside its input steps: each theme's key, name, window and switch steps. A mod that sets its one theme when a session starts has no switch steps. A twin is a theme of its own, with its own switch steps and window.
2. **Only a mod that sets a theme can carry Desktop themes.** Its footprint says so: it draws the window background. Import refuses a declaration for any other mod.
3. **A Desktop theme's preview is the whole window**, recorded with Desktop in the theme's window, after the scripted turn and the theme's switch steps. The card shows those same steps. The page gets the full shot and the card a smaller copy of it.
4. **A recording is refused, saying why, rather than stored** when the window looks like Desktop's own (the theme didn't apply), when it shows the other window than the one declared, or when two recordings of the same commit differ (the still the operator reviews could not be the one that goes live).
5. **A mod that sets a theme gets a whole-window Desktop preview of its own too.** The band and pane framing other mods get compares against Desktop's own greys, which a theme repaints. Other mods' Desktop previews are unchanged.

## What others do

- VS Code reads an extension's themes from its manifest (`contributes.themes` in [the color theme guide](https://code.visualstudio.com/api/extension-guides/color-theme)). Claude Code has a manifest folder for terminal themes (ADR 0012) but none for Desktop themes, which only a mod's running code sets ([mods reference](https://code.claude.com/docs/en/plugins/mods/reference)), so a person has to say what they are.
- Curated mods already work this way for their previews: the operator writes each mod's input steps (ADR 0009), and the recorder types them.

## Considered options

- **Read the themes out of the mod's code.** Every pack names them differently, in code the inspection sandbox only validates, so this would be a parser per author.
- **Run the mod and ask it.** No hook lists a mod's themes; `/custom-theme list` is one pack's own command, and its answer is the author's text.
- **One preview per mod.** A pack of 38 would show one look, which is what ADR 0012 rejects for terminal themes.

## Consequences

- A pack costs two Desktop recordings per theme, plus one unthemed recording per window per run.
- A theme whose background moves between runs, or that depends on a GPU the sandbox lacks, can't be listed until it holds still there.
- A submitted mod has no curation entry, so it gets no Desktop theme cards until the operator declares its themes.
