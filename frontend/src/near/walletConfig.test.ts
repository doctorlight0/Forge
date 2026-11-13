import { describe, expect, it } from 'vitest'
import { APP_NAME, BACKEND_URL, ESCROW_CONTRACT_ID, EXPLORER_ACCOUNT_URL, EXPLORER_TX_URL, TESTNET } from '../config'

describe('Forge network/config (Testnet-only)', () => {
  it('locks core endpoints to NEAR Testnet', () => {
    expect(TESTNET.networkId).toBe('testnet')
    expect(TESTNET.nodeUrl).toContain('testnet')
    expect(TESTNET.walletUrl).toContain('testnet')
    expect(TESTNET.helperUrl).toContain('testnet')
    expect(TESTNET.explorerUrl).toContain('testnet')
    expect(TESTNET.indexerBaseUrl).toContain('testnet')
    expect(TESTNET.indexerBaseUrl).toMatch(/\/v3$/)
  })

  it('uses safe defaults for wallet/modal config', () => {
    expect(APP_NAME).toBe('Forge')
    expect(typeof BACKEND_URL).toBe('string')
    expect(EXPLORER_TX_URL('abc')).toContain('/txns/abc')
    expect(EXPLORER_ACCOUNT_URL('alice.testnet')).toContain('/address/alice.testnet')
    // Escrow contract may be unset in local dev; UI must treat missing config as non-executable.
    expect(ESCROW_CONTRACT_ID === null || typeof ESCROW_CONTRACT_ID === 'string').toBe(true)
  })
})
