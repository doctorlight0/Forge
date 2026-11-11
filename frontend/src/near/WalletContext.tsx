import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { AccountState, WalletSelector } from '@near-wallet-selector/core'
import { setupWalletSelector } from '@near-wallet-selector/core'
import { setupModal } from '@near-wallet-selector/modal-ui'
import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui'
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet'
import '@near-wallet-selector/modal-ui/styles.css'
import { APP_NAME, ESCROW_CONTRACT_BY_NETWORK, NETWORKS, type NetworkId } from '../config'

type Ctx = {
  selector: WalletSelector | null
  modal: WalletSelectorModal | null
  accountId: string | null
  accounts: Array<AccountState>
  network: NetworkId
  setNetwork: (n: NetworkId) => void
  signIn: () => void
  signOut: () => Promise<void>
  escrowContractId: string | null
  ready: boolean
  error: string | null
}

const WalletCtx = createContext<Ctx | null>(null)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetwork] = useState<NetworkId>('testnet')
  const [selector, setSelector] = useState<WalletSelector | null>(null)
  const [modal, setModal] = useState<WalletSelectorModal | null>(null)
  const [accounts, setAccounts] = useState<Array<AccountState>>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setReady(false)
        setError(null)
        const s = await setupWalletSelector({
          network: network,
          modules: [setupMyNearWallet()],
        })
        const contractId = ESCROW_CONTRACT_BY_NETWORK[network] || 'escrow.not-configured.near'
        const m = setupModal(s, { contractId, description: `Connect to ${APP_NAME}` })
        if (cancelled) return
        setSelector(s)
        setModal(m)
        setAccounts(s.store.getState().accounts)
        const sub = s.store.observable.subscribe((state) => {
          setAccounts(state.accounts)
        })
        setReady(true)
        return () => sub.unsubscribe()
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to initialize wallet selector')
        setReady(true)
      }
    })()
    return () => { cancelled = true }
  }, [network])

  const accountId = accounts.find((a) => a.active)?.accountId ?? accounts[0]?.accountId ?? null
  const escrowContractId = ESCROW_CONTRACT_BY_NETWORK[network] ?? null

  const value = useMemo<Ctx>(() => ({
    selector, modal, accountId, accounts, network, setNetwork,
    signIn: () => modal?.show(),
    signOut: async () => {
      if (!selector) return
      const w = await selector.wallet()
      await w.signOut()
    },
    escrowContractId, ready, error,
  }), [selector, modal, accountId, accounts, network, escrowContractId, ready, error])

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>
}

export function useWallet() {
  const ctx = useContext(WalletCtx)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}
