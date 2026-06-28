import { describe, expect, it } from 'vitest'
import { E2BSandboxRunner } from '@/render/e2b-runner'
import { SCENARIOS } from '@/render/scenarios'

// Real-sandbox integration: hits live E2B (creates sandboxes, costs credits), so it's
// OPT-IN — only runs under `bun run test:e2b` (RUN_E2B=1). The routine `bun run check`
// and the git hooks stay fast + offline and never touch E2B.
const run = process.env.RUN_E2B === '1' ? describe : describe.skip

run('E2BSandboxRunner (integration, needs E2B_API_KEY)', () => {
  it('renders a bash statusline and reports the model', async () => {
    const script = `#!/usr/bin/env bash\njson=$(cat); echo "model: $(echo "$json" | python3 -c 'import sys,json;print(json.load(sys.stdin)["model"]["display_name"])')"`
    const scenario = SCENARIOS.find((s) => s.key === 'clean-main')
    if (!scenario) throw new Error('clean-main scenario missing')
    const res = await new E2BSandboxRunner().render({ script, interpreter: 'bash', scenario })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('Opus 4.8')
  }, 60_000)

  it('renders a jq + bc statusline faithfully (custom template bakes both in)', async () => {
    // The whole reason for the custom template: jq + bc are absent from the E2B base image and
    // the sandbox has no network to install them. This is the script shape Claude Code's own
    // /statusline generator emits — jq to read the stdin JSON, bc for arithmetic. On the base
    // image jq/bc are "command not found" and stdout is empty; on the custom template it renders.
    const script = [
      '#!/usr/bin/env bash',
      'json=$(cat)',
      'model=$(echo "$json" | jq -r ".model.display_name")',
      'pct=$(echo "$json" | jq -r ".context_window.used_percentage")',
      'cost=$(echo "$json" | jq -r ".cost.total_cost_usd")',
      'remaining=$(echo "100 - $pct" | bc)',
      'printf "%s | %s%% used (%s%% left) | \\$%s" "$model" "$pct" "$remaining" "$cost"',
    ].join('\n')
    const scenario = SCENARIOS.find((s) => s.key === 'costly-full')
    if (!scenario) throw new Error('costly-full scenario missing')
    const res = await new E2BSandboxRunner().render({ script, interpreter: 'bash', scenario })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('Opus 4.8') // jq read the model
    expect(res.stdout).toContain('91% used') // jq read the context %
    expect(res.stdout).toContain('9% left') // bc computed 100 - 91
    expect(res.stdout).toContain('$3.88') // jq read the cost
  }, 60_000)

  it('blocks network egress (allowInternetAccess: false)', async () => {
    // E2B's firewall lets a TCP connect APPEAR to succeed even when egress is denied, so we
    // must verify at the application level: actually try to READ data over HTTPS. With the
    // network off, no data flows — the request errors/times out — so we print NET_BLOCKED.
    // (Trace-based detection of the attempt lands in Slice 3/6 with the strace template.)
    const probe = [
      'import urllib.request',
      'try:',
      '    urllib.request.urlopen("https://1.1.1.1", timeout=3).read(16)',
      '    print("NET_OK")',
      'except Exception:',
      '    print("NET_BLOCKED")',
    ].join('\n')
    const script = `#!/usr/bin/env bash\ncat >/dev/null\npython3 -c '${probe}'`
    const scenario = SCENARIOS.find((s) => s.key === 'clean-main')
    if (!scenario) throw new Error('clean-main scenario missing')
    const res = await new E2BSandboxRunner().render({ script, interpreter: 'bash', scenario })
    expect(res.stdout).toContain('NET_BLOCKED')
    expect(res.stdout).not.toContain('NET_OK')
  }, 60_000)

  it('bakes in jq 1.7+ (apt jq 1.6 has a guard-defeating `-e` bug)', async () => {
    // jq 1.6 returns exit 0 for `echo "" | jq -e .`, while 1.7+ returns nonzero. Scripts use that
    // exit code to guard a "config file missing → fall back to {}" path; on 1.6 the guard fails and
    // a later `jq --argjson cfg ""` aborts with empty output, rendering the statusline blank. The
    // template pins the official 1.7.1 binary so the guard works — assert we never regress to 1.6.
    const script = '#!/usr/bin/env bash\ncat >/dev/null\njq --version'
    const scenario = SCENARIOS.find((s) => s.key === 'clean-main')
    if (!scenario) throw new Error('clean-main scenario missing')
    const res = await new E2BSandboxRunner().render({ script, interpreter: 'bash', scenario })
    expect(res.exitCode).toBe(0)
    const m = res.stdout.trim().match(/^jq-(\d+)\.(\d+)/)
    expect(m).not.toBeNull()
    const major = Number(m?.[1])
    const minor = Number(m?.[2])
    expect(major > 1 || (major === 1 && minor >= 7)).toBe(true)
  }, 60_000)

  it('seeds a valid ~/.claude/settings.json so settings-reading statuslines render', async () => {
    // A real Claude Code install always has this file; many statuslines read config out of it. The
    // sandbox home is otherwise empty, so the template seeds a comprehensive, valid settings file.
    const script = [
      '#!/usr/bin/env bash',
      'cat >/dev/null',
      'jq -e . "$HOME/.claude/settings.json" >/dev/null 2>&1 && echo SETTINGS_VALID || echo SETTINGS_BAD',
    ].join('\n')
    const scenario = SCENARIOS.find((s) => s.key === 'clean-main')
    if (!scenario) throw new Error('clean-main scenario missing')
    const res = await new E2BSandboxRunner().render({ script, interpreter: 'bash', scenario })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('SETTINGS_VALID')
  }, 60_000)
})
