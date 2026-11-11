# SECURITY.md — NEAR Forge

## Scope
NEAR Forge includes a frontend (React/Vite), backend (Node/Express), and a native Rust NEAR escrow smart contract (`contracts/escrow`). This document summarizes security posture, assumptions, and honest limitations.

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
- Rate limiting and deeper hardening should be added for public deployments.

## Data integrity & UI honesty
- Wallet Explorer and RPC Directory display **real RPC/indexer data and real connectivity checks**; provider errors, rate limits (429), and missing data are surfaced to the user. No fabricated balances/history/holdings/stats/endpoints.
- **Testnet deployment/verification** is reported only with actual receipts/evidence and explicit authorization; otherwise marked **BLOCKED/IMPLEMENTED/TESTED LOCALLY** as appropriate.

## Reporting
Document vulnerabilities, reproduction steps, and impacted components in repository issues or maintainer contact channels (to be defined by project owner).
