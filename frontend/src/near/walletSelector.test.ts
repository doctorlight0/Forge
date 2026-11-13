import { describe, expect, it, vi } from 'vitest'
import type { WalletSelector, WalletSelectorParams } from '@near-wallet-selector/core'
import { connectWalletAdapter, createWalletSelectorInitializer, disconnectActiveWallet } from './walletSelector'

function selectorWith(moduleIds: string[]) {
  return {
    store: {
      getState: () => ({ modules: moduleIds.map((id) => ({ id })) }),
    },
  } as unknown as WalletSelector
}

describe('Wallet Selector initialization', () => {
  it('initializes once, on Testnet, even when called twice by React StrictMode', async () => {
    const selector = selectorWith(['my-near-wallet', 'meteor-wallet', 'here-wallet', 'sender'])
    const setup = vi.fn(async (_params: WalletSelectorParams) => selector)
    const initialize = createWalletSelectorInitializer(setup)

    const first = initialize()
    const second = initialize()
    expect(first).toBe(second)
    const result = await first

    expect(setup).toHaveBeenCalledTimes(1)
    expect(setup.mock.calls[0][0]).toMatchObject({ network: 'testnet', optimizeWalletOrder: false })
    expect(setup.mock.calls[0][0].modules).toHaveLength(4)
    expect(result.issues).toEqual([])
  })

  it('reports adapters that are unavailable in the current browser', async () => {
    const setup = vi.fn(async () => selectorWith(['my-near-wallet', 'meteor-wallet', 'here-wallet']))
    const result = await createWalletSelectorInitializer(setup)()
    expect(result.issues).toEqual([expect.objectContaining({ providerId: 'sender' })])
  })

  it('allows retry after a top-level initialization failure', async () => {
    const selector = selectorWith(['my-near-wallet', 'meteor-wallet', 'here-wallet', 'sender'])
    const setup = vi.fn()
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce(selector)
    const initialize = createWalletSelectorInitializer(setup)

    await expect(initialize()).rejects.toThrow('storage unavailable')
    await expect(initialize()).resolves.toMatchObject({ selector })
    expect(setup).toHaveBeenCalledTimes(2)
  })
})

describe('wallet connection lifecycle', () => {
  it('connects the chosen adapter with the configured Testnet contract', async () => {
    const signIn = vi.fn(async () => undefined)
    const wallet = vi.fn(async () => ({ signIn }))
    const selector = { wallet } as unknown as WalletSelector

    await connectWalletAdapter(selector, 'meteor-wallet', 'escrow.example.testnet')
    expect(wallet).toHaveBeenCalledWith('meteor-wallet')
    expect(signIn).toHaveBeenCalledWith({ contractId: 'escrow.example.testnet' })
  })

  it('signs out the active persisted wallet', async () => {
    const signOut = vi.fn(async () => undefined)
    const wallet = vi.fn(async () => ({ signOut }))
    const selector = { wallet } as unknown as WalletSelector

    await disconnectActiveWallet(selector)
    expect(wallet).toHaveBeenCalledWith()
    expect(signOut).toHaveBeenCalledOnce()
  })
})
