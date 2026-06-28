import { describe, expect, it } from 'vitest'
import { buildNetworkOption } from '@/render/e2b-runner'

describe('buildNetworkOption', () => {
  it('keeps network fully off when there are no hosts', () => {
    expect(buildNetworkOption([])).toEqual({ allowInternetAccess: false })
  })

  it('denies all + internal v4/v6 ranges, allows declared hosts', () => {
    const opt = buildNetworkOption(['wttr.in', '*.espn.com'])
    if (!('network' in opt)) throw new Error('expected a network policy')
    expect(opt.network.allowOut).toEqual(['wttr.in', '*.espn.com'])
    // deny-all and every internal range present (IPv4 + IPv6)
    for (const cidr of [
      '0.0.0.0/0',
      '169.254.0.0/16',
      '10.0.0.0/8',
      '172.16.0.0/12',
      '192.168.0.0/16',
      '127.0.0.0/8',
      '::1/128',
      'fc00::/7',
      'fe80::/10',
    ]) {
      expect(opt.network.denyOut).toContain(cidr)
    }
  })
})
