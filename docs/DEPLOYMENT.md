# Deployment & Verification — NEAR Forge

## Status
- **Testnet deployment:** NOT PERFORMED (BLOCKED pending explicit human authorization and a funded deployer account). No contract addresses or transaction receipts are fabricated.
- **Local/test readiness:** Contract source and unit tests implemented; frontend and backend scaffolds implemented. Build/test evidence must be captured in `docs/evidence/` and summarized in `FINAL_REPORT.md`.

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
- Only after verified receipts: set `ESCROW_CONTRACT_BY_NETWORK.testnet` in `frontend/src/config.ts`.
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

## 5) Backend
```bash
cd backend
npm install
cp ../.env.example ../.env   # edit as needed
npm start
```
Provides provider config, endpoint connectivity checks, and optional indexer proxy. Add API keys server-side only if required.

## Environment variables
See root `.env.example`. Never commit `.env` or credentials.
