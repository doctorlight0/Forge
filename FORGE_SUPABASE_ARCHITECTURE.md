# Forge Supabase architecture

## Scope

Forge uses its dedicated Supabase project only for workspace metadata that is safe to persist off-chain:

- saved public NEAR Testnet account IDs;
- saved Contract Library entries and an optional deployed contract account ID once one is genuinely configured.

NEAR remains authoritative for balances, access keys, contract code/state, transactions, receipts, and all escrow authorization and settlement.

## Client and configuration

The typed browser client is in `frontend/src/lib/supabase.ts`. It reads only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

The module rejects missing/invalid project URLs and obvious secret/service-role key formats. It performs an eight-second authenticated settings request before starting persistence. No privileged key is accepted or required.

## Authentication model

Forge uses a persistent anonymous Supabase Auth session. Anonymous users receive the `authenticated` Postgres role, allowing RLS to scope records to `auth.uid()` without introducing email/password UX.

This identity is deliberately independent of the connected NEAR wallet. It proves ownership of saved rows, not ownership of a NEAR account. A future wallet-linked identity feature would require a backend-issued nonce and verified NEAR signature before linking an account.

If anonymous auth is disabled or Supabase is unavailable, saved metadata stays in browser `localStorage`. The UI reports browser-only or failed-sync state and provides a retry action.

## Tables

### `saved_wallets`

- UUID primary key and `user_id` foreign key to `auth.users` with cascade delete.
- Testnet-only network and constrained NEAR account ID.
- Optional short label, created/updated timestamps, duplicate-preventing unique constraint, and owner/time index.

### `saved_contracts`

- UUID primary key and `user_id` foreign key to `auth.users` with cascade delete.
- Testnet-only network, constrained catalog key, label, and optional NEAR account ID.
- Created/updated timestamps, duplicate-preventing unique constraint, and owner/time index.

## RLS and grants

Both tables enable and force RLS. The unauthenticated `anon` database role receives no table access. The `authenticated` role receives only CRUD privileges, with separate select/insert/update/delete policies requiring `auth.uid() = user_id`.

## Synchronization flow

1. Load the browser fallback immediately.
2. Validate configuration and verify project reachability.
3. Restore or create an anonymous Supabase Auth session.
4. Upsert existing browser saves into the owner's rows.
5. Read the owner's rows under RLS and refresh the browser cache.
6. Apply later save/remove operations optimistically, then remotely.
7. Retain the local change and report the sync error if a remote request fails.

Persistence requests occur only during initialization and explicit save/remove actions.

## Current verification state

- Supabase project/auth endpoint: **VERIFIED**, HTTP 200 on 2026-11-12.
- Anonymous Auth: **BLOCKED**, the live project reports “Anonymous sign-ins are disabled”.
- `saved_wallets` table: **BLOCKED**, HTTP 404/PGRST205 because the migration is not applied.
- Migration review: **IMPLEMENTED**, `supabase/migrations/202611120001_forge_saved_items.sql`.
- RLS runtime tests: **BLOCKED** until anonymous Auth is enabled and migration application is approved.
