import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { synchronizeSavedItems } from './forgeCloudSync'

describe('Forge cloud synchronization', () => {
  it('only returns synchronized after remote upserts and read-back succeed', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    const from = vi.fn((table: string) => ({
      upsert,
      select: () => ({
        eq: () => ({
          order: async () => table === 'saved_wallets'
            ? { data: [{ account_id: 'alice.testnet', label: 'Alice' }], error: null }
            : { data: [{ catalog_key: 'escrow', label: 'Escrow', contract_account_id: null }], error: null },
        }),
      }),
    }))
    const client = { from } as unknown as SupabaseClient<Database>

    await expect(synchronizeSavedItems(
      client,
      'user-1',
      [{ accountId: 'alice.testnet', label: 'Alice' }],
      [{ catalogKey: 'escrow', label: 'Escrow' }],
    )).resolves.toEqual({
      wallets: [{ accountId: 'alice.testnet', label: 'Alice' }],
      contracts: [{ catalogKey: 'escrow', label: 'Escrow', contractAccountId: null }],
    })
    expect(upsert).toHaveBeenCalledTimes(2)
  })

  it('does not claim success when a cloud table is missing', async () => {
    const missing = { code: 'PGRST205', message: 'table missing from schema cache' }
    const client = {
      from: () => ({
        upsert: async () => ({ error: missing }),
      }),
    } as unknown as SupabaseClient<Database>

    await expect(synchronizeSavedItems(client, 'user-1', [{ accountId: 'alice.testnet' }], []))
      .rejects.toEqual(missing)
  })
})
