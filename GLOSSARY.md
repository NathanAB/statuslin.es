# statuslin.es

A community gallery of Claude Code mods, each previewed and installable from the site. Its own copy uses "mod" in the plain sense, with status lines as one kind (the home page, topic pages, submit, terms and `llms.txt`). In the code, and on every page only about status lines, **Mod** and **Status line** below stay two kinds.

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
A Claude Code plugin whose code runs inside Claude Code and can draw interface. A mod that shows session usage is still just a mod, and so is one that also carries themes. Site copy that says "mods" for the whole gallery counts status lines among them; never call one status line a mod, nor a theme plugin.
_Avoid_: meter, usage mod, status line mod

**Theme**:
One look a plugin carries: a terminal theme, a color file Claude Code applies when it is picked in `/theme`, or a Desktop theme, a look a mod sets in Claude Desktop. Visitors browse themes one by one; the plugin that carries a theme is what statuslin.es reviews, pins and installs.
_Avoid_: skin, color scheme, palette

**Theme plugin**:
A plugin whose only components are terminal themes. It runs no code, so it is listed beside mods, the same way, but never called a mod.
_Avoid_: theme mod, theme pack

**Window**:
Whether a theme is made for a light or a dark window, and so which one its preview is drawn in.
_Avoid_: mode, appearance

**Twin**:
A theme made for the other window from another theme it otherwise matches. Each twin is a theme of its own, with its own card and preview.
_Avoid_: variant, light version, dark version

**Switch steps**:
What a visitor sends in a new Claude Desktop session to switch to a Desktop theme; none when its mod sets its one theme on its own. Its preview is recorded by sending exactly these, and its card shows them.
_Avoid_: input steps, theme command

**Scenario**:
A named, fixed Claude Code session state (model, usage, folder, git and so on) that previews are rendered against. Status lines and mods draw from the same set.
_Avoid_: fixture, test case, sample

**Scene**:
What a recorded terminal session plays on top of its scenario. A mod's scene is the scripted prompt, then the mod's input steps. Every terminal theme shares one scene, so its previews compare side by side: a prompt, a reply, a file edit with added and removed lines, and a prompt asking to run a command, which is never answered.
_Avoid_: script, flow

**Surface**:
Where Claude Code draws a mod or applies a theme: the terminal or Claude Desktop.
_Avoid_: client, app, platform

**Preview**:
What a status line, mod or theme showed when statuslin.es rendered it against one scenario, on one surface.
_Avoid_: screenshot, demo, render

**Marketplace**:
statuslin.es's catalog of mods that Claude Code installs from, each entry fixed to an exact commit of the author's code.
_Avoid_: store, registry

**Listing**:
A config, a mod or a theme plugin as published in the gallery, with its own page. A theme has a card but no page of its own; its card leads to its plugin's listing.
_Avoid_: entry, item

**Unreviewed mod**:
A mod statuslin.es has a page for and hasn't read. It is not a listing: it has no place in the marketplace or the gallery's ranking, and can't be installed from the site. Visitors see it labelled "Not reviewed". Most come from the unreviewed list and show facts only. A curated mod that carries Desktop themes can be one too while it waits for its review: its page and its theme cards also show the themes' recorded previews.
_Avoid_: listing, listed mod, indexed mod

**Page copy**:
The reviewed text on a listing's page that explains it, written by statuslin.es rather than the author. A mod's page copy also has a headline and common questions.
_Avoid_: generated content, description
