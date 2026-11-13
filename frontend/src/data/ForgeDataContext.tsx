import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { classifySupabaseFailure, supabase, supabaseConfigurationError, verifySupabaseConnection, type SupabaseFailure, type SupabaseFailureKind } from '../lib/supabase'
import { synchronizeSavedItems } from './forgeCloudSync'
import { readLocalItems, writeLocalItems } from './localSavedItems'

export type SavedWallet = { accountId: string; label?: string | null }
export type SavedContract = { catalogKey: string; label: string; contractAccountId?: string | null }
export type SyncStatus = 'connecting' | 'synced' | 'local' | 'network' | 'authentication' | 'schema' | 'authorization' | 'error'
export type SessionStatus = 'checking' | 'authenticated' | 'none' | 'error'

type ForgeDataValue = {
  wallets: SavedWallet[]
  contracts: SavedContract[]
  status: SyncStatus
  statusLabel: string
  statusMessage: string
  sessionStatus: SessionStatus
  isWalletSaved: (accountId: string) => boolean
  toggleWallet: (accountId: string, label?: string) => Promise<void>
  isContractSaved: (catalogKey: string) => boolean
  toggleContract: (contract: SavedContract) => Promise<void>
  retry: () => Promise<void>
}

export const WALLETS_KEY = 'forge.saved-wallets.v1'
export const CONTRACTS_KEY = 'forge.saved-contracts.v1'
const ForgeDataContext = createContext<ForgeDataValue | null>(null)

function localStorageOrNull() {
  try { return localStorage } catch { return null }
}

function readLocal<T>(key: string): T[] {
  const storage = localStorageOrNull()
  return storage ? readLocalItems<T>(storage, key) : []
}

function writeLocal(key: string, value: unknown[]) {
  const storage = localStorageOrNull()
  return storage ? writeLocalItems(storage, key, value) : false
}

function statusFromFailure(kind: SupabaseFailureKind): SyncStatus {
  return kind === 'configuration' ? 'local' : kind === 'unknown' ? 'error' : kind
}

function isAnonymousSignInDisabled(failure: SupabaseFailure): boolean {
  return failure.kind === 'authentication' && failure.message.includes('Anonymous sign-ins are disabled')
}

const STATUS_LABELS: Record<SyncStatus, string> = {
  connecting: 'Connecting cloud…',
  synced: 'Cloud synced',
  local: 'Local only',
  network: 'Cloud offline',
  authentication: 'Cloud sign-in blocked',
  schema: 'Cloud tables missing',
  authorization: 'Cloud access denied',
  error: 'Cloud sync failed',
}

export function ForgeDataProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<SavedWallet[]>(() => readLocal(WALLETS_KEY))
  const [contracts, setContracts] = useState<SavedContract[]>(() => readLocal(CONTRACTS_KEY))
  const [status, setStatus] = useState<SyncStatus>(supabase ? 'connecting' : 'local')
  const [statusMessage, setStatusMessage] = useState(supabaseConfigurationError || 'Connecting Forge cloud sync…')
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(supabase ? 'checking' : 'none')
  const [userId, setUserId] = useState<string | null>(null)

  const setFailure = useCallback((reason: unknown) => {
    const failure = classifySupabaseFailure(reason)
    setStatus(statusFromFailure(failure.kind))
    const extra = isAnonymousSignInDisabled(failure)
      ? ' • Please enable anonymous sign-ins in your Supabase dashboard project settings.'
      : ''
    setStatusMessage(`${failure.message}${extra} Existing and new saved items remain in browser storage.`)
    if (failure.kind === 'authentication') {
      setSessionStatus('error')
      setUserId(null)
    }
  }, [])

  const connect = useCallback(async () => {
    if (!supabase) {
      setStatus('local')
      setSessionStatus('none')
      setStatusMessage(supabaseConfigurationError || 'Cloud sync is not configured. Saved items remain in this browser.')
      return
    }
    setStatus('connecting')
    setSessionStatus('checking')
    setStatusMessage('Checking Forge Supabase and the saved browser session…')
    try {
      const connection = await verifySupabaseConnection()
      let { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      if (!session) {
        if (connection.anonymousSignInsEnabled === false) {
          throw { status: 422, message: 'Anonymous sign-ins are disabled' }
        }
        const result = await supabase.auth.signInAnonymously()
        if (result.error) throw result.error
        session = result.data.session
      }
      if (!session?.user.id) throw { status: 401, message: 'Supabase did not create an authenticated persistence session.' }

      const nextUserId = session.user.id
      setUserId(nextUserId)
      setSessionStatus('authenticated')
      const synced = await synchronizeSavedItems(
        supabase,
        nextUserId,
        readLocal<SavedWallet>(WALLETS_KEY),
        readLocal<SavedContract>(CONTRACTS_KEY),
      )

      setWallets(synced.wallets)
      setContracts(synced.contracts)
      const walletCached = writeLocal(WALLETS_KEY, synced.wallets)
      const contractCached = writeLocal(CONTRACTS_KEY, synced.contracts)
      setStatus('synced')
      setStatusMessage(walletCached && contractCached
        ? 'Authenticated session active. Saved items were written and read back from Forge Supabase.'
        : 'Forge cloud sync succeeded, but this browser could not update its localStorage cache.')
    } catch (reason) {
      setFailure(reason)
    }
  }, [setFailure])

  useEffect(() => { void connect() }, [connect])

  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id) {
        setUserId(session.user.id)
        setSessionStatus('authenticated')
      } else {
        setUserId(null)
        setSessionStatus('none')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const toggleWallet = useCallback(async (accountId: string, label?: string) => {
    const normalized = accountId.trim().toLowerCase()
    const exists = wallets.some((wallet) => wallet.accountId === normalized)
    const next = exists ? wallets.filter((wallet) => wallet.accountId !== normalized) : [...wallets, { accountId: normalized, label: label || null }]
    setWallets(next)
    const savedLocally = writeLocal(WALLETS_KEY, next)
    if (!savedLocally) {
      setStatus('error')
      setStatusMessage('This browser rejected localStorage. The change is currently held only in memory.')
    }
    if (!supabase || !userId) return
    const result = exists
      ? await supabase.from('saved_wallets').delete().eq('user_id', userId).eq('network', 'testnet').eq('account_id', normalized)
      : await supabase.from('saved_wallets').upsert({ user_id: userId, network: 'testnet', account_id: normalized, label: label || null }, { onConflict: 'user_id,network,account_id' })
    if (result.error) setFailure(result.error)
    else {
      setStatus('synced')
      setStatusMessage('Authenticated session active. The saved wallet change was confirmed by Forge Supabase.')
    }
  }, [wallets, userId, setFailure])

  const toggleContract = useCallback(async (contract: SavedContract) => {
    const exists = contracts.some((item) => item.catalogKey === contract.catalogKey)
    const next = exists ? contracts.filter((item) => item.catalogKey !== contract.catalogKey) : [...contracts, contract]
    setContracts(next)
    const savedLocally = writeLocal(CONTRACTS_KEY, next)
    if (!savedLocally) {
      setStatus('error')
      setStatusMessage('This browser rejected localStorage. The change is currently held only in memory.')
    }
    if (!supabase || !userId) return
    const result = exists
      ? await supabase.from('saved_contracts').delete().eq('user_id', userId).eq('network', 'testnet').eq('catalog_key', contract.catalogKey)
      : await supabase.from('saved_contracts').upsert({ user_id: userId, network: 'testnet', catalog_key: contract.catalogKey, contract_account_id: contract.contractAccountId || null, label: contract.label }, { onConflict: 'user_id,network,catalog_key' })
    if (result.error) setFailure(result.error)
    else {
      setStatus('synced')
      setStatusMessage('Authenticated session active. The saved contract change was confirmed by Forge Supabase.')
    }
  }, [contracts, userId, setFailure])

  const value = useMemo<ForgeDataValue>(() => ({
    wallets,
    contracts,
    status,
    statusLabel: STATUS_LABELS[status],
    statusMessage,
    sessionStatus,
    isWalletSaved: (accountId) => wallets.some((wallet) => wallet.accountId === accountId.trim().toLowerCase()),
    toggleWallet,
    isContractSaved: (catalogKey) => contracts.some((contract) => contract.catalogKey === catalogKey),
    toggleContract,
    retry: connect,
  }), [wallets, contracts, status, statusMessage, sessionStatus, toggleWallet, toggleContract, connect])

  return <ForgeDataContext.Provider value={value}>{children}</ForgeDataContext.Provider>
}

export function useForgeData() {
  const context = useContext(ForgeDataContext)
  if (!context) throw new Error('useForgeData must be used within ForgeDataProvider')
  return context
}
