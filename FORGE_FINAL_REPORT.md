# Forge final production-readiness report

**Date:** 2026-11-12  
**Repository:** `/home/acknowlege/Desktop/near-forge`  
**Branch:** `main`  
**Overall status:** **BLOCKED** for production release

Forge is rebranded, the application and NEAR integrations build and test successfully, Supabase reachability is verified, the persistence implementation and migration are complete, and the retired NearBlocks v1 integration has been migrated to live v3 endpoints. Production acceptance is blocked by unapplied database/RLS changes, disabled anonymous Supabase Auth, unresolved high-severity Wallet Selector dependency advisories, and the intentionally undeployed escrow contract.

## Acceptance status

| Area | Status | Result |
|---|---|---|
| Product branding | **VERIFIED** | Browser title, metadata, shell, logo, footer, README, and current docs say Forge. Technical NEAR names and internal package/crate IDs remain for compatibility. |
| Existing implementation preserved | **VERIFIED** | Existing dirty worktree was inspected and preserved; no reset or replacement architecture was used. |
| Supabase project connectivity | **VERIFIED** | Configured Forge Auth settings endpoint returned HTTP 200 using the publishable key. |
| Typed Supabase client | **VERIFIED** | Official SDK, typed schema, env validation, secret-key rejection, timeout, and graceful fallback compile and test. |
| Saved account/contract persistence code | **IMPLEMENTED BUT UNVERIFIED** | Browser fallback works; cloud sync is blocked by disabled anonymous Auth and missing tables. |
| Supabase migration | **IMPLEMENTED BUT UNVERIFIED** | Reviewed additive SQL exists but was not applied without production approval. |
| RLS policies | **IMPLEMENTED BUT UNVERIFIED** | Forced RLS, grants, ownership policies, constraints, and indexes are defined; runtime isolation cannot be tested before migration/auth setup. |
| NEAR Testnet RPC | **VERIFIED** | Final block and `testnet` account queries returned HTTP 200 with real data. |
| NearBlocks indexer | **VERIFIED** | v1 retirement was detected and fixed. v3 transaction, FT, NFT, and staking endpoints returned HTTP 200. |
| Wallet Selector initialization | **VERIFIED** | Headless runtime QA rendered the app and initialized the wallet integration. A real wallet connection/signature still requires user interaction. |
| Escrow frontend safeguards | **VERIFIED** | Writes remain blocked when no verified contract account is configured; no success or receipt is fabricated. |
| Escrow contract logic | **VERIFIED** locally | **55 Rust unit tests** (`cargo test --lib`), fmt, clippy, and WASM release build pass. No independent audit or live Testnet lifecycle exists. |
| Contract Library/RPC Directory | **VERIFIED** locally | Tests and production build pass; provider directory uses current v3 indexer URL. |
| Backend API | **VERIFIED** locally | 5 tests and syntax check pass; SSRF allowlist, validation, error envelopes, CORS, and request limiting remain intact. |
| Production frontend build | **VERIFIED** | Vite 8.3.8 build succeeds with no TypeScript errors. |
| Secret handling | **VERIFIED** | `.env` remains ignored, `.env.example` contains placeholders, no service-role/private key was found in tracked source. |
| Dependency security | **BLOCKED** | Backend has 0 advisories. Frontend has 26 production-path advisories: 15 low, 2 moderate, 9 high, 0 critical, mainly from current Wallet Selector adapters. |
| Escrow Testnet deployment/E2E | **BLOCKED** | No approved deployment, funded account, contract ID, or receipts. |

## Implemented changes

- Completed Forge branding across current user-facing surfaces and documentation.
- Added `@supabase/supabase-js`, typed database definitions, and a clean client module.
- Added anonymous-session, owner-scoped saved-account and saved-contract synchronization with immediate browser fallback.
- Added visible sync/loading/failure feedback without blocking public NEAR functionality.
- Added an additive SQL migration with UUID keys, `auth.users` foreign keys, timestamps, checks, unique constraints, indexes, grants, forced RLS, and separate CRUD ownership policies.
- Sanitized `.env.example`; actual publishable configuration remains only in ignored `.env`.
- Updated Wallet Explorer and backend proxy from retired NearBlocks v1 page pagination to v3 cursor pagination.
- Added NearBlocks v3 unit coverage and Supabase configuration security tests.
- Removed unused direct `near-api-js` and `react-router-dom` dependencies.
- Upgraded Vite/Vitest/React plugin tooling, removing all critical dependency findings.
- Expanded environment, migration, architecture, security, deployment, rollback, audit, and evidence documentation.

## Database migration

File: `supabase/migrations/202611120001_forge_saved_items.sql`

Creates:

- `public.saved_wallets`
- `public.saved_contracts`
- `public.forge_set_updated_at()`
- owner/time indexes and update triggers
- eight owner-only RLS policies

It does not store balances, receipts, transaction statuses, access keys, escrow authorization, or contract state.

## Test and build results

| Check | Result |
|---|---|
| Frontend Vitest | **PASS** — 8 files, 23 tests |
| Frontend TypeScript + production build | **PASS** — Vite 8.3.8, 1054 modules |
| Backend Node test runner | **PASS** — 5 tests |
| Backend syntax check | **PASS** |
| Rust `cargo fmt -- --check` | **PASS** |
| Rust clippy with warnings denied | **PASS** |
| Rust unit tests | **PASS** — 55 unit tests (`cargo test --lib`) |
| Rust sandbox integration tests | **BLOCKED** — link stage fails (disk/link constraint), not a code error |
| Rust WASM release build | **PASS** — 333K |
| WASM SHA-256 | `05bac09002e16bbe1b5ab1c653aaa00b0e00a5ab3e35979a435b6993f9357567` |
| Supabase Auth endpoint | **PASS** — HTTP 200 |
| Supabase table probe | **BLOCKED** — HTTP 404/PGRST205, migration not applied |
| Live NEAR final block/account RPC | **PASS** — HTTP 200 |
| Live NearBlocks v3 resources | **PASS** — HTTP 200 |
| Headless application smoke test | **PASS** — Forge UI rendered; sync blocker surfaced correctly |
| Backend npm audit | **PASS** — 0 advisories |
| Frontend npm audit | **BLOCKED** — 26 advisories, including 9 high |

Build warnings that do not fail compilation: the wallet dependency chunk is about 2.35 MB minified/665.58 KB gzip; transitive wallet packages externalize browser `crypto`/`util`; transitive `js-sha256` contains direct `eval` paths.

## Security findings

- Supabase anonymous Auth is disabled in the live project.
- The migration and RLS are not applied, so cloud persistence and cross-user isolation are not yet operationally verified.
- Saved NEAR account IDs are explicitly treated as watchlist metadata, never wallet-ownership proof.
- No NEAR signature challenge links a wallet to Supabase. This is safe for current metadata but must be added before any wallet-authorized off-chain feature.
- Remaining frontend advisories are in production dependency paths, primarily HERE/Meteor/current Wallet Selector transitive packages. npm suggests incompatible/breaking version changes; no force fix was applied.
- The contract is unaudited, has incomplete storage-deposit economics, and lacks sandbox failure-injection/E2E coverage.
- Backend rate limiting is in-memory and should be moved to an edge/shared limiter for horizontally scaled production.

## Files created in this pass

- `FORGE_AUDIT.md`
- `FORGE_SUPABASE_ARCHITECTURE.md`
- `FORGE_FINAL_REPORT.md`
- `docs/ENVIRONMENT.md`
- `docs/SUPABASE_MIGRATIONS.md`
- `frontend/src/data/ForgeDataContext.tsx`
- `frontend/src/lib/database.types.ts`
- `frontend/src/lib/supabase.ts`
- `frontend/src/lib/supabase.test.ts`
- `frontend/src/near/indexer.test.ts`
- `supabase/migrations/202611120001_forge_saved_items.sql`

## Files materially updated in this pass

- Root configuration/docs: `.env.example`, `README.md`, `SECURITY.md`, `WORK_PROGRESS.md`, `FINAL_REPORT.md`
- Architecture/deployment/evidence: `docs/ARCHITECTURE.md`, `docs/DEPLOYMENT.md`, `docs/evidence/*`
- Frontend metadata/config/shell: `frontend/index.html`, `frontend/package*.json`, `frontend/vite.config.ts`, `frontend/src/App.tsx`, `frontend/src/config.ts`, `frontend/src/index.css`, `frontend/src/vite-env.d.ts`
- Frontend integrations/pages: `frontend/src/near/indexer.ts`, `frontend/src/near/rpc.ts`, `frontend/src/near/walletConfig.test.ts`, `frontend/src/data/rpcProviders.ts`, `frontend/src/pages/ExplorerPage.tsx`, `frontend/src/pages/LibraryPage.tsx`, `frontend/src/pages/rpcDirectoryUtils.test.ts`
- Backend: `backend/package*.json`, `backend/src/server.js`, `backend/test/server.test.js`
- Contract branding/evidence: `contracts/escrow/src/lib.rs`

Other pre-existing uncommitted files were preserved and may also appear in `git status`.

## Exact manual actions required

1. Connect the suggested Supabase integration or open the Forge Supabase dashboard with an authorized administrator.
2. Confirm the project reference matches the dedicated Forge project; do not use Trap Run, Agent Leash, or a shared project.
3. Enable anonymous sign-ins in Supabase Auth settings.
4. Review and explicitly approve application of `supabase/migrations/202611120001_forge_saved_items.sql`.
5. Take/confirm a database backup or PITR policy, then apply the migration using the linked CLI or SQL editor.
6. Run the two-session RLS tests in `docs/SUPABASE_MIGRATIONS.md`, including unauthenticated denial and cross-user write attempts.
7. Decide how to resolve the 9 high frontend dependency advisories: wait for compatible Wallet Selector releases, perform a dedicated adapter upgrade/downgrade test, or approve reducing supported wallet adapters. Do not ship unchanged without an explicit risk decision.
8. Configure production variables from `docs/ENVIRONMENT.md` and deploy the frontend/backend artifacts.
9. If escrow E2E is required, separately authorize a funded Testnet deployment, verify receipts/state, then set `VITE_ESCROW_CONTRACT_ID` and execute the documented lifecycle tests.

Until steps 3–7 are complete, Forge should not be labeled production-ready. Public NEAR exploration and browser-local saved metadata remain functional.
