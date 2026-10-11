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

**Submission**:
A version sent for review by a signed-in user: a new config or mod, an update, or a resubmission.
_Avoid_: entry, request

**Submitter**:
The signed-in user who sent a submission. For a config, always its author; for a mod, anyone.
_Avoid_: uploader, owner

**Author**:
Who made a config or mod and is credited for it. A config's author is the site user who submitted it; a mod's author is the owner of its GitHub repository, who may never have signed in.
_Avoid_: creator, owner, submitter

**Update**:
A submitter's request to add a new version to a config or mod that is already published.
_Avoid_: edit, revision, resubmission

**Resubmission**:
Re-sending a rejected config or mod that was never published.
_Avoid_: update

**Mod**:
A Claude Code plugin whose code runs inside Claude Code and can draw interface. A mod that shows session usage is still just a mod.
_Avoid_: meter, usage mod, status line mod

**Scenario**:
A named, fixed Claude Code session state (model, usage, folder, git and so on) that previews are rendered against. Status lines and mods draw from the same set.
_Avoid_: fixture, test case, sample

**Surface**:
Where Claude Code draws a mod: the terminal or Claude Desktop.
_Avoid_: client, app, platform

**Preview**:
What a status line or mod showed when statuslin.es rendered it against one scenario, on one surface.
_Avoid_: screenshot, demo, render

**Install name**:
The name users type to install a mod from the marketplace: the plugin's own name, or that name with its author added when another mod already has it. It never changes once published.
_Avoid_: slug, plugin id

**Input step**:
A line typed into Claude Code's prompt before a mod's preview is taken, so the mod shows what it does.
_Avoid_: demo script, scenario, command

**Marketplace**:
statuslin.es's catalog of mods that Claude Code installs from, each entry fixed to an exact commit of the author's code.
_Avoid_: store, registry
