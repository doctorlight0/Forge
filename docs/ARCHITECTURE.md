# Architecture — Forge

## Overview
Integrated NEAR developer platform with four modules sharing a common frontend shell and NEAR network configuration:

1. **Wallet Explorer** — account search and inspection using real NEAR Testnet JSON-RPC and NearBlocks for transactions, NEP-141 tokens, NFTs, and staking (best-effort), with pagination, validation, and explicit error/rate-limit states.
2. **Escrow Studio** — frontend drives **wallet-signed** function calls to the Rust escrow contract. No simulated on-chain success. Supports create/fund/approve/release/cancel/refund/dispute/resolve for Freelance, Milestone, Time-locked, and Arbitrated workflows.
3. **Contract Library** — static/documented catalog backed by repository sources (`contracts/escrow`), parameters, build/test/deploy instructions, integration snippets, security notes, and honest verification labels (no false audit claims).
4. **RPC Directory** — curated, documented list of RPC/indexer/explorer/faucet/SDK resources with on-demand connectivity checks (JSON-RPC `block` probe) from frontend and/or backend; no invented endpoints/pricing/stats.

## Components
- **Frontend (`frontend/`)**: React + TypeScript + Vite. Hash-addressable lazy-loaded workspace shell, Wallet Selector integration, RPC/indexer clients, and typed Supabase persistence for saved workspace metadata.
- **Backend (`backend/`)**: Node.js + Express. Provider metadata, allowlisted connectivity checks, optional indexer proxy, input validation, CORS allowlist, request limits, and consistent error envelopes.
- **Supabase (`supabase/`)**: Dedicated Forge project with additive migrations for owner-scoped saved accounts and contract bookmarks. Anonymous Supabase Auth supplies `auth.uid()` for RLS; it does not authenticate NEAR wallet ownership.
- **Smart contract (`contracts/escrow/`)**: Rust `near-sdk` cdylib. Single reusable escrow engine with typed workflow kind/status, milestone storage, history log, and async transfer callbacks for failure recovery.

## Data flow
- **Explorer:** UI → RPC (`view_account`, `view_access_key_list`, `view_code`) + Indexer HTTP → render real results or surfaced errors.
- **Escrow:** UI → Wallet Selector → signed `FunctionCall` actions → NEAR network/contract → outcomes shown to user (tx hash when available). Read queries can use RPC `call_function` view methods.
- **RPC checks:** UI → `checkEndpoint` (direct fetch) or backend `/api/check-endpoint` → JSON-RPC `block` response/latency.
- **Saved metadata:** UI → browser cache immediately → anonymous Supabase session → owner-only RLS rows. Failures remain local and are surfaced.

## Security boundaries
- No private key custody; wallet signs all txs.
- Backend holds optional provider secrets only in env; CORS/validation applied.
- Contract enforces authorization, accounting, and state guards on-chain (see `SECURITY.md`).
- Supabase never stores authoritative balances, receipts, escrow state, seed phrases, or private keys.
