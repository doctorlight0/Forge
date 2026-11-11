# NEAR Forge

NEAR developer infrastructure platform: **Wallet Explorer**, **Escrow Studio**, **Contract Library**, and **RPC Directory**.

> Status: **active implementation (early scaffold)**. See [`WORK_PROGRESS.md`](WORK_PROGRESS.md) for live progress and [`FINAL_REPORT.md`](FINAL_REPORT.md) for acceptance status (when produced).

## Modules

1. **Wallet Explorer** — real NEAR account search (named + implicit), balances, tx history, tokens, NFTs, staking, access keys, tx details via real RPC/indexed APIs.
2. **Escrow Studio** — reusable Rust NEAR smart-contract escrow engine with four workflows: Freelance, Milestone, Time-locked, Arbitrated. Real on-chain state transitions; wallet-signed transactions (no seed phrases/private keys).
3. **Contract Library** — reusable templates, source, docs, parameters, deploy instructions, and test results. *No contract claimed audited without independent audit.*
4. **RPC Directory** — documented mainnet/testnet/archival RPCs, indexer APIs, explorers, faucets, SDKs, with endpoint connectivity checks. No invented URLs/prices/stats.

## Repository layout

```
frontend/   # React + TypeScript + Vite + Tailwind UI
backend/    # Node.js backend (API/indexing/proxy where appropriate)
contracts/  # Rust NEAR smart contracts (escrow engine)
docs/       # Deployment docs, specs, evidence
scripts/    # Build/deploy/verify helpers
tests/      # Cross-cutting test assets & evidence
```

## Development (WIP)

Prereqs: Node.js, npm, Rust toolchain (`cargo`, `rustc`), and NEAR tooling as needed.

Setup/build/test instructions will be filled in as modules are implemented and verified. See `WORK_PROGRESS.md` for current state and blockers.

## Security

- Wallet-based signing only; the app never requests seed phrases or private keys.
- No hardcoded secrets committed. Use `.env` locally (see `.env.example` when added).
- Testnet deployment/spending requires explicit human authorization; receipts recorded only when actually performed.

## License

TBD (to be confirmed). 
