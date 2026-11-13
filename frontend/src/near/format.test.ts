import { describe, expect, it } from 'vitest'
import { isValidAccountId, nearToYocto, shortAccount, yoctoToNear } from './format'

describe('NEAR format utilities', () => {
  it('accepts named and implicit accounts', () => {
    expect(isValidAccountId('alice.testnet')).toBe(true)
    expect(isValidAccountId('a'.repeat(64))).toBe(true)
    expect(isValidAccountId('Alice Testnet')).toBe(false)
    expect(isValidAccountId('a')).toBe(false)
  })

  it('converts NEAR amounts without floating point arithmetic', () => {
    expect(nearToYocto('1.25')).toBe('1250000000000000000000000')
    expect(yoctoToNear('1250000000000000000000000')).toBe('1.25')
    expect(() => nearToYocto('1.0000000000000000000000001')).toThrow()
  })

  it('shortens long identifiers only', () => {
    expect(shortAccount('alice.testnet')).toBe('alice.testnet')
    expect(shortAccount('a'.repeat(64), 4)).toBe('aaaa…aaaa')
  })
})
