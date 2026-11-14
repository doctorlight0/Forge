# Testnet Deployment Procedure

## Overview
This document outlines the procedure for deploying the Forge escrow contract to NEAR Testnet. **Note**: Actual deployment requires explicit human authorization and a funded deployer account. This procedure documents the steps that would be taken with proper authorization.

## Prerequisites

### Authorized Deployment Account
- Account ID: `dragon-forge.testnet` (or similar authorized account)
- Balance: Minimum 10 NEAR (previous balance; must be funded via official faucet)
- Owner: Must have seed phrase/private key (not to be shared or printed)

### Contract Artifact
- **WASM file path**: `contracts/escrow/target/wasm32-unknown-unknown/release/near_forge_escrow.wasm`
- **SHA-256 hash**: Must be recorded and verified
- **Build command**: `cargo build --release --target wasm32-unknown-unknown`
- **Recorded hash** (original): `bda720faefb836c37b365f66fb3b193bd5c5224c2a70335b4215d1fc56e13f17`

### Network Configuration
- Network: NEAR Testnet
- RPC endpoint: `https://testnet.near.org` (or equivalent)
- Explorer: `https://testnet.nearblocks.io`

## Deployment Steps (Requires Authorization)

### Step 1: Verify WASM Artifact
```bash
# Verify SHA-256 hash
sha256sum contracts/escrow/target/wasm32-unknown-unknown/release/near_forge_escrow.wasm

# Expected (original): bda720faefb836c37b365f66fb3b193bd5c5224c2a70335b4215d1fc56e13f17

# Or for MVP candidate:
sha256sum contracts/escrow/target-nearvm-mvp/wasm32-unknown-unknown/release/near_forge_escrow.wasm
# Expected: 4bc1b643daf42d5951b55ee9e094cd49d520a0c3aee492c4aae1c2c9702dc32e
```

### Step 2: Fund the Deployment Account
```bash
# Use NEAR Testnet faucet: https://testnet.near.org/tools/faucet
# Fund dragon-forge.testnet with at least 10 NEAR for initial deployment
# Additional NEAR may be needed for storage deposits during operation
```

### Step 3: Deploy the Contract
```bash
# Deploy the WASM contract code
near deploy --accountId dragon-forge.testnet \
  --wasmFile contracts/escrow/target/wasm32-unknown-unknown/release/near_forge_escrow.wasm

# Verify deployment receipt
# The transaction should succeed without PrepareError(Deserialization)
```

### Step 4: Initialize the Contract
```bash
# Call the new() initializer with empty JSON arguments
near call dragon-forge.testnet new '{}' --accountId dragon-forge.testnet

# Verify the contract is deployed and accessible
near call dragon-forge.testnet get_escrow 1 --accountId <any_account>
```

### Step 5: Post-Deployment Lifecycle Verification
Perform the following transactions (requires funded accounts):

1. **Create escrow** (e.g., freelance mode):
   ```bash
   near call dragon-forge.testnet create_escrow '{"kind": "freelance", "seller": "seller.testnet", "total_amount": "100", "description": "test"}' --accountId buyer.testnet --deposit 10
   ```

2. **Fund escrow**:
   ```bash
   near call dragon-forge.testnet fund_escrow '{"escrow_id": 1}' --accountId buyer.testnet --deposit 100
   ```

3. **Release funds**:
   ```bash
   near call dragon-forge.testnet release '{"escrow_id": 1, "milestone_id": null}' --accountId buyer.testnet
   ```

4. **Test refund** (if applicable):
   ```bash
   near call dragon-forge.testnet refund '{"escrow_id": 1}' --accountId buyer.testnet
   ```

5. **Test dispute resolution** (if applicable):
   ```bash
   near call dragon-forge.testnet raise_dispute '{"escrow_id": 1, "reason": "test dispute"}' --accountId buyer.testnet
   near call dragon-forge.testnet resolve_dispute '{"escrow_id": 1, "release_to_seller": "50", "refund_to_buyer": "50"}' --accountId <arbitrator>.testnet
   ```

## Verification Commands

### Check Contract Status
```bash
# Get contract version
near call dragon-forge.testnet contract_version --accountId dragon-forge.testnet

# Get escrow details
near call dragon-forge.testnet get_escrow '{"escrow_id": 1}' --accountId dragon-forge.testnet
```

### Check Transaction Receipts
- Use NEAR Explorer or `near tx <transaction_hash>` to view receipts
- Look for `Status: Success` on all state-changing calls
- Verify no `PrepareError` or other deserialization errors

### Required Receipts for "VERIFIED ON TESTNET" Label
- All lifecycle transactions (create, fund, release, refund, dispute, resolve)
- Contract account ID and balance after each transaction
- Gas usage and remaining balance

## Important Notes

### Do NOT Do Following
- ❌ Deploy without verifying the WASM artifact hash
- ❌ Call state-changing methods without authorized accounts
- ❌ Share seed phrases or private keys
- ❌ Apply Supabase migrations or change Vercel environment variables
- ❌ Deploy with the known-broken original WASM that causes `PrepareError(Deserialization)`

### Only After Verified Deployment
- ✅ Set `VITE_ESCROW_CONTRACT_ID` environment variable to the deployed contract ID
- ✅ Apply Supabase migrations with explicit approval
- ✅ Update frontend configuration with contract address
- ✅ Record transaction hashes and receipts in `docs/evidence/`

### Failure Handling
If `PrepareError(Deserialization)` occurs during deployment:
1. Do not proceed with the deployment
2. Build a new WASM candidate with unstable features disabled
3. Record the new SHA-256 hash
4. Retry the deployment procedure

### Evidence Documentation
Record the following in `docs/evidence/`:
- WASM SHA-256 hash
- Build command and toolchain version
- Transaction hashes and receipts
- Success/failure status of each lifecycle step
- Any error messages encountered