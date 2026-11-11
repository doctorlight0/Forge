export type NetworkId = 'mainnet' | 'testnet'

export interface NetworkConfig {
  networkId: NetworkId
  nodeUrl: string
  walletUrl: string
  helperUrl: string
  explorerUrl: string
  indexerBaseUrl?: string
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  testnet: {
    networkId: 'testnet',
    nodeUrl: 'https://rpc.testnet.near.org',
    walletUrl: 'https://testnet.mynearwallet.com',
    helperUrl: 'https://helper.testnet.near.org',
    explorerUrl: 'https://testnet.nearblocks.io',
    indexerBaseUrl: 'https://api-testnet.nearblocks.io/v1',
  },
  mainnet: {
    networkId: 'mainnet',
    nodeUrl: 'https://rpc.mainnet.near.org',
    walletUrl: 'https://app.mynearwallet.com',
    helperUrl: 'https://helper.mainnet.near.org',
    explorerUrl: 'https://nearblocks.io',
    indexerBaseUrl: 'https://api.nearblocks.io/v1',
  },
}

export const ESCROW_CONTRACT_BY_NETWORK: Partial<Record<NetworkId, string>> = {
  // Set after authorized Testnet deployment; do not fabricate addresses.
  // testnet: 'escrow.<account>.testnet'
}

export const APP_NAME = 'NEAR Forge'
