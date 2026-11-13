import type { WalletModuleFactory } from '@near-wallet-selector/core'
import { setupHereWallet } from '@near-wallet-selector/here-wallet'
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet'
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet'
import { setupSender } from '@near-wallet-selector/sender'

export type WalletProviderId = 'my-near-wallet' | 'meteor-wallet' | 'here-wallet' | 'sender'

export type WalletProviderDefinition = {
  id: WalletProviderId
  name: string
  connection: 'web' | 'mobile' | 'extension'
  createFactory: () => WalletModuleFactory
}

export type WalletModuleIssue = {
  providerId: WalletProviderId
  providerName: string
  message: string
}

export const WALLET_PROVIDERS: readonly WalletProviderDefinition[] = [
  { id: 'my-near-wallet', name: 'MyNearWallet', connection: 'web', createFactory: setupMyNearWallet },
  { id: 'meteor-wallet', name: 'Meteor Wallet', connection: 'web', createFactory: setupMeteorWallet },
  { id: 'here-wallet', name: 'HERE Wallet', connection: 'mobile', createFactory: setupHereWallet },
  { id: 'sender', name: 'Sender', connection: 'extension', createFactory: setupSender },
]

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason || 'Unknown initialization error')
}

export function resilientWalletModuleFactory(
  provider: WalletProviderDefinition,
  onIssue: (issue: WalletModuleIssue) => void = () => {},
): WalletModuleFactory {
  return async (options) => {
    try {
      const factory = provider.createFactory()
      return await factory(options)
    } catch (reason) {
      onIssue({ providerId: provider.id, providerName: provider.name, message: errorMessage(reason) })
      return null
    }
  }
}

/** Keep one failed third-party adapter from taking every other wallet option down. */
export function createWalletModuleFactories(onIssue: (issue: WalletModuleIssue) => void = () => {}) {
  return WALLET_PROVIDERS.map((provider) => resilientWalletModuleFactory(provider, onIssue))
}
