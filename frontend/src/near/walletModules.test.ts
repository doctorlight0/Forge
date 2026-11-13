import { describe, expect, it, vi } from 'vitest'
import type { WalletModuleFactory } from '@near-wallet-selector/core'
import { createWalletModuleFactories, resilientWalletModuleFactory, WALLET_PROVIDERS, type WalletProviderDefinition } from './walletModules'

describe('Forge wallet provider registration', () => {
  it('registers the four requested Wallet Selector adapters in a stable order', () => {
    expect(WALLET_PROVIDERS.map((provider) => provider.id)).toEqual([
      'my-near-wallet',
      'meteor-wallet',
      'here-wallet',
      'sender',
    ])
    expect(createWalletModuleFactories()).toHaveLength(4)
  })

  it('isolates an adapter initialization failure instead of rejecting all providers', async () => {
    const onIssue = vi.fn()
    const brokenFactory = vi.fn(async () => { throw new Error('extension API unavailable') }) as WalletModuleFactory
    const provider: WalletProviderDefinition = {
      id: 'sender',
      name: 'Sender',
      connection: 'extension',
      createFactory: () => brokenFactory,
    }
    const wrapped = resilientWalletModuleFactory(provider, onIssue)

    await expect(wrapped({} as never)).resolves.toBeNull()
    expect(onIssue).toHaveBeenCalledWith(expect.objectContaining({
      providerId: 'sender',
      message: 'extension API unavailable',
    }))
  })
})
