import type { InjectedWallet, WalletSelector, WalletSelectorParams } from '@near-wallet-selector/core'
import { setupWalletSelector } from '@near-wallet-selector/core'
import { TESTNET } from '../config'
import { createWalletModuleFactories, WALLET_PROVIDERS, type WalletModuleIssue } from './walletModules'

export type WalletSelectorInitialization = {
  selector: WalletSelector
  issues: WalletModuleIssue[]
}

type SetupSelector = (params: WalletSelectorParams) => Promise<WalletSelector>

export function createWalletSelectorInitializer(setupSelector: SetupSelector = setupWalletSelector) {
  let initialization: Promise<WalletSelectorInitialization> | null = null

  return () => {
    if (initialization) return initialization

    initialization = (async () => {
      const issues: WalletModuleIssue[] = []
      const selector = await setupSelector({
        network: TESTNET.networkId,
        modules: createWalletModuleFactories((issue) => issues.push(issue)),
        optimizeWalletOrder: false,
      })

      const registered = new Set(selector.store.getState().modules.map((module) => module.id))
      for (const provider of WALLET_PROVIDERS) {
        if (!registered.has(provider.id)) {
          issues.push({
            providerId: provider.id,
            providerName: provider.name,
            message: 'The adapter did not register in this browser.',
          })
        }
      }
      return { selector, issues }
    })().catch((reason) => {
      initialization = null
      throw reason
    })

    return initialization
  }
}

/** One selector per page prevents React StrictMode from creating stale selector state. */
export const initializeWalletSelector = createWalletSelectorInitializer()

export async function connectWalletAdapter(selector: WalletSelector, walletId: string, contractId: string | null) {
  const wallet = await selector.wallet<InjectedWallet>(walletId)
  await wallet.signIn({ ...(contractId ? { contractId } : {}) })
}

export async function disconnectActiveWallet(selector: WalletSelector) {
  const wallet = await selector.wallet()
  await wallet.signOut()
}
