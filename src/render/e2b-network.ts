/** E2B rejects `::/0`, so cover global unicast explicitly with `2000::/3` alongside
 * deny-all IPv4. Internal and link-local ranges are belt-and-suspenders. */
const NETWORK_DENY_OUT = [
  '0.0.0.0/0',
  '169.254.0.0/16',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '127.0.0.0/8',
  '2000::/3',
  '::1/128',
  'fc00::/7',
  'fe80::/10',
]

type NetworkOption =
  | { allowInternetAccess: false }
  | { network: { denyOut: string[]; allowOut: string[] } }

/** No hosts means network off. Declared hosts get deny-all egress plus exact allow entries. */
export function buildNetworkOption(networkHosts: string[]): NetworkOption {
  if (networkHosts.length === 0) return { allowInternetAccess: false }
  return { network: { denyOut: [...NETWORK_DENY_OUT], allowOut: [...networkHosts] } }
}
