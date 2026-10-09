import { Sandbox } from 'e2b'
import { e2bApiKey } from './env'
import { SPIKE_TEMPLATE } from './template'

const sandbox = await Sandbox.create(SPIKE_TEMPLATE, {
  apiKey: e2bApiKey(),
  allowInternetAccess: false,
  timeoutMs: 120_000,
})
try {
  const r = await sandbox.commands.run(
    'claude --version; claude plugin validate --help; claude plugin --help',
    // biome-ignore lint/style/useNamingConvention: env var name.
    { timeoutMs: 60_000, envs: { HOME: '/tmp/cli-home' } },
  )
  process.stdout.write(r.stdout)
} finally {
  await sandbox.kill().catch(() => {})
}
