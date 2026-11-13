# Deployment & Verification — Forge

## Status
- **Testnet deployment:** NOT PERFORMED (BLOCKED pending explicit human authorization and a funded deployer account). No contract addresses or transaction receipts are fabricated.
- **Supabase migration:** REVIEWED BUT NOT APPLIED. Production application requires explicit approval.
- **Local/test readiness:** Frontend, backend, and contract tests pass locally. See `FORGE_FINAL_REPORT.md` for current results.

## Prerequisites
- Node.js/npm (frontend/backend), Rust toolchain + `wasm32-unknown-unknown` target (contract).
- NEAR CLI (RS) or equivalent, configured with an authorized account for deployment/signing.
- Testnet NEAR for deployment/storage (use official/community faucets per `docs.near.org/tools/faucet`; never share seed phrases/private keys).

## 1) Escrow contract build (WASM)
```bash
cd contracts/escrow
rustup target add wasm32-unknown-unknown
cargo test                      # unit/state/authorization/accounting tests
cargo build --release --target wasm32-unknown-unknown
```
Artifact: `contracts/escrow/target/wasm32-unknown-unknown/release/near_forge_escrow.wasm` (path may vary by crate name; confirm after build).

Record: `sha256sum` of WASM, exact command output, and test results in `docs/evidence/`.

## 2) Authorized Testnet deployment (manual, requires approval)
```bash
# Example (adjust account names)
near deploy --accountId <escrow>.<deployer>.testnet \
  --wasmFile contracts/escrow/target/wasm32-unknown-unknown/release/near_forge_escrow.wasm

near call <escrow>.<deployer>.testnet new '{}' --accountId <deployer>.testnet
```
- Capture **actual** transaction hashes, receipts/outcomes, and contract account ID.
- Only after verified receipts: set `VITE_ESCROW_CONTRACT_ID` in the deployment environment.
- Label as **VERIFIED ON TESTNET** only with evidence.

## 3) Post-deploy lifecycle verification (authorized)
Perform and record real wallet-signed transactions on Testnet:
- Create escrow (each workflow), fund (exact deposit), approve/milestone approve, release, cancel/refund (eligible cases), raise dispute, arbitrator resolve.
- Confirm state via `get_escrow/get_milestones/get_history` and explorer receipts.

## 4) Frontend
```bash
cd frontend
npm install
npm run build    # production build
npm run dev      # local dev
```
Configure network and (after deployment) escrow contract address. Wallet connection uses NEAR Wallet Selector; no keys collected.

Production hosting must provide the variables in `docs/ENVIRONMENT.md`. The root `.env` is loaded by Vite but remains Git-ignored.

## 5) Backend
```bash
cd backend
npm install
cp ../.env.example ../.env   # edit as needed
npm start
```
Provides provider config, endpoint connectivity checks, and optional indexer proxy. Add API keys server-side only if required.

## 6) Supabase

Review and apply `supabase/migrations/202611120001_forge_saved_items.sql` only after explicit approval. Follow `docs/SUPABASE_MIGRATIONS.md`, then test unauthenticated denial and two-user RLS isolation before considering persistence verified.

## 7) Application rollback

- Frontend/backend: redeploy the previous known-good artifacts. The additive Supabase tables may remain without affecting NEAR authority.
- Supabase: prefer leaving data intact. Dropping tables is destructive and requires separate approval and a backup.
- Contract: no contract was deployed or upgraded in this work. Any future contract rollback/upgrade requires its own authorization and receipt verification.

## Environment variables
See root `.env.example`. Never commit `.env` or credentials.
