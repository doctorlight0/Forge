# SECURITY.md — Forge

## Scope
Forge includes a frontend (React/Vite), backend (Node/Express), a dedicated Supabase persistence layer, and a native Rust NEAR escrow smart contract (`contracts/escrow`). This document summarizes security posture, assumptions, and honest limitations.

## Wallet & key handling
- **No seed phrases or private keys are ever requested or collected** by the frontend or backend. All on-chain state-changing actions must be **wallet-signed** via NEAR Wallet Selector integrations.
- Users should verify transaction details in their wallet before signing.

## Smart contract (Escrow Engine) — design controls
- **Authorization:** actions restricted by role (buyer/seller/arbitrator) per workflow/state.
- **Participant validation:** distinct buyer/seller; arbitrator required and distinct for arbitrated workflows.
- **State machine guards:** explicit status checks prevent invalid transitions and **duplicate operations** (e.g. double funding/release/refund, re-approving released milestones).
- **Accounting:** exact attached-deposit funding (`funded_amount == total_amount`), checked arithmetic for sums/releases/refunds, and resolution amounts must equal available balance.
- **Deadlines:** funding/release deadlines enforced where configured (time-locked lock-until semantics).
- **Async transfer safety:** transfers use callbacks to detect failures and **revert intent/state** on promise failure (best-effort recovery) to avoid inconsistent accounting.
- **Storage:** contract stores escrows/milestones/history in persistent collections; production hardening should include explicit storage deposit accounting/refunds proportional to usage (not fully implemented as refundable deposits in current version).

### Known limitations / not yet hardened
- **Not independently audited.** Do not label or treat as audited.
- **Milestone storage cleanup** on completion and **storage staking economics** are minimal; may require refinement for large-scale use.
- **Dispute resolution for milestone escrows** after partial releases needs careful accounting review for all edge cases; current resolution targets available (unreleased/unrefunded) balance.
- **Reentrancy/callback assumptions** follow NEAR async model; thorough sandbox/integration testing recommended before production use.
- **NEP-141 escrow** not implemented (P2).

## Backend
- CORS/origin configurable via env; input validation on key endpoints (account format, URL scheme for checks).
- No secrets committed; `.env.example` provided. API keys (if used for indexers) must remain server-side and never exposed to clients.
- Basic in-memory request limiting is present; production should use a shared limiter at the edge or gateway.

## Supabase
- The frontend accepts only the project URL and publishable key. Obvious `sb_secret_*` and service-role formats are rejected at runtime.
- `saved_wallets` and `saved_contracts` enable and force RLS. The `anon` database role has no table grants; authenticated anonymous sessions can access only rows where `auth.uid() = user_id`.
- Saved wallet IDs are watchlist entries, not proof that the Supabase user controls the NEAR account.
- Supabase is not trusted for balances, access keys, transaction state, receipts, or escrow authorization.
- Browser-only fallback data is non-sensitive metadata. Sync failures are explicit and do not block public NEAR reads.
- Runtime RLS isolation remains unverified until the reviewed production migration is approved and applied.

## Dependency findings
- Backend `npm audit`: 0 advisories.
- Frontend `npm audit`: 26 transitive advisories (15 low, 2 moderate, 9 high, 0 critical), including production paths in current Wallet Selector adapters. The critical Vite/Vitest findings were removed by upgrading the toolchain.
- npm offers only breaking and version-incompatible wallet-adapter changes for the remaining findings. Do not force those changes without a dedicated wallet compatibility pass. Treat the unresolved high findings as a production-release blocker or reduce the supported wallet set after product approval.

## Data integrity & UI honesty
- Wallet Explorer and RPC Directory display **real RPC/indexer data and real connectivity checks**; provider errors, rate limits (429), and missing data are surfaced to the user. No fabricated balances/history/holdings/stats/endpoints.
- **Testnet deployment/verification** is reported only with actual receipts/evidence and explicit authorization; otherwise marked **BLOCKED/IMPLEMENTED/TESTED LOCALLY** as appropriate.

## Reporting
Document vulnerabilities, reproduction steps, and impacted components in repository issues or maintainer contact channels (to be defined by project owner).
