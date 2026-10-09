# Mod previews are recorded from real Claude Code, not painted by us

Mod previews come from running the real Claude Code binary in the E2B sandbox with the mod loaded, feeding it each scenario, and capturing what the terminal shows. We chose this over Claude Code's own test kit (`claude plugin test`) plus a painter of our own, because the gallery lists mods of every kind: panes, Markdown, code blocks and restyled built-in rows would each need painting by hand and would drift from what users actually see. The cost is slower, timing-sensitive renders and no Desktop output from this path.

## Consequences

- Mods that draw only in Desktop, such as statusline-anywhere, produce nothing in a terminal capture and need a separate answer.
- Each adopted Claude Code release means rebuilding the sandbox template and re-rendering mod previews.
