# Forge repository audit

**Audit date:** 2026-11-12  
**Repository:** `/home/acknowlege/Desktop/near-forge`  
**Branch:** `main`

## Repository state

The existing repository was confirmed before changes. It contained substantial uncommitted work across the frontend, backend, and escrow contract. That work was preserved and reviewed in place; no reset, replacement repository, or destructive cleanup was performed.

## Architecture

- **Frontend:** React 18, TypeScript, Vite 5, CSS design system, lazy-loaded feature pages, and Vitest.
- **Backend:** Node.js ESM + Express. It exposes health/provider metadata, validated NEAR account checks, an allowlisted RPC probe, and an optional NearBlocks proxy.
- **Blockchain:** NEAR Wallet Selector on Testnet with MyNearWallet, Meteor, HERE Wallet, and Sender modules. Public reads use NEAR Testnet RPC and NearBlocks.
- **Contract:** Rust `near-sdk` native NEAR escrow engine compiled as `cdylib`/`rlib`.
- **Persistence:** No application database integration existed at audit start. Wallet Selector maintained its own browser session; application pages did not directly use `localStorage`.
- **Deployment:** Vite static frontend, standalone Express backend, and separately deployed NEAR contract. No PWA manifest is present.

## Existing modules

### Wallet Intelligence

`Wallet Explorer` validates named and implicit Testnet account IDs, reads final account state, access keys, and contract code through NEAR RPC, then loads transactions, fungible tokens, NFTs, and staking data through NearBlocks. Invalid accounts, absent accounts, provider failures, rate limits, loading, and empty results have explicit states.

Blockchain balances and account data are never taken from Supabase.

### Escrow Engine

The frontend prepares Wallet Selector function calls for `create_escrow`, `fund_escrow`, approval, release, cancel, refund, dispute, and resolution methods. Actions are blocked when `VITE_ESCROW_CONTRACT_ID` is unset. No deployed account ID was invented.

The Rust contract implements freelance, milestone, time-locked, and arbitrated workflows with role checks, state guards, exact-deposit accounting, checked arithmetic, deadlines, event history, and transfer callbacks that restore state on failed promises.

### Contract Library

The existing library documents the actual Rust contract, exact method names, deposit expectations, build steps, Testnet deployment examples, wallet integration, and unaudited status.

### RPC Directory

The directory contains curated Testnet RPC, indexer, explorer, faucet, SDK, and tooling entries. JSON-RPC endpoints can be probed for a final block. The backend restricts probes to an allowlist to prevent arbitrary-server SSRF.

## Authentication and trust boundaries

- NEAR Wallet Selector controls wallet connection and transaction signing.
- Connecting a wallet does not authenticate a user to Supabase.
- No application-managed signature challenge existed for proving control of a NEAR account. Forge therefore must not treat a browser-supplied account ID as an authenticated identity.
- Saved-account persistence is a watchlist feature only; it does not claim ownership of those accounts.
- The new Supabase integration uses a separate anonymous Supabase Auth session solely for row ownership and RLS.

## Baseline tests

Before Forge-specific changes:

- Frontend: 6 files, 18 tests passed.
- Backend: 5 tests passed.
- Rust contract: 9 tests passed.
- Frontend production build passed with dependency/bundle warnings.

## Findings addressed

- User-facing surfaces still used the legacy product name.
- Supabase URL/key had been placed directly in `.env.example`; the values are now kept only in ignored local environment configuration and placeholders remain in the example.
- The official Supabase SDK and typed client were absent.
- No persistence schema, RLS policies, or database runbook existed.
- No saved-account or saved-contract persistence existed.
- Supabase failure/loading feedback was absent.
- Existing architecture documentation said Supabase was unused.

## Remaining material limitations

- The reviewed Supabase migration is not applied to the production project.
- Anonymous Supabase sign-ins are currently disabled, as verified by the running frontend. They must be enabled before cloud persistence can create owner-scoped sessions.
- RLS cannot be executed end-to-end until anonymous auth is enabled and the migration is applied.
- The escrow contract is not deployed/configured; live create/fund/release/refund flows remain blocked.
- The contract has no independent audit and lacks complete storage-deposit economics and sandbox failure-injection coverage.
- NearBlocks features depend on third-party availability and schemas.
- The main wallet-selector bundle is large and npm reports transitive dependency advisories; see `FORGE_FINAL_REPORT.md`.
