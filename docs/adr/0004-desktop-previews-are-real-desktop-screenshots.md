# Desktop previews are screenshots of the real Claude Desktop

Each mod's Desktop preview comes from running the real Claude Desktop for Linux, with its bundled engine, on a virtual display in its own E2B sandbox, then cropping a screenshot of the session. We chose this over asking the engine for the trees Desktop would draw (the stream-json `ui_render` protocol, which also worked in a spike) and drawing them ourselves. That would have meant a Desktop lookalike we keep matching by hand, the same drift that ADR 0002 rejected for the terminal, plus cleaning hostile trees before putting them on our page. A screenshot is just pixels, it is byte-identical across runs once the inputs are pinned, and it shows Desktop's own quirks for free.

## Consequences

- This lifts ADR 0002's "no Desktop output" caveat. Desktop-only mods such as statusline-anywhere get a recorded preview, so hand-made screenshots go away.
- The session is driven by clicking fixed screen positions. Each Desktop upgrade means rebuilding the sandbox template, checking that the clicks still land, and re-rendering every mod.
- The screenshots are PNG bytes in Postgres, like the other preview data, because the site has no file storage.
