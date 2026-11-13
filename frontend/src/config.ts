export const TESTNET = {
  networkId: 'testnet' as const,
  nodeUrl: 'https://rpc.testnet.near.org',
  walletUrl: 'https://testnet.mynearwallet.com',
  helperUrl: 'https://helper.testnet.near.org',
  explorerUrl: 'https://testnet.nearblocks.io',
  indexerBaseUrl: 'https://api-testnet.nearblocks.io/v3',
}

export const APP_NAME = 'Forge'
export const ESCROW_CONTRACT_ID = (import.meta.env.VITE_ESCROW_CONTRACT_ID || '').trim() || null
export const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:8787').replace(/\/$/, '')

export const EXPLORER_TX_URL = (hash: string) => `${TESTNET.explorerUrl}/txns/${encodeURIComponent(hash)}`
export const EXPLORER_ACCOUNT_URL = (accountId: string) => `${TESTNET.explorerUrl}/address/${encodeURIComponent(accountId)}`
