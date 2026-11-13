# Forge environment variables

Create a root `.env` for local development or configure the same values in the deployment platform. Vite loads the repository root through `frontend/vite.config.ts`. `.env` and `.env.local` are Git-ignored.

## Frontend

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_SUPABASE_URL` | Yes for sync | Forge's dedicated Supabase project URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes for sync | Browser-safe publishable key only. Never use `sb_secret_*` or service-role credentials. |
| `VITE_ESCROW_CONTRACT_ID` | Only after deployment | Verified NEAR Testnet escrow contract account. Leave empty otherwise. |
| `VITE_BACKEND_URL` | Optional | Express API base URL; default `http://localhost:8787`. |
| `VITE_USE_BACKEND_PROXY` | Optional | Set `true` to proxy transaction history through the backend. |
| `VITE_DEFAULT_NETWORK` | Compatibility | Must remain `testnet`; the current frontend is intentionally Testnet-only. |

## Backend

| Variable | Required | Purpose |
|---|---:|---|
| `PORT` | Optional | API port; default `8787`. |
| `CORS_ORIGIN` | Production | Comma-separated allowed frontend origins. Do not use `*` in production. |
| `RPC_CHECK_ALLOWLIST` | Optional | Additional exact NEAR RPC URLs allowed by the endpoint checker. |
| `NEARBLOCKS_API_KEY_TESTNET` | Optional | Server-side provider credential for the indexer proxy. |

The backend does not need and must not receive a Supabase service-role key for the implemented features.

## Production checklist

- Store values in the hosting platform's encrypted environment configuration.
- Confirm the Supabase project reference is Forge's dedicated project.
- Enable anonymous Supabase Auth in the Forge project before relying on cloud sync; it was disabled during the 2026-11-12 verification.
- Use the exact production frontend origin in `CORS_ORIGIN`.
- Do not set an escrow contract account until its deployment receipt and view methods are verified.
- Rebuild the frontend after changing any `VITE_*` value.
