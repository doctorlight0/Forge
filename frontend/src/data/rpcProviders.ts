export type ProviderType = 'rpc' | 'indexer' | 'explorer' | 'faucet' | 'sdk'
export type Provider = {
  id: string
  name: string
  type: ProviderType
  network?: 'mainnet' | 'testnet' | 'multi'
  archival?: boolean
  url: string
  description: string
  docsUrl?: string
  auth?: string
  rateLimit?: string
  notes?: string
  checkable: boolean
}

export const RPC_PROVIDERS: Provider[] = [
  // Mainnet RPC
  { id: 'near-mainnet-official', name: 'NEAR Official RPC (Mainnet)', type: 'rpc', network: 'mainnet', url: 'https://rpc.mainnet.near.org', description: 'Public NEAR mainnet JSON-RPC endpoint operated for the NEAR ecosystem.', docsUrl: 'https://docs.near.org/api/rpc/providers', auth: 'None for public access', rateLimit: 'Public/shared limits apply (see docs)', checkable: true },
  { id: 'near-mainnet-fastnear', name: 'FASTNEAR (Mainnet)', type: 'rpc', network: 'mainnet', url: 'https://free.rpc.fastnear.com', description: 'Community RPC endpoint for mainnet (FastNear).', docsUrl: 'https://fastnear.com/', auth: 'None for public endpoint (plans may vary)', rateLimit: 'See provider docs', notes: 'Availability/performance subject to provider.', checkable: true },
  { id: 'near-mainnet-archival-pagoda', name: 'Pagoda (Mainnet archival / enhanced, if configured)', type: 'rpc', network: 'mainnet', archival: true, url: 'https://rpc.mainnet.pagoda.co', description: 'Pagoda-hosted NEAR mainnet RPC endpoint; archival/enhanced features depend on plan/config.', docsUrl: 'https://docs.near.org/api/rpc/providers', auth: 'May require API key for some plans', rateLimit: 'Plan-dependent (see docs)', notes: 'Public reachability/features may vary; check docs.', checkable: true },
  // Testnet RPC
  { id: 'near-testnet-official', name: 'NEAR Official RPC (Testnet)', type: 'rpc', network: 'testnet', url: 'https://rpc.testnet.near.org', description: 'Public NEAR testnet JSON-RPC endpoint.', docsUrl: 'https://docs.near.org/api/rpc/providers', auth: 'None for public access', rateLimit: 'Public/shared limits apply (see docs)', checkable: true },
  { id: 'near-testnet-fastnear', name: 'FASTNEAR (Testnet)', type: 'rpc', network: 'testnet', url: 'https://test.rpc.fastnear.com', description: 'Community RPC endpoint for testnet (FastNear).', docsUrl: 'https://fastnear.com/', auth: 'None for public endpoint (plans may vary)', rateLimit: 'See provider docs', checkable: true },
  { id: 'near-testnet-archival-pagoda', name: 'Pagoda (Testnet, if configured)', type: 'rpc', network: 'testnet', archival: true, url: 'https://rpc.testnet.pagoda.co', description: 'Pagoda-hosted NEAR testnet RPC endpoint; features depend on plan/config.', docsUrl: 'https://docs.near.org/api/rpc/providers', auth: 'May require API key for some plans', rateLimit: 'Plan-dependent (see docs)', checkable: true },
  // Indexers / APIs
  { id: 'nearblocks-mainnet', name: 'NearBlocks API (Mainnet)', type: 'indexer', network: 'mainnet', url: 'https://api.nearblocks.io/v1', description: 'Explorer/indexer API for accounts, transactions, tokens, NFTs, and more (NearBlocks).', docsUrl: 'https://api.nearblocks.io/api-docs/', auth: 'Public endpoints available; API key may increase limits', rateLimit: 'Public limits apply; may return 429 under load', notes: 'Used by Wallet Explorer for history/tokens/NFTs/staking where supported.', checkable: false },
  { id: 'nearblocks-testnet', name: 'NearBlocks API (Testnet)', type: 'indexer', network: 'testnet', url: 'https://api-testnet.nearblocks.io/v1', description: 'Explorer/indexer API for testnet (NearBlocks).', docsUrl: 'https://api.nearblocks.io/api-docs/', auth: 'Public endpoints available; API key may increase limits', rateLimit: 'Public limits apply; may return 429 under load', checkable: false },
  { id: 'pagoda-enhanced-api', name: 'Pagoda Enhanced APIs', type: 'indexer', network: 'multi', url: 'https://near-nodes.io', description: 'Pagoda developer platform / enhanced APIs and node services (capabilities per plan).', docsUrl: 'https://docs.near.org/api/rpc/providers', auth: 'Typically requires account/API key', rateLimit: 'Plan-dependent', notes: 'Consult official docs for current endpoints and products.', checkable: false },
  // Explorers
  { id: 'nearblocks-explorer-mainnet', name: 'NearBlocks Explorer (Mainnet)', type: 'explorer', network: 'mainnet', url: 'https://nearblocks.io', description: 'Block explorer for NEAR mainnet: accounts, transactions, blocks, contracts.', docsUrl: 'https://nearblocks.io', auth: 'N/A', rateLimit: 'Web UI; API limits per NearBlocks API', checkable: false },
  { id: 'nearblocks-explorer-testnet', name: 'NearBlocks Explorer (Testnet)', type: 'explorer', network: 'testnet', url: 'https://testnet.nearblocks.io', description: 'Block explorer for NEAR testnet.', docsUrl: 'https://testnet.nearblocks.io', auth: 'N/A', rateLimit: 'Web UI', checkable: false },
  { id: 'nearscan-mainnet', name: 'NEAR Explorer (legacy/official references)', type: 'explorer', network: 'mainnet', url: 'https://explorer.near.org', description: 'NEAR explorer portal (features and availability may evolve; see NEAR docs for current recommended explorers).', docsUrl: 'https://docs.near.org', auth: 'N/A', rateLimit: 'N/A', notes: 'Refer to docs.near.org for up-to-date explorer guidance.', checkable: false },
  // Faucets
  { id: 'near-testnet-faucet', name: 'NEAR Testnet Faucet', type: 'faucet', network: 'testnet', url: 'https://near-faucet.io/', description: 'Community faucet for obtaining testnet NEAR (availability subject to provider).', docsUrl: 'https://docs.near.org/tools/faucet', auth: 'May require GitHub/login or captcha per provider', rateLimit: 'Per-provider limits apply', notes: 'Use only for testnet; never share seed phrases/private keys.', checkable: false },
  { id: 'near-docs-faucet', name: 'NEAR Docs: Faucet & Testnet Accounts', type: 'faucet', network: 'testnet', url: 'https://docs.near.org/tools/faucet', description: 'Official documentation on testnet faucets and creating test accounts.', docsUrl: 'https://docs.near.org/tools/faucet', auth: 'N/A', rateLimit: 'N/A', checkable: false },
  // SDKs & Tools
  { id: 'near-sdk-rs', name: 'near-sdk-rs', type: 'sdk', network: 'multi', url: 'https://github.com/near/near-sdk-rs', description: 'Rust SDK for writing NEAR smart contracts.', docsUrl: 'https://docs.near.org/sdk/rust/introduction', auth: 'N/A', rateLimit: 'N/A', checkable: false },
  { id: 'near-api-js', name: 'near-api-js', type: 'sdk', network: 'multi', url: 'https://github.com/near/near-api-js', description: 'JavaScript/TypeScript library for interacting with NEAR RPC and accounts.', docsUrl: 'https://docs.near.org/tools/near-api-js/quick-reference', auth: 'N/A', rateLimit: 'N/A', checkable: false },
  { id: 'wallet-selector', name: 'NEAR Wallet Selector', type: 'sdk', network: 'multi', url: 'https://github.com/near/wallet-selector', description: 'Wallet integration library for NEAR dApps (wallet-based signing).', docsUrl: 'https://docs.near.org/tools/wallet-selector', auth: 'N/A', rateLimit: 'N/A', checkable: false },
  { id: 'near-cli-rs', name: 'NEAR CLI (RS)', type: 'sdk', network: 'multi', url: 'https://github.com/near/near-cli-rs', description: 'Command-line interface for NEAR protocol operations (deploy, call, keys, etc.).', docsUrl: 'https://docs.near.org/tools/near-cli', auth: 'Local key management (never expose secrets)', rateLimit: 'N/A', checkable: false },
]
