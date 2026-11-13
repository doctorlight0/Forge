import { describe, expect, it } from 'vitest'
import { readLocalItems, writeLocalItems, type StorageLike } from './localSavedItems'

describe('browser saved-item fallback', () => {
  it('round-trips saved data without a cloud session', () => {
    const values = new Map<string, string>()
    const storage: StorageLike = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) },
    }
    expect(writeLocalItems(storage, 'wallets', [{ accountId: 'alice.testnet' }])).toBe(true)
    expect(readLocalItems<{ accountId: string }>(storage, 'wallets')).toEqual([{ accountId: 'alice.testnet' }])
  })

  it('reports a rejected write and does not erase the previous local value', () => {
    const storage: StorageLike = {
      getItem: () => JSON.stringify([{ accountId: 'kept.testnet' }]),
      setItem: () => { throw new Error('quota exceeded') },
    }
    expect(writeLocalItems(storage, 'wallets', [])).toBe(false)
    expect(readLocalItems<{ accountId: string }>(storage, 'wallets')).toEqual([{ accountId: 'kept.testnet' }])
  })
})
