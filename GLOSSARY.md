# statuslin.es

A community gallery of ways to change what Claude Code shows: status lines and mods, each previewed and installable from the site.

## Language

**Status line**:
Claude Code's `statusLine` feature: a script whose printed output Claude Code shows under the prompt. In the gallery, one such script.
_Avoid_: statusline (one word, in prose), status line mod

**Config**:
A status line as listed in the gallery: its script plus what it needs to run. Only status lines have configs; a mod is never a config.
_Avoid_: script entry

**Version**:
One immutable, reviewed snapshot of a config or a mod, with its listing text: a config's script, or a mod's code at one commit of the author's repo. Each shows exactly one version at a time.
_Avoid_: revision, edit, pin

**Update**:
A submitter's request to add a new version to a config that is already published.
_Avoid_: edit, revision, resubmission

**Resubmission**:
Re-sending a rejected config that was never published.
_Avoid_: update

**Mod**:
A Claude Code plugin whose code runs inside Claude Code and can draw interface. A mod that shows session usage is still just a mod.
_Avoid_: meter, usage mod, status line mod

**Scenario**:
A named, fixed Claude Code session state (model, usage, folder, git and so on) that previews are rendered against. Status lines and mods draw from the same set.
_Avoid_: fixture, test case, sample

**Preview**:
What a status line or mod showed when statuslin.es rendered it against one scenario.
_Avoid_: screenshot, demo, render

**Marketplace**:
statuslin.es's catalog of mods that Claude Code installs from, each entry fixed to an exact commit of the author's code.
_Avoid_: store, registry
