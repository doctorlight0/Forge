# Forge

Forge is a NEAR Testnet developer workspace with four integrated modules:

- **Wallet Explorer** — authoritative account, balance, access-key, contract-code, transaction, asset, and staking lookups.
- **Escrow Studio** — wallet-signed native NEAR escrow workflows backed by the Rust contract in `contracts/escrow`.
- **Contract Library** — contract interfaces, source references, security constraints, and deployment recipes.
- **RPC Directory** — curated Testnet infrastructure with live endpoint checks.

Supabase stores only user-owned workspace metadata: saved public account IDs and contract-library bookmarks. It never authorizes escrow actions or replaces NEAR RPC/contract state.

## Repository

```text
frontend/             React + TypeScript + Vite application
backend/              Express provider proxy and validation API
contracts/escrow/     Rust near-sdk native NEAR escrow contract
supabase/migrations/  Reviewed, unapplied database migrations
docs/                 Architecture, environment, security, and deployment runbooks
```

## Local setup

1. Copy `.env.example` to `.env` and insert Forge's dedicated Supabase publishable values.
2. Keep `VITE_ESCROW_CONTRACT_ID` empty unless an actual deployed Testnet contract has been verified.
3. Install and run each application:

```bash
cd frontend && npm install && npm run dev
cd backend && npm install && npm start
```

Run verification:

```bash
cd frontend && npm test && npm run build
cd backend && npm test
cd contracts/escrow && cargo test
```

See [FORGE_AUDIT.md](FORGE_AUDIT.md), [FORGE_SUPABASE_ARCHITECTURE.md](FORGE_SUPABASE_ARCHITECTURE.md), and [FORGE_FINAL_REPORT.md](FORGE_FINAL_REPORT.md) for current readiness status.

## Safety

- Forge never requests seed phrases or private keys.
- Wallets sign all NEAR transactions.
- Supabase receives no private keys, authoritative balances, or transaction-success claims.
- The escrow contract is unaudited and not represented as deployed or verified on Testnet.
