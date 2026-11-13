import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { SavedContract, SavedWallet } from './ForgeDataContext'

export async function synchronizeSavedItems(
  client: SupabaseClient<Database>,
  userId: string,
  localWallets: SavedWallet[],
  localContracts: SavedContract[],
) {
  if (localWallets.length) {
    const { error } = await client.from('saved_wallets').upsert(localWallets.map((wallet) => ({
      user_id: userId,
      network: 'testnet',
      account_id: wallet.accountId,
      label: wallet.label || null,
    })), { onConflict: 'user_id,network,account_id' })
    if (error) throw error
  }
  if (localContracts.length) {
    const { error } = await client.from('saved_contracts').upsert(localContracts.map((contract) => ({
      user_id: userId,
      network: 'testnet',
      catalog_key: contract.catalogKey,
      contract_account_id: contract.contractAccountId || null,
      label: contract.label,
    })), { onConflict: 'user_id,network,catalog_key' })
    if (error) throw error
  }

  const [walletResult, contractResult] = await Promise.all([
    client.from('saved_wallets').select('account_id,label').eq('network', 'testnet').order('created_at'),
    client.from('saved_contracts').select('catalog_key,label,contract_account_id').eq('network', 'testnet').order('created_at'),
  ])
  if (walletResult.error) throw walletResult.error
  if (contractResult.error) throw contractResult.error

  return {
    wallets: (walletResult.data || []).map((row) => ({ accountId: row.account_id, label: row.label })),
    contracts: (contractResult.data || []).map((row) => ({ catalogKey: row.catalog_key, label: row.label, contractAccountId: row.contract_account_id })),
  }
}
