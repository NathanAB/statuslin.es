import { resolve4, resolve6 } from 'node:dns/promises'
import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_USAGE_HOST,
  ANTHROPIC_USAGE_PREVIEW_TOKEN,
  ANTHROPIC_USAGE_URL,
} from '@/render/anthropic-usage-mock'
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
    const scenario = SCENARIOS.find((s) => s.key === 'near-full')
    if (!scenario) throw new Error('near-full scenario missing')
    const res = await new E2BSandboxRunner().render({ script, interpreter: 'bash', scenario })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toContain('Opus 4.8') // jq read the model
    expect(res.stdout).toContain('91% used') // jq read the context %
    expect(res.stdout).toContain('9% left') // bc computed 100 - 91
    expect(res.stdout).toContain('$4.12') // jq read the cost
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

  const usageScenario = SCENARIOS.find((scenario) => scenario.key === 'fresh-session')
  if (!usageScenario) throw new Error('fresh-session scenario missing')
  const populatedUsageScenario = SCENARIOS.find((scenario) => scenario.key === 'near-full')
  if (!populatedUsageScenario) throw new Error('near-full scenario missing')

  it.each([
    {
      interpreter: 'bash' as const,
      scenario: usageScenario,
      expected: '18/9/15',
      script: [
        '#!/usr/bin/env bash',
        'cat >/dev/null',
        'token=$(jq -r .claudeAiOauth.accessToken ~/.claude/.credentials.json)',
        `curl -fsS -H "Authorization: Bearer $token" ${ANTHROPIC_USAGE_URL} | jq -r '"\\(.limits[0].percent)/\\(.limits[1].percent)/\\(.limits[2].percent)"'`,
      ].join('\n'),
    },
    {
      interpreter: 'python' as const,
      scenario: populatedUsageScenario,
      expected: '88/61/15',
      script: [
        'import json, os, sys, urllib.request',
        'json.load(sys.stdin)',
        `request = urllib.request.Request("${ANTHROPIC_USAGE_URL}", headers={"Authorization": "Bearer " + os.environ["CLAUDE_CODE_OAUTH_TOKEN"]})`,
        'with urllib.request.urlopen(request, timeout=5) as response:',
        '    data = json.load(response)',
        'print("%s/%s/%s" % (data["five_hour"]["utilization"], data["seven_day"]["utilization"], data["seven_day_fable"]["utilization"]))',
      ].join('\n'),
    },
    {
      interpreter: 'node' as const,
      scenario: usageScenario,
      expected: '18/9/15',
      script: [
        "let input = ''",
        "process.stdin.setEncoding('utf8')",
        "process.stdin.on('data', (chunk) => { input += chunk })",
        "process.stdin.on('end', async () => {",
        '  JSON.parse(input)',
        `  const response = await fetch('${ANTHROPIC_USAGE_URL}', { headers: { Authorization: 'Bearer ' + process.env.CLAUDE_CODE_OAUTH_TOKEN } })`,
        "  if (!response.ok) throw new Error('HTTP ' + response.status)",
        '  const data = await response.json()',
        "  console.log(data.limits.map((item) => item.percent).join('/'))",
        '})',
      ].join('\n'),
    },
  ])('serves certificate-verified usage data to $interpreter', async ({
    interpreter,
    script,
    scenario,
    expected,
  }) => {
    const result = await new E2BSandboxRunner().render({
      script,
      interpreter,
      scenario,
      networkHosts: [ANTHROPIC_USAGE_HOST],
      readsClaudeToken: true,
    })

    expect(result.exitCode, result.stderr).toBe(0)
    expect(result.stderr).toBe('')
    expect(result.stdout.trim()).toBe(expected)
  }, 60_000)

  it('fails closed against bad requests, mutation, process signals, and public-IP bypass', async () => {
    const publicAnthropicIps = await resolve4(ANTHROPIC_USAGE_HOST)
    const publicAnthropicIpv6s = await resolve6(ANTHROPIC_USAGE_HOST)
    if (publicAnthropicIps.length === 0 || publicAnthropicIpv6s.length === 0) {
      throw new Error('could not resolve public Anthropic IPv4 and IPv6 addresses')
    }
    const bypassProbes = [
      ...publicAnthropicIps.map(
        (ip, index) =>
          `bypass_v4_${index}=$(curl -sS --max-time 3 --connect-to ${ANTHROPIC_USAGE_HOST}:443:${ip}:443 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" ${ANTHROPIC_USAGE_URL} || true)`,
      ),
      ...publicAnthropicIpv6s.map(
        (ip, index) =>
          `bypass_v6_${index}=$(curl -g -sS --max-time 3 --connect-to '${ANTHROPIC_USAGE_HOST}:443:[${ip}]:443' -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" ${ANTHROPIC_USAGE_URL} || true)`,
      ),
    ]
    const bypassOutput = [
      ...publicAnthropicIps.map((_, index) => `bypass_v4_${index}=$bypass_v4_${index}`),
      ...publicAnthropicIpv6s.map((_, index) => `bypass_v6_${index}=$bypass_v6_${index}`),
    ].join(' ')
    const script = [
      '#!/usr/bin/env bash',
      'cat >/dev/null',
      `token=${ANTHROPIC_USAGE_PREVIEW_TOKEN}`,
      `auth=$(curl -sS --max-time 3 -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer wrong' ${ANTHROPIC_USAGE_URL})`,
      `path=$(curl -sS --max-time 3 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" https://${ANTHROPIC_USAGE_HOST}/v1/messages)`,
      `method=$(curl -sS --max-time 3 -o /dev/null -w '%{http_code}' -X POST -H "Authorization: Bearer $token" ${ANTHROPIC_USAGE_URL})`,
      `unsupported=$(curl -sS --max-time 3 -o /dev/null -w '%{http_code}' -X TRACE -H "Authorization: Bearer $token" ${ANTHROPIC_USAGE_URL})`,
      `other=$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' https://example.com/)`,
      ...bypassProbes,
      'test ! -w /etc/hosts && hosts=locked || hosts=writable',
      'test ! -r /opt/statuslines/anthropic-usage/server.key && key=locked || key=readable',
      'test ! -r /run/statuslines/anthropic-usage-response.json && response=locked || response=readable',
      'for asset in /opt/statuslines/anthropic-usage/server.py /opt/statuslines/anthropic-usage/server.crt /opt/statuslines/anthropic-usage/server.key /usr/local/share/ca-certificates/statuslines-anthropic-usage-ca.crt /run/statuslines/anthropic-usage-response.json; do test ! -w "$asset" || { echo "writable asset: $asset" >&2; exit 91; }; done',
      "pid=$(pgrep -fo '/opt/statuslines/anthropic-usage/server.py' || true)",
      'server_uid=$(ps -o uid= -p "$pid" | xargs)',
      'if [ -n "$pid" ] && ! kill "$pid" 2>/dev/null; then process=locked; else process=signalable; fi',
      `still=$(curl -sS --max-time 3 -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" ${ANTHROPIC_USAGE_URL})`,
      `printf "auth=%s path=%s method=%s unsupported=%s other=%s ${bypassOutput} hosts=%s key=%s response=%s server_uid=%s process=%s still=%s" "$auth" "$path" "$method" "$unsupported" "$other" "$hosts" "$key" "$response" "$server_uid" "$process" "$still"`,
    ].join('\n')
    const result = await new E2BSandboxRunner().render({
      script,
      interpreter: 'bash',
      scenario: usageScenario,
      networkHosts: [ANTHROPIC_USAGE_HOST, 'example.com'],
      readsClaudeToken: true,
    })

    expect(result.exitCode, result.stderr).toBe(0)
    expect(result.stdout).toContain('auth=401')
    expect(result.stdout).toContain('path=404')
    expect(result.stdout).toContain('method=404')
    expect(result.stdout).toContain('unsupported=404')
    expect(result.stdout).toContain('other=200')
    for (let index = 0; index < publicAnthropicIps.length; index++) {
      expect(result.stdout).toContain(`bypass_v4_${index}=000`)
    }
    for (let index = 0; index < publicAnthropicIpv6s.length; index++) {
      expect(result.stdout).toContain(`bypass_v6_${index}=000`)
    }
    expect(result.stdout).toContain('hosts=locked')
    expect(result.stdout).toContain('key=locked')
    expect(result.stdout).toContain('response=locked')
    expect(result.stdout).toContain('server_uid=65534')
    expect(result.stdout).toContain('process=locked')
    expect(result.stdout).toContain('still=200')
  }, 60_000)
})
