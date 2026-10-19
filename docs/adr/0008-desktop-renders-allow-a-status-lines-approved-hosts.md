# Desktop renders allow a status line's approved hosts

Accepted 2026-10-18. Before this, `render:status-line-desktop` skipped every status line with declared network hosts, because each Desktop sandbox starts offline (`withTemplateSandbox` passes `buildNetworkOption([])`). Those pages kept the "In Claude Desktop?" hint. This decision records them by giving the Desktop recording sandbox the same egress rule the terminal render already uses: deny everything, then allow exactly the hosts the admin approved for that status line.

## What changes

1. **Network.** `withTemplateSandbox` takes a host list (default `[]`). `withRecordingDesktop` passes the status line's hosts through `externalNetworkHosts`, so the mocked `api.anthropic.com` stays off the list. The baseline, the analysis sandbox and every mod-only recording stay offline.
2. **Anthropic's own hosts are never real egress in Desktop.** If a status line declares `api.anthropic.com`, `claude.ai` or any other `*.anthropic.com` / `*.claude.ai` host and the usage mock doesn't cover it, the script skips it (`skipped <slug>: needs an Anthropic host; no Desktop shot`), and the recorder refuses it before opening a sandbox. Otherwise Desktop and its engine, which hold a fake key, could reach the real Anthropic API.
3. **Usage mock.** The Desktop template already includes it: Desktop is built on the mod template, which is built on the status line template. The usage server, its root-only cert and key, the trusted CA and the read-only `/etc/hosts` are all there, so the template needs no rebuild. When `shouldMockAnthropicUsage` holds, `withRecordingDesktop` uploads `anthropicUsageMockFiles` and runs `anthropicUsageSetupScript()` as root (15-second timeout, as in the terminal render), after the other uploads and before Desktop boots. That keeps the current rule that nothing reaches the sandbox once mod code can run. The `/etc/hosts` entry also sends Desktop's own `api.anthropic.com` calls to the loopback mock, which is what we want.
4. **Mock env, scoped to the script.** `CLAUDE_CODE_OAUTH_TOKEN` must not go in Desktop's env: the engine inherits it and would try OAuth instead of the gateway. Instead it goes in the `statusLine` command we write in `desktopSessionFiles`, which statusline-anywhere runs through `sh -c`:
   `cat | env -u CLAUDE_CONFIG_DIR CLAUDE_CODE_OAUTH_TOKEN=… NODE_EXTRA_CA_CERTS=… bash <script>`
   The credentials file goes to `/home/user/.claude/.credentials.json`, which is the script's `~` because Desktop keeps the real home. The engine reads its config from `session-home/.claude`, so it never sees that file. `-u CLAUDE_CONFIG_DIR` undoes the session-home path the engine passes down, so a script looks for credentials where a real Desktop user's script would.
5. **Script.** The network skip becomes the Anthropic-host skip from point 2, and the recording request carries `networkHosts` and `readsClaudeToken`.

## Why this is safe enough

- **Only published scripts run here.** The Desktop script records `status='published'` versions, which a human has reviewed. The terminal render opens the same hosts before a submission is published (it's `held` until the admin clicks "Run network preview"). So this exposes less than what already ships.
- **Nothing in the sandbox is worth stealing.** It holds a fake API key, a fake OAuth token, the canned model and the sample workspace. No real credential is ever uploaded.
- **Every process can reach the hosts, not just the script.** That includes Desktop (Anthropic's pinned `.deb`), its engine and statusline-anywhere (our own mod, pinned and reviewed). Managed settings already turn off telemetry, updates and non-essential services, and E2B enforces the allow list, so even if they tried, the only places they could reach are the third-party hosts the status line uses. Point 2 keeps Anthropic's hosts out.
- **What gets larger.** The sandbox lives up to 15 minutes instead of 45 seconds, and statusline-anywhere reruns the script on each refresh, so a third-party host gets more requests from E2B's IPs. The sandbox lifetime cap bounds this, and the operator runs the script by hand.
- **Inbound is unchanged.** `allowOut` and `denyOut` only govern outbound traffic. `secure: true` stays.

`SECURITY.md`'s trust model says a script that declares network hosts can reach only those hosts, in the terminal render and in the Claude Desktop render.

## Considered options

- **Don't do it.** Networked status lines keep the hint. This is the safe default if the network delta above isn't acceptable.
- **Pre-render the output, keep Desktop offline.** Run the script in the existing network sandbox, then have Desktop's `statusLine` print the stored output. The network rules stay as they are, but the stdin statusline-anywhere sends is built inside the sandbox from the engine and the feed, so getting it exactly would take a third sandbox to capture it first. The shot would also stop proving that the script runs under statusline-anywhere. That's more moving parts and a less faithful preview.

## How it gets verified

- Unit tests (red first): the network option reaches `Sandbox.create` for a networked status line and stays offline for the baseline and analysis sandboxes. The command prefix scopes the mock env. Anthropic hosts are skipped. The mock setup runs before Desktop boots.
- One real E2B recording of a published networked status line, plus one that reads the Claude token. Check that Desktop still boots into gateway mode with the network on, and that the band shows the fetched or mocked data.
