# Mod render spike (#38): report

Throwaway spike on `prototype/mod-render-spike`. It is never merged. Every number below is labelled **measured** (observed in a run of this harness) or **inferred** (reasoned from measurements or source, not observed directly).

### Verdict

Recording real Claude Code 2.1.296 in E2B gives reliable, repeatable mod previews for mods that draw on their own or after one slash command.

- **Candidates (measured).** 7 of the 8 produced a non-empty crop in 3 of 3 runs. Six of those were identical across runs once the clock and spinner verb are masked. The seventh, skins, differs only in its own random completion word.
- **filetree (measured).** It produced only its command's text reply, because it needs a terminal at least 110 columns wide and fullscreen.
- **All 30 mods (measured).** 24 produced a non-empty crop and 6 produced an empty one. About 12 of the 24 show the mod's real surface. The rest show only a command's text reply.

### How to rerun

```
bun spike/run.ts <plugin name | owner/repo/path> [--runs N]
bun spike/run.ts --all [--concurrency N]      # candidates x3, every other mod x1
bun spike/run.ts --baseline                    # record and print the shared baseline
bun spike/summarize.ts --details               # the per-mod digest in results/summary.md
bun spike/template-facts.ts                    # privacy flag, size, start-up (9 alternating samples)
```

`E2B_API_KEY` comes from the process env. If it is not set there, the harness reads it from the main checkout's `.env.staging` into the process only (`spike/env.ts`). The first run builds the template `statuslines-mod-spike:cc-2-1-296-r1`. Later runs reuse it.

### The method

1. **Template.**
   - `scripts/build-e2b-template.ts` now exports `renderTemplate()`. That is the production definition plus `npm install -g @anthropic-ai/claude-code@2.1.296`, with the version asserted.
   - Its build to `statuslines-render-build` runs only when the file is executed directly (`import.meta.main`).
   - `spike/template.ts` extends `renderTemplate()` with `@xterm/headless@6.0.0` under `/opt/statuslines/replay` and builds the `statuslines-mod-spike` alias.
   - The production alias and `E2B_TEMPLATE_ID` were never built or changed.
2. **Canned model reply.**
   - `sandbox-anthropic-usage-server.py` has a new `--canned-reply` mode. It serves plain HTTP on 127.0.0.1:8787 and runs as `user`.
   - It answers `POST /v1/messages`, streamed or not, and `/v1/messages/count_tokens`. It logs request paths.
   - Token counts are sized from `clean-main`: 37k input, 5k cache write and 2k cache read, so 44k, which is 22% of 200k.
   - The existing usage-mock mode is unchanged, and its `--self-test` output is identical.
3. **Scenario feed mod** (`spike/scenario-feed`).
   - It hooks every `$` call event by its literal name.
   - For the mod under render only, it answers from `clean-main` (`spike/feed-values.ts`): `session.usage`, `session.model`, `cwd`, `root`, `repo`, `id` and `version`.
   - `session.usage` is merged over the engine's own answer, so a requested breakdown still comes back.
   - `resetsAt` is ISO 8601, built from the scenario's epoch offsets.
   - Every call the mod makes is logged, along with whether the feed answered it.
4. **Capture.**
   - Each recording gets a fresh sandbox with the network off.
   - The session uses a throwaway `HOME` and `CLAUDE_CONFIG_DIR`, with `.claude.json` seeded (onboarding done, folder trusted, key approved).
   - Env: a fake `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL` pointing at the canned server, `DISABLE_TELEMETRY`, `DISABLE_AUTOUPDATER`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`, `TERM=xterm-256color` and `COLORTERM=truecolor`.
   - The working directory is a git repo on `main` with an `acme/app` origin.
   - The mod's GitHub tarball is fetched on the host as bytes and unpacked inside the sandbox.
   - Claude Code runs as `claude --model claude-opus-4-8 --plugin-dir <feed> --plugin-dir <mod>` in a 100x30 E2B pty.
   - The harness waits for 2 s of quiet, types `hello` and Enter, waits for quiet again, and applies the input steps with a quiet wait after each.
   - Finally it replays the byte stream through `@xterm/headless` inside the sandbox.
5. **Crop.**
   - The baseline is the same session with the feed and no mod. It is recorded once per invocation and shared by every mod.
   - Rows are compared as SGR-styled strings, with the turn-duration row's random verb and wall-clock time masked.
   - The harness keeps the mod screen's rows that are not on the longest common subsequence (LCS) with the baseline, plus the last `❯` prompt row.
   - The existing `parseAnsi` turns the kept rows into `AnsiSegment[]`.
   - A crop that holds only the prompt row counts as not rendered.

### Per mod (measured)

- **Runs.** Candidates ran 3 times and every other mod once.
- **Distinct crops.** This counts different masked crops across a mod's runs. A value of 1 means every run matched.
- **Render ms.** Host wall time per recording, at concurrency 6. It includes the harness's `claude --version` and `validate` calls.

| mod | plugin | runs | non-empty crop | distinct crops | render ms median (range) | input steps | crop shows |
| --- | --- | --- | --- | --- | --- | --- | --- |
| playground token-weather | token-weather | 3 | 3 | 1 | 15246 (14624-15559) | none | AbovePrompt band "☀ Clear 22% of context 44k / 200k last turns ██ steady" |
| hamzafer context-bar | context-bar | 3 | 3 | 1 | 17175 (15995-17232) | none | AbovePrompt box with a stacked bar and legend; window reads 1M (see Feed gaps) |
| hamzafer usage-meter | usage-meter | 3 | 3 | 1 | 16753 (15968-16994) | none | band "⏱ $0.25 session" only, no rate-limit bars (see Feed gaps) |
| jarrodwatts image-view | image-view | 3 | 3 | 1 | 16715 (16387-19109) | type `look at [Image #1]`, no Enter | AbovePrompt tile "no preview #1" |
| playground replay-theater | replay-theater | 3 (+3 rerun) | 3 | 1 | 17386 (16027-17615) | `/replay` | text reply "Replay Theater: no edits in the last turn." |
| hamzafer next-steps | next-steps | 3 | 3 | 1 | 17195 (13427-17971) | none | band "next: 1 The repo is clean and the tests pass · 0 dismiss" |
| data-goblin filetree | filetree | 3 | 3 | 1 | 17098 (14226-17716) | `/filetree` | text reply: needs a terminal at least 110 columns wide |
| hellosverre skins | skins | 3 | 3 | 3 | 29915 (29621-32700) | none | restyled prompt box, reply and footer "◆ Done in 16s", band "22% context 26% 5h 7% 7d" |
| playground blast-radius | blast-radius | 1 | 0 | 1 | 13610 | none | empty: needs the model to call Bash with a risky command |
| hamzafer agent-radar | agent-radar | 1 | 1 | 1 | 18833 | `/radar` | pane "0 running · 0 finished / No subagents yet this session." |
| hamzafer blast-radius | blast-radius | 1 | 0 | 1 | 15156 | none | empty: needs a Bash tool call |
| hamzafer browser-lanes | browser-lanes | 1 | 1 | 1 | 18578 | `/browser` | text reply only |
| hamzafer cache-clock | cache-clock | 1 | 1 | 1 | 15586 | `/cache-clock` | text reply "cache-clock is off" |
| hamzafer glance | glance | 1 | 1 | 1 | 18659 | `/glance` | text reply: every source "couldn't reach it" |
| hamzafer md-preview | md-preview | 1 | 1 | 1 | 25747 | `/md README.md` | pane with buttons and the rendered README |
| hamzafer merge-gate | merge-gate | 1 | 1 | 1 | 19814 | `/gate` | text reply "No open PR for this branch." |
| hamzafer mission-control | mission-control | 1 | 1 | 1 | 23262 | `/mission` | pane "0 agents · 0 tool calls / ◆ main · hello 0.1s" |
| hamzafer now-playing | now-playing | 1 | 0 | 1 | 12109 | none | empty: needs macOS and Spotify |
| hamzafer openai-balance | openai-balance | 1 | 1 | 1 | 22226 | `/openai-balance` | text reply plus band "◆ OpenAI no admin key set" |
| hamzafer prayer-times | prayer-times | 1 | 1 | 1 | 19388 | none | band "set your latitude and longitude in /config" |
| hamzafer reels | reels | 1 | 1 | 1 | 14860 | `/reels` | text reply: needs Playwright |
| hamzafer replay-theater | replay-theater | 1 | 1 | 1 | 14306 | `/replay` | text reply "No edits to replay yet" |
| hamzafer review-watch | review-watch | 1 | 0 | 1 | 18229 | none | empty: needs a codex Bash call or a review subagent |
| hamzafer rulebook-guard | rulebook-guard | 1 | 0 | 1 | 12732 | none | empty: draws toasts only after an Edit or Write call |
| hamzafer session-saver | session-saver | 1 | 1 | 1 | 24570 | `/park` | text reply "Parked ... (no AI summary: reply was not JSON ...)" |
| hamzafer snake | snake | 1 | 1 | 1 | 19603 | `/snake` | pane "Make the pane bigger to play" |
| hamzafer switchboard | switchboard | 1 | 1 | 1 | 15139 | `/route` | pane "0 subagents · 0 switched · mode: auto · picker: off" |
| hamzafer token-weather | token-weather | 1 | 1 | 1 | 15591 | none | band "☀ Clear 22% of context 44k / 200k ... ❄ cache 5:00" |
| hamzafer where-am-i | where-am-i | 1 | 0 | 1 | 15225 | none | empty: needs a JSON answer from `$.model.complete` |

`results/summary.md` holds every crop, every parsed footprint and the branding check.

**Consistency (measured).**
- The `--all` batch made 24 candidate attempts and 23 completed.
- One playground replay-theater run failed with an E2B infrastructure error ("the connection to sandbox ... ended before the stream completed"), not a render error. Three replay-theater reruns all rendered and matched.
- Every completed candidate except skins produced the same masked crop across its runs. skins varies only in its own random word: "Done", "Settled" or "Finished in 16s".
- context-bar's crop hash, 7e090008e72b, also matched across two separate invocations, each with its own baseline.

**`$` calls the feed did not answer (measured).**
- `session.messages` (next-steps, session-saver) and `session.turns` (session-saver) passed through to the engine, which answered from the real one-turn transcript.
- No mod in the set called `session.model` or `session.version`, so the feed's answers to those two are untested.

### Feed gaps and engine behaviour (measured)

- **`session.measure` cannot be rewritten.** The engine refused with "next() passed an argument with a changed context (the envelope is the engine's ...)". usage-meter draws from this event, so it shows the engine's own cost ($0.25, priced from the canned tokens) instead of the scenario's $0.41, and it shows no rate limits.
- **No rate limits with an API key.** The engine never reports them in that mode. Adding `anthropic-ratelimit-unified-*` headers to the canned reply changed nothing. The type doc says `rateLimits` is "empty off a subscription".
- **Literal event names.** `on()` must get a string literal. A loop over names failed to load with "the event name passed to on() is not a string literal". `$` can be passed only to a top-level function declaration.
- **`on('*')` leaks the feed's name.** A wildcard hook also sits in `command.run`, so the engine credited the feed in the mod's reply ("scenario-feed+filetree: ..."). Literal per-event hooks fixed this.
- **Built-in plugins call `$` too.** `cc-plugin-diff` and `cc-plugin-agents-md` call `session.usage`, `session.messages`, `session.root` and `fs.ancestors`. The feed therefore answers only the mod, identified by its `plugin.json` name.
- **Plugin order.** The first `--plugin-dir` sits above the second, so the feed's answers reached every mod.
- **Breakdown mismatch.** A `session.usage({ breakdown })` breakdown is the engine's own. With Opus 4.8's 1M window, context-bar shows "44k of 1M · 4%" while the scenario says 22% of 200k.
- **One request per turn.** Claude Code made exactly one `POST /v1/messages` per turn with nonessential traffic disabled.
- **The seed works.** The seeded `.claude.json` was enough: no onboarding, trust or API-key screen appeared in any recording.

### Render time, start-up and memory (measured)

These are medians with the minimum and maximum, over 45 recordings at concurrency 6.

**Render wall time** was 17.0 s (12.1 to 32.7 s).
- The limiter is fixed waiting. Each recording waits for 2 s of quiet after start-up, after the turn and after each step, which adds 4 to 6 s.
- Other harness work: setup took 2.7 s, a cold `claude --version` took 1.2 s and `claude plugin validate` took 2.0 s.
- A production render without the version and validate calls would take about 13 s (inferred).
- skins is the outlier at 30 s because its turn takes 16 s. The likely cause is its update check to raw.githubusercontent.com timing out with the network off (inferred from its source).

**Claude Code start-up**, from launch to the last byte of the ready screen, was 2.0 s (1.4 to 3.1 s). In a fresh sandbox, a cold `claude --version` took 1123 ms and a warm one took 11 ms.

**Memory.** Claude Code's resident memory was 301 MB (294 to 340 MB; skins is the highest). Sandbox memory in use after the turn was 396 MB (377 to 443 MB) of 976 MB total, on 2 vCPUs and 1024 MB.

**Sandbox create** took 429 ms (125 to 678 ms).

### Template build and size

- **Build.** The whole spike template built in 34 s, from one build (E2B log: "Build finished, took 34s"). Only the base layer was cached. The Claude Code npm step took about 8.5 s and `@xterm/headless` about 1.8 s. This is a single sample.
- **Size (measured with `df`).**
  - The spike template's root filesystem uses 2022 MB.
  - The production snapshot `vyu32r2hpq6q92smes7j:default` uses 1317 MB.
  - The difference is 705 MB.
  - The Claude Code package alone is 485 MB (`du`). `@xterm/headless` is 2 MB.
- **Start-up**, from create to the first finished command, used 9 samples per template, alternating between the two.
  - The spike template took 576 ms (264 to 867 ms).
  - Production took 537 ms (472 to 863 ms).
  - The gap is smaller than the run-to-run spread, so there is no measurable difference.

### One template or two

Recommendation: **two aliases.**
- Status line renders keep today's template. Mods get a separate alias built from `renderTemplate()` plus Claude Code.
- Speed does not decide it. Start-up is the same within noise: 576 vs 537 ms, with overlapping ranges.
- Claude Code adds 705 MB of disk and about 300 MB of resident memory. That costs storage and build time, not render latency.
- Change coupling decides it. Every adopted Claude Code release means a template rebuild (ADR 0002). With one template, each rebuild also replaces the snapshot that every status line render uses, so each bump means re-reviewing the status line renderer.
- Two aliases cost one more reviewed snapshot ID.

### Privacy (measured)

`GET https://api.e2b.app/templates` with the team key (`spike/template-facts.ts`) returns `"public": false` for both templates:
- `nathanb92/statuslines-mod-spike`, template ID `fe4biv7fefspcuejk68f`.
- `nathanb92/statuslines-render-build`.

### `claude plugin validate --json` shape (measured on 30 mods and the feed; all 30 mods exit 0 with `success: true`)

```
{ success, strict, target,
  manifest: { file, type: "plugin", errors[], warnings[{path,message,code}], notes[], gatingHooks[] },
  contents: [ { file: ".../hooks/hooks.json", type: "hooks", errors[], warnings[],
                notes: [
                  "./register.tsx hooks: session.start, command.run{command=filetree}, ui.render{component=Pane, requestId=filetree}, ...",
                  "./register.tsx calls: $.clock.after, $.fs.list (via list, walkSize), $.session.cwd (via cwdOf), ...",
                  "./register.tsx answers its own command: command.run{command=filetree}",
                  "./register.tsx gating hook without .catch: tool.call",
                  "./register.tsx env reads: ...", "./register.tsx env writes: nothing",
                  "./register.tsx state reads: ...", "./register.tsx state writes: ...",
                  "./register.tsx surface modules: hooks/rows.tsx" ],
                gatingHooks: [ { module, pattern, hook, hasCatch } ] } ],
  advice: [] }
```

`ModFootprint = { events, calls }` holds, but the report does not provide it directly. It has to be parsed from the `notes` strings, which `spike/summarize.ts` `footprint()` does:
- Split the `hooks:` and `calls:` lists on top-level commas.
- Keep matcher suffixes such as `ui.render{component=AbovePrompt}`.
- Strip the `(via fn)` annotations from calls.

The manifest adds notes such as `types ./types/index.d.ts declares state: ...`. Errors look like `{ path: "modules../register.ts", message, code: null }`.

### Input steps (`ModInputSteps`)

The steps used were:
- Type a line and press Enter (`{ type: 'text', text }`), for 14 mods.
- Type text without Enter (`{ type: 'text', text, submit: false }`), for image-view.

Key presses and waits are implemented, but no mod needed them. `unknown[]` covers this.

Measured, some mods need more than steps:
- **A scripted tool call by the model:** both replay-theaters, both blast-radiuses, rulebook-guard and review-watch.
- **A real `$.model.complete` answer:** next-steps shows the canned chat reply as its step, where-am-i draws nothing, and session-saver reports "not JSON".
- **A wider, fullscreen terminal:** filetree.
- **`userConfig` values:** prayer-times needs a latitude and longitude.

### Branding (measured)

- No kept row in any of the 45 recordings contains the mascot glyphs, "Claude Code", "Anthropic", "claude.com" or "API Usage Billing". The check is a regex over every kept row.
- Those strings appear only in the baseline's top rows: the mascot, "Claude Code v2.1.296" and "Opus 4.8 · API Usage Billing". They match the baseline, so the LCS crop drops them.
- A positional diff keeps far more rows whenever a mod scrolls the transcript: snake 25 rows vs 12 with LCS, switchboard 22 vs 11, glance 19 vs 10.
- Kept engine rows are the `❯` prompt row and, once, the "⏵⏵ auto mode on" footer (image-view).
- context-bar draws a `◆` in Claude's accent color. That is a glyph, not a logo.

### Linux-specific findings

- **Node version (measured).** The E2B base has Node 20.9.0, and Claude Code 2.1.296 declares `node >=22`. npm warns `EBADENGINE` but installs, because the CLI is a native optional-dependency binary. `claude --version` passes the build assert.
- **No Keychain on Linux (measured).** A throwaway `HOME` and `CLAUDE_CONFIG_DIR` fully isolate the session, and no credential prompt appeared. Claude Code was never run on macOS.
- **macOS-only parts do nothing.** now-playing gave an empty crop (measured). md-preview's image mode and mission-control's Code tab need macOS Chrome and kitty graphics, so only their text views render (inferred from source; the text views were measured).
- **Shelling out works (measured).** Mods that call `ps`, `lsof`, `gh`, `git` or `node` ran fine. Their network parts fail soft.

### Recommended first batch (renders its real surface now)

| plugin | repo | path | SHA tested | input steps |
| --- | --- | --- | --- | --- |
| token-weather | anthropics/claude-code-playground | claude-code/mods/token-weather | 569c5283d9a0a7ee7938df85bb32e4f48cbb8c86 | none |
| context-bar | hamzafer/claude-code-mods | mods/context-bar | e687416b0f2df0f3ad7f4dfc2065eefe6bc17ea9 | none |
| usage-meter | hamzafer/claude-code-mods | mods/usage-meter | e687416b0f2df0f3ad7f4dfc2065eefe6bc17ea9 | none (cost only) |
| image-view | jarrodwatts/claude-image-view | (root) | b3c412bb6d167cafade79148e95f9114ee1aad7c | type `look at [Image #1]`, no Enter |
| skins | hellosverre/claude-skins | (root) | 0abe0f34ea9e351c529151f6729e018d7e4a2648 | none (mask its completion word) |
| next-steps | hamzafer/claude-code-mods | mods/next-steps | e687416b0f2df0f3ad7f4dfc2065eefe6bc17ea9 | none (better with a scripted `model.complete` answer) |
| agent-radar | hamzafer/claude-code-mods | mods/agent-radar | e687416b0f2df0f3ad7f4dfc2065eefe6bc17ea9 | `/radar` |
| md-preview | hamzafer/claude-code-mods | mods/md-preview | e687416b0f2df0f3ad7f4dfc2065eefe6bc17ea9 | `/md README.md` |
| mission-control | hamzafer/claude-code-mods | mods/mission-control | e687416b0f2df0f3ad7f4dfc2065eefe6bc17ea9 | `/mission` |
| switchboard | hamzafer/claude-code-mods | mods/switchboard | e687416b0f2df0f3ad7f4dfc2065eefe6bc17ea9 | `/route` |
| snake | hamzafer/claude-code-mods | mods/snake | e687416b0f2df0f3ad7f4dfc2065eefe6bc17ea9 | `/snake` |
| openai-balance | hamzafer/claude-code-mods | mods/openai-balance | e687416b0f2df0f3ad7f4dfc2065eefe6bc17ea9 | none |

Getting to about 20 needs these follow-ups:
- **A scripted tool turn:** both replay-theaters, both blast-radiuses, rulebook-guard and review-watch.
- **A `model.complete` answer from the feed:** where-am-i and session-saver.
- **`userConfig`:** prayer-times.
- **144 columns and fullscreen:** filetree.

The playground and hamzafer repositories both ship `token-weather`, `replay-theater` and `blast-radius` under the same plugin names, so pick one of each.

### Suggested changes

**#66 (Claude Code in the template).**
- Pin 2.1.296.
- Keep the `renderTemplate()` export so a second alias can extend the production definition without copying it.
- Accept the `EBADENGINE` warning on Node 20, or move the template to Node 22.
- The canned reply works as a plain-HTTP mode of the existing server on 127.0.0.1, run as `user`, with `ANTHROPIC_BASE_URL` pointing at it. TLS and root are not needed.
- Record the two-alias decision.
- The manual `validate --json` check returns the shape above.

**#40 (curation and import).**
- Derive the footprint by parsing `contents[].notes`, and consider storing `gatingHooks` too.
- The uniqueness check will reject the duplicate names across the two repositories.
- Plugin names differ from repo names: image-view, filetree, skins.
- Licences: playground is Apache-2.0, the other four are MIT.
- Fetching the tarball on the host and unpacking it in the sandbox worked for all 30 mods.
- `validate` takes about 2 s.

**#41 (production render script).**
- Crop by LCS over styled rows, not by position.
- Mask the turn-duration verb and the clock.
- Answer with literal per-event hooks, for the mod's own plugin name only.
- Merge `session.usage` over the engine's answer.
- Size the canned reply's tokens from the scenario, because `session.measure` cannot be fed.
- Replay inside the sandbox with `@xterm/headless`, serialize to SGR, then run `parseAnsi`.
- Treat a crop that holds only the prompt row as not rendered.
- Budget about 13 s per render. The fixed quiet windows dominate.
- Add these inputs: scripted tool-call turns, `model.complete` answers, per-mod terminal size and `userConfig`.
- Allow per-mod masking for skins.

### Deviations

- **`spike/REPORT.md` is not committed.** The harness refuses report files from subagents. The coordinator should commit this text as that file.
- **The headless terminal runs inside the sandbox.** `@xterm/headless` is installed in the spike template rather than added as a host dependency, because the scope allowed no `package.json` change.
- **The canned server is uploaded fresh on each run** instead of being read from the template, so it could change without a rebuild.
- **Mods are keyed by their `plugin.json` names**, not their repo names.
- **replay-theater got 3 extra runs** after the infrastructure error.
- **`template-build.json` is missing from the branch.** The script crashed writing it, after the build had succeeded. The build numbers come from the build log.
- **Skills skipped.** `deslop` and `no-comments` were not run, because this is throwaway prototype code. Biome is clean.

### Background tasks

All of them had finished before this report, so nothing needed stopping:
- the template build
- three batch runs
- the bounded wait loop
- the source-survey subagent

The tarball cache stays in `$TMPDIR/statuslines-mod-spike/tarballs`, outside the repo.
