import { Sandbox } from 'e2b'
import { describe, expect, it } from 'vitest'
import { requireEnv } from '@/lib/env'
import { E2B_TEMPLATE_NAME } from '@/render/e2b-template'

// Real-sandbox integration: hits live E2B (creates sandboxes, costs credits), so it's
// OPT-IN — only runs under `RUN_E2B=1`. The routine `bun run check` and git hooks stay
// fast + offline and never touch E2B.
//
// Run with:
//   RUN_E2B=1 bun --bun vitest run test/render/e2b-network.integration.test.ts
//
// These assert the two safety properties verified against live E2B before the feature shipped:
//   1. The external allowlist confines egress: a declared host is reachable, others are blocked.
//   2. The reachable 169.254.169.254 is Firecracker MMDS, not cloud metadata — it exposes no
//      cloud credentials (AWS IMDS paths 404, GCP token path returns no token).
const run = process.env.RUN_E2B === '1' ? describe : describe.skip

// Internal ranges we deny in production as belt-and-suspenders (E2B denies them by default too).
const INTERNAL_DENY = [
  '0.0.0.0/0',
  '169.254.0.0/16',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
]

run('E2B network allowlist (integration, needs E2B_API_KEY)', () => {
  it('confines egress to the allowlist: a declared host is reachable, others are blocked', async () => {
    const apiKey = requireEnv('E2B_API_KEY')
    const sandbox = await Sandbox.create(E2B_TEMPLATE_NAME, {
      apiKey,
      network: { denyOut: [...INTERNAL_DENY], allowOut: ['wttr.in'] },
      timeoutMs: 45_000,
    })
    try {
      const allowed = await sandbox.commands.run(
        `curl -s -m 10 -o /dev/null -w '%{http_code}' https://wttr.in/?format=3`,
        { timeoutMs: 12_000, user: 'user' },
      )
      const blocked = await sandbox.commands.run(
        `curl -s -m 10 -o /dev/null -w '%{http_code}' https://example.com/ || true`,
        { timeoutMs: 12_000, user: 'user' },
      )
      // Allowed host answers; non-allowlisted host cannot connect (curl reports 000).
      expect(allowed.stdout).toContain('200')
      expect(blocked.stdout).not.toContain('200')
      expect(blocked.stdout).toContain('000')
    } finally {
      await sandbox.kill().catch(() => {})
    }
  }, 60_000)

  it('the metadata IP is harmless Firecracker MMDS — no cloud credentials reachable', async () => {
    const apiKey = requireEnv('E2B_API_KEY')
    const sandbox = await Sandbox.create(E2B_TEMPLATE_NAME, {
      apiKey,
      network: { denyOut: ['0.0.0.0/0', '169.254.0.0/16'], allowOut: ['wttr.in'] },
      timeoutMs: 45_000,
    })
    try {
      // GCP metadata: a real GCP IMDS returns instance data for this header. Firecracker MMDS
      // returns its own auth error instead, proving the cloud metadata is shadowed/unreachable.
      const gcp = await sandbox.commands.run(
        `curl -s -m 6 -H 'Metadata-Flavor: Google' 'http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token' || true`,
        { timeoutMs: 8000, user: 'user' },
      )
      // AWS IMDSv2: even with a valid MMDS session token, the IAM credentials path must not exist.
      const aws = await sandbox.commands.run(
        [
          'T=$(curl -s -m6 -X PUT -H "X-aws-ec2-metadata-token-ttl-seconds: 60" http://169.254.169.254/latest/api/token)',
          'curl -s -m6 -w " HTTP:%{http_code}" -H "X-aws-ec2-metadata-token: $T" http://169.254.169.254/latest/meta-data/iam/security-credentials/ || true',
        ].join('\n'),
        { timeoutMs: 10_000, user: 'user' },
      )
      // No GCP access token is returned, and no AWS IAM credentials exist (404 from MMDS).
      expect(gcp.stdout).not.toContain('access_token')
      expect(aws.stdout).not.toContain('AccessKeyId')
      expect(aws.stdout).toContain('HTTP:404')
    } finally {
      await sandbox.kill().catch(() => {})
    }
  }, 60_000)
})
