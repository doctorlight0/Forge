# WASM Compatibility Report

## Overview
This report analyzes the WebAssembly compatibility of the Forge escrow contract for NEAR Testnet deployment, focusing on the `PrepareError(Deserialization)` error encountered during deployment attempts.

## Verified Facts

### Original WASM Artifact
- **Path**: `contracts/escrow/target/wasm32-unknown-unknown/release/near_forge_escrow.wasm`
- **SHA-256**: `bda720faefb836c37b365f66fb3b193bd5c5224c2a70335b4215d1fc56e13f17`
- **Size**: 386,246 bytes
- **WASM Parser Validation**: PASSED (using `wasmparser = "=0.83.0"`)
- **Build Toolchain**: `cargo build --release --target wasm32-unknown-unknown` with `near-sdk 5.30.1`
- **Build Warnings**: 
  - `unstable feature specified for -Ctarget-feature: atomics`
  - `unknown and unstable feature specified for -Ctarget-feature: core-redzone`
  - `unknown and unstable feature specified for -Ctarget-feature: simd`

### MVP Candidate WASM Artifact
- **Path**: `contracts/escrow/target-nearvm-mvp/wasm32-unknown-unknown/release/near_forge_escrow.wasm`
- **SHA-256**: `4bc1b643daf42d5951b55ee9e094cd49d520a0c3aee492c4aae1c2c9702dc32e`
- **Size**: 405,870 bytes
- **WASM Parser Validation**: PASSED (using `wasmparser = "=0.83.0"`)
- **Build Configuration**: `-Zbuild-std=panic_abort,std` and `-Ctarget-cpu=mvp` with nightly toolchain
- **Deployment Status**: Not deployed to Testnet

### NEAR Runtime Information
- **Network**: NEAR Testnet
- **Runtime Version**: NEAR 2.14.1, protocol version 88
- **Deployment Account**: `dragon-forge.testnet` (approximately 10 NEAR, no contract code after failed deployment)
- **Initializer**: `new()` with empty JSON arguments `{}`

## Failed Test
- **Error**: `CompilationError(PrepareError(Deserialization))`
- **Phase**: Deployment preparation (nearcore WASM deserialization)
- **Status**: WASM passes `wasmparser 0.83.0` validation but fails NEAR runtime deserialization

## Hypothesis
The `PrepareError(Deserialization)` is caused by WebAssembly features or instruction encodings that:
1. Are accepted by `wasmparser 0.83.0`
2. But are not supported by NEAR's Wasmtime-based VM (nearcore 2.14.1, protocol 88)

**Likely culprits** (based on build warnings):
- `simd` feature: generates SIMD instructions that may not be supported
- `atomics` feature: generates atomic memory operations
- `core-redzone`: unstable codegen feature

## Remaining Risks
- Without actual Testnet deployment, the exact cause cannot be 100% confirmed
- Multiple build configurations were tested, all passing `wasmparser` validation
- The MVP candidate built with nightly `-Ctarget-cpu=mvp` produces fewer warnings but unproven compatibility

## Next Safe Action
Build a candidate with all unstable WebAssembly features explicitly disabled and validate against NEAR's expected feature set before attempting deployment.