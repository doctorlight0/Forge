# Architecture — NEAR Forge

## Overview
Integrated NEAR developer platform with four modules sharing a common frontend shell and NEAR network configuration:

1. **Wallet Explorer** — account search and inspection using real NEAR JSON-RPC (balances, access keys, contract code/account info) and documented indexer APIs (NearBlocks public API) for transactions, NEP-141 tokens, NFTs, and staking (best-effort). Network-aware (mainnet/testnet) with pagination, validation, and explicit error/rate-limit states.
2. **Escrow Studio** — frontend drives **wallet-signed** function calls to the Rust escrow contract. No simulated on-chain success. Supports create/fund/approve/release/cancel/refund/dispute/resolve for Freelance, Milestone, Time-locked, and Arbitrated workflows.
3. **Contract Library** — static/documented catalog backed by repository sources (`contracts/escrow`), parameters, build/test/deploy instructions, integration snippets, security notes, and honest verification labels (no false audit claims).
4. **RPC Directory** — curated, documented list of RPC/indexer/explorer/faucet/SDK resources with on-demand connectivity checks (JSON-RPC `block` probe) from frontend and/or backend; no invented endpoints/pricing/stats.

## Components
- **Frontend (`frontend/`)**: React + TypeScript + Vite + Tailwind. Routing-less tabbed shell, Wallet Selector integration (`near/WalletContext`), RPC/indexer clients (`near/rpc.ts`, `near/indexer.ts`), module pages.
- **Backend (`backend/`)**: Node.js + Express. Provider configuration endpoint, endpoint connectivity check API, optional indexer proxy (to attach server-side API keys if configured), input validation helpers. PostgreSQL/Supabase not used in v1 (not required for core flows); can be added if persistence/analytics needed.
- **Smart contract (`contracts/escrow/`)**: Rust `near-sdk` cdylib. Single reusable escrow engine with typed workflow kind/status, milestone storage, history log, and async transfer callbacks for failure recovery.

## Data flow
- **Explorer:** UI → RPC (`view_account`, `view_access_key_list`, `view_code`) + Indexer HTTP → render real results or surfaced errors.
- **Escrow:** UI → Wallet Selector → signed `FunctionCall` actions → NEAR network/contract → outcomes shown to user (tx hash when available). Read queries can use RPC `call_function` view methods.
- **RPC checks:** UI → `checkEndpoint` (direct fetch) or backend `/api/check-endpoint` → JSON-RPC `block` response/latency.

## Security boundaries
- No private key custody; wallet signs all txs.
- Backend holds optional provider secrets only in env; CORS/validation applied.
- Contract enforces authorization, accounting, and state guards on-chain (see `SECURITY.md`).
