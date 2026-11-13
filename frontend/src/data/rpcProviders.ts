export type ProviderType = 'rpc' | 'indexer' | 'explorer' | 'faucet' | 'sdk' | 'tool'

export type Provider = {
  id: string
  name: string
  type: ProviderType
  url: string
  purpose: string
  docsUrl: string
  auth: string
  rateLimit: string
  archival: 'yes' | 'no' | 'plan-dependent' | 'not-applicable'
  notes?: string
  checkable: boolean
}

export const RPC_PROVIDERS: Provider[] = [
  {
    id: 'near-testnet-rpc', name: 'NEAR Testnet RPC', type: 'rpc', url: 'https://rpc.testnet.near.org',
    purpose: 'Canonical public JSON-RPC endpoint for Testnet account, block, transaction, validator, and contract queries.',
    docsUrl: 'https://docs.near.org/api/rpc/providers', auth: 'No API key for the public endpoint.',
    rateLimit: 'Shared public limits apply; applications should retry with backoff.', archival: 'no', checkable: true,
  },
  {
    id: 'fastnear-testnet-rpc', name: 'FASTNEAR Testnet RPC', type: 'rpc', url: 'https://test.rpc.fastnear.com',
    purpose: 'Community-operated Testnet JSON-RPC endpoint useful as an alternate provider.',
    docsUrl: 'https://fastnear.com/', auth: 'No key for the published public endpoint; commercial plans may differ.',
    rateLimit: 'See FASTNEAR documentation; do not assume a guaranteed public quota.', archival: 'plan-dependent', checkable: true,
  },
  {
    id: 'nearblocks-testnet-api', name: 'NearBlocks Testnet API', type: 'indexer', url: 'https://api-testnet.nearblocks.io/v3',
    purpose: 'NearBlocks v3 indexed Testnet transactions and account asset views used by Wallet Explorer when available.',
    docsUrl: 'https://api.nearblocks.io/api-docs/', auth: 'Basic public access; optional credentials can be supplied server-side only.',
    rateLimit: 'Public requests can return HTTP 429; exact quotas depend on the provider plan.', archival: 'plan-dependent', checkable: false,
  },
  {
    id: 'nearblocks-testnet-explorer', name: 'NearBlocks Testnet Explorer', type: 'explorer', url: 'https://testnet.nearblocks.io',
    purpose: 'Human-readable Testnet accounts, blocks, contracts, transactions, and receipts.',
    docsUrl: 'https://testnet.nearblocks.io', auth: 'None for browser access.', rateLimit: 'Not applicable to normal web use.', archival: 'not-applicable', checkable: false,
  },
  {
    id: 'near-testnet-faucet-docs', name: 'NEAR Testnet Faucet Guide', type: 'faucet', url: 'https://docs.near.org/tools/faucet',
    purpose: 'Official guidance for creating and funding Testnet development accounts.',
    docsUrl: 'https://docs.near.org/tools/faucet', auth: 'Provider-specific login or verification may apply.',
    rateLimit: 'Provider-specific limits apply.', archival: 'not-applicable', notes: 'Forge never collects a seed phrase or private key.', checkable: false,
  },
  {
    id: 'near-sdk-rs', name: 'near-sdk-rs', type: 'sdk', url: 'https://github.com/near/near-sdk-rs',
    purpose: 'Rust SDK used to build the Forge escrow contract.', docsUrl: 'https://docs.near.org/smart-contracts/anatomy/rust',
    auth: 'None.', rateLimit: 'Not applicable.', archival: 'not-applicable', checkable: false,
  },
  {
    id: 'near-api-js', name: 'near-api-js', type: 'sdk', url: 'https://github.com/near/near-api-js',
    purpose: 'JavaScript utilities for NEAR RPC, accounts, keys, transactions, and contract interaction.',
    docsUrl: 'https://docs.near.org/tools/near-api-js/quick-reference', auth: 'None.', rateLimit: 'Depends on the selected RPC provider.', archival: 'not-applicable', checkable: false,
  },
  {
    id: 'wallet-selector', name: 'NEAR Wallet Selector', type: 'sdk', url: 'https://github.com/near/wallet-selector',
    purpose: 'Official multi-wallet selection ecosystem used for user-controlled transaction signing.',
    docsUrl: 'https://docs.near.org/tools/wallet-selector', auth: 'Wallet-controlled; no application custody of keys.', rateLimit: 'Not applicable.', archival: 'not-applicable', checkable: false,
  },
  {
    id: 'near-cli-rs', name: 'NEAR CLI', type: 'tool', url: 'https://github.com/near/near-cli-rs',
    purpose: 'Command-line deployment, view calls, signed transactions, and Testnet account operations.',
    docsUrl: 'https://docs.near.org/tools/near-cli', auth: 'Local keychain or wallet flow; protect credentials.', rateLimit: 'Depends on the configured RPC.', archival: 'not-applicable', checkable: false,
  },
  {
    id: 'near-lake-framework', name: 'NEAR Lake Framework', type: 'indexer', url: 'https://github.com/near/near-lake-framework-rs',
    purpose: 'Framework for building custom indexers from NEAR Lake data streams.',
    docsUrl: 'https://docs.near.org/data-infrastructure/near-lake-framework', auth: 'Cloud storage credentials/configuration may be required.',
    rateLimit: 'Depends on the storage provider and deployment.', archival: 'yes', checkable: false,
  },
]
