import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { AccountState, WalletSelector } from '@near-wallet-selector/core'
import { ESCROW_CONTRACT_ID, TESTNET } from '../config'
import { connectWalletAdapter, disconnectActiveWallet, initializeWalletSelector } from './walletSelector'

export type WalletOption = {
  id: string
  name: string
  description: string
  iconUrl: string
  downloadUrl: string | null
  available: boolean
  type: string
}

type WalletContextValue = {
  selector: WalletSelector | null
  accountId: string | null
  accounts: AccountState[]
  activeWalletId: string | null
  activeWalletName: string | null
  wallets: WalletOption[]
  walletModalOpen: boolean
  connectingWalletId: string | null
  signIn: () => void
  closeWalletModal: () => void
  connectWallet: (walletId: string) => Promise<void>
  signOut: () => Promise<void>
  ready: boolean
  error: string | null
  networkId: typeof TESTNET.networkId
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [selector, setSelector] = useState<WalletSelector | null>(null)
  const [accounts, setAccounts] = useState<AccountState[]>([])
  const [activeWalletId, setActiveWalletId] = useState<string | null>(null)
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [walletModalOpen, setWalletModalOpen] = useState(false)
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    void (async () => {
      try {
        const { selector: nextSelector, issues } = await initializeWalletSelector()
        if (cancelled) return
        setSelector(nextSelector)
        const syncState = () => {
          const state = nextSelector.store.getState()
          setAccounts(state.accounts)
          setActiveWalletId(state.selectedWalletId)
          setWallets(state.modules.map((module) => ({
            id: module.id,
            name: module.metadata.name,
            description: module.metadata.description || 'NEAR-compatible wallet',
            iconUrl: module.metadata.iconUrl,
            downloadUrl: 'downloadUrl' in module.metadata ? module.metadata.downloadUrl : null,
            available: module.metadata.available,
            type: module.type,
          })))
        }
        syncState()
        if (issues.length) setError(issues.map((issue) => `${issue.providerName}: ${issue.message}`).join(' '))
        const subscription = nextSelector.store.observable.subscribe(syncState)
        unsubscribe = () => subscription.unsubscribe()
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Wallet selector failed to initialize')
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => { cancelled = true; unsubscribe?.() }
  }, [])

  const accountId = accounts.find((account) => account.active)?.accountId ?? accounts[0]?.accountId ?? null
  const activeWalletName = wallets.find((wallet) => wallet.id === activeWalletId)?.name ?? null
  const value = useMemo<WalletContextValue>(() => ({
    selector,
    accountId,
    accounts,
    activeWalletId,
    activeWalletName,
    wallets,
    walletModalOpen,
    connectingWalletId,
    signIn: () => {
      setError(null)
      setWalletModalOpen(true)
    },
    closeWalletModal: () => {
      if (!connectingWalletId) setWalletModalOpen(false)
    },
    connectWallet: async (walletId) => {
      if (!selector || connectingWalletId) return
      const option = wallets.find((wallet) => wallet.id === walletId)
      if (!option) {
        setError(`Wallet adapter “${walletId}” is not registered.`)
        return
      }
      if (!option.available) {
        setError(`${option.name} is not installed in this browser.`)
        return
      }
      setConnectingWalletId(walletId)
      setError(null)
      try {
        await connectWalletAdapter(selector, walletId, ESCROW_CONTRACT_ID)
        setWalletModalOpen(false)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : `Could not connect ${option.name}.`)
      } finally {
        setConnectingWalletId(null)
      }
    },
    signOut: async () => {
      if (!selector) return
      setError(null)
      try {
        await disconnectActiveWallet(selector)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not disconnect the wallet.')
      }
    },
    ready,
    error,
    networkId: TESTNET.networkId,
  }), [selector, accountId, accounts, activeWalletId, activeWalletName, wallets, walletModalOpen, connectingWalletId, ready, error])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallet must be used within WalletProvider')
  return context
}
