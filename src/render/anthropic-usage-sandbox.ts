import {
  ANTHROPIC_USAGE_CA_PATH,
  ANTHROPIC_USAGE_HOST,
  ANTHROPIC_USAGE_PREVIEW_TOKEN,
  ANTHROPIC_USAGE_URL,
  buildAnthropicUsageResponse,
} from './anthropic-usage-mock'
import {
  SANDBOX_ANTHROPIC_USAGE_CERT_PATH,
  SANDBOX_ANTHROPIC_USAGE_KEY_PATH,
  SANDBOX_ANTHROPIC_USAGE_SERVER_DEST,
} from './e2b-template'

const RESPONSE_STAGING_PATH = '/tmp/statuslines-usage-response.json'
const RESPONSE_PATH = '/run/statuslines/anthropic-usage-response.json'
const CREDENTIALS_PATH = '/home/user/.claude/.credentials.json'
const SERVER_LOG_PATH = '/tmp/statuslines-anthropic-usage-server.log'
const CLAUDE_CODE_OAUTH_TOKEN_ENV = 'CLAUDE_CODE_OAUTH_TOKEN'
const NODE_EXTRA_CA_CERTS_ENV = 'NODE_EXTRA_CA_CERTS'

/** Add fixed mock values after scenario env filtering, so scenarios cannot override them. */
export function withAnthropicUsageEnv(env: Record<string, string>): Record<string, string> {
  return {
    ...env,
    [CLAUDE_CODE_OAUTH_TOKEN_ENV]: ANTHROPIC_USAGE_PREVIEW_TOKEN,
    [NODE_EXTRA_CA_CERTS_ENV]: ANTHROPIC_USAGE_CA_PATH,
  }
}

/** Trusted files written before submitted code starts. Neither value contains a real credential. */
export function anthropicUsageMockFiles(
  stdin: Record<string, unknown>,
  nowMs = Date.now(),
): { path: string; data: string }[] {
  return [
    {
      path: RESPONSE_STAGING_PATH,
      data: JSON.stringify(buildAnthropicUsageResponse(stdin, nowMs)),
    },
    {
      path: CREDENTIALS_PATH,
      data: JSON.stringify({
        claudeAiOauth: { accessToken: ANTHROPIC_USAGE_PREVIEW_TOKEN },
      }),
    },
  ]
}

/** Root-only setup for the local HTTPS endpoint. All interpolated values are fixed constants. */
export function anthropicUsageSetupScript(): string {
  return [
    'install -d -o root -g root -m 0700 /run/statuslines',
    `install -o root -g root -m 0400 ${RESPONSE_STAGING_PATH} ${RESPONSE_PATH}`,
    `rm -f ${RESPONSE_STAGING_PATH}`,
    `chown user:user ${CREDENTIALS_PATH}`,
    `chmod 0600 ${CREDENTIALS_PATH}`,
    `chmod 0444 ${ANTHROPIC_USAGE_CA_PATH}`,
    `grep -qF '127.0.0.1 ${ANTHROPIC_USAGE_HOST}' /etc/hosts || printf '127.0.0.1 ${ANTHROPIC_USAGE_HOST}\\n' >> /etc/hosts`,
    `(nohup python3 ${SANDBOX_ANTHROPIC_USAGE_SERVER_DEST} --cert ${SANDBOX_ANTHROPIC_USAGE_CERT_PATH} --key ${SANDBOX_ANTHROPIC_USAGE_KEY_PATH} --response ${RESPONSE_PATH} --token ${ANTHROPIC_USAGE_PREVIEW_TOKEN} >${SERVER_LOG_PATH} 2>&1 &)`,
    `for attempt in 1 2 3 4 5 6 7 8 9 10; do curl -fsS --max-time 1 --cacert ${ANTHROPIC_USAGE_CA_PATH} --resolve ${ANTHROPIC_USAGE_HOST}:443:127.0.0.1 -H 'Authorization: Bearer ${ANTHROPIC_USAGE_PREVIEW_TOKEN}' ${ANTHROPIC_USAGE_URL} >/dev/null && exit 0; sleep 0.1; done; cat ${SERVER_LOG_PATH} >&2; exit 1`,
  ].join(' && ')
}
