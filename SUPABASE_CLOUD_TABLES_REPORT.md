SUPABASE CLOUD TABLES REPORT — NEAR FORGE
============================================

PROJECT: /home/acknowledge/Desktop/near-forge
SUPABASE PROJECT: mupzcmrppcxivpkwbrgl
REPORT DATE: 2026-11-13

EXECUTIVE SUMMARY
-----------------
Anonymous sign-in is now working (code fix applied). However, the cloud database
tables (saved_wallets, saved_contracts) do not exist in the Supabase project yet.
The migration 202611120001_forge_saved_items.sql must be applied to create them.

CURRENT STATE BEFORE MIGRATION
-------------------------------
- Anonymous sign-in: WORKING (code bug fixed in supabase.ts:110)
- Session: Active and authenticated
- saved_wallets table: MISSING (PGRST205 error when querying)
- saved_contracts table: MISSING (PGRST205 error when querying)
- RLS policies: NOT YET APPLIED
- Cloud CRUD: CANNOT RUN (tables missing)

CODE FIXES ALREADY APPLIED (before migration)
----------------------------------------------
1. frontend/src/lib/supabase.ts:110
   - Fixed: settings.external.anonymous -> settings.external.anonymous_users
   - This enables the app to correctly detect anonymous sign-in availability

2. supabase/migrations/202611120001_forge_saved_items.sql
   - RLS policies changed from "to anon" -> "to authenticated" with auth.uid() = user_id
   - Grants changed from revoke all from anon -> grant to authenticated
   - Ownership checks preserved: (select auth.uid()) = user_id

3. frontend/src/data/ForgeDataContext.tsx:47-49,70-76
   - Added isAnonymousSignInDisabled() helper
   - Added dashboard config notice to error messages

4. frontend/src/lib/supabase.test.ts:22
   - Updated test mock field name from "anonymous" to "anonymous_users"

5. supabase/migrations/202611130001_fix_rls_policies.sql
   - Created corrective migration for rollback if anon-based policies were applied

MIGRATION STATUS
----------------
Migration 202611120001_forge_saved_items.sql: NOT APPLIED to remote project
- Tables saved_wallets and saved_contracts do not exist
- RLS policies not yet active
- Grants not yet applied

Migration 202611130001_fix_rls_policies.sql: NOT NEEDED yet
- Will only be required if the original migration applied anon-based policies
- Currently not needed since the original migration file has been corrected

REQUIRED ACTION: APPLY MIGRATION MANUALLY
------------------------------------------
Since the supabase CLI cannot connect to the remote project (IPv6 network
restriction), apply the following SQL directly in the Supabase Dashboard SQL
Editor:

1. Go to https://supabase.io/dashboard
2. Select project: mupzcmrppcxivpkwbrgl
3. Navigate to: SQL Editor
4. Copy and paste the migration SQL below
5. Click "Run"

EXACT SQL TO APPLY (migration 202611120001_forge_saved_items.sql):
------------------------------------------------------------------

begin;

create extension if not exists pgcrypto;

create or replace function public.forge_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.saved_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  network text not null default 'testnet' check (network = 'testnet'),
  account_id text not null check (
    char_length(account_id) between 2 and 64
    and (
      account_id ~ '^[0-9a-f]{64}$'
      or account_id ~ '^(([a-z0-9]+[-_])*[a-z0-9]+\.)*([a-z0-9]+[-_])*[a-z0-9]+$'
    )
  ),
  label text check (label is null or char_length(label) <= 80),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, network, account_id)
);

create table if not exists public.saved_contracts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  network text not null default 'testnet' check (network = 'testnet'),
  catalog_key text not null check (catalog_key ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  contract_account_id text check (
    contract_account_id is null
    or (
      char_length(contract_account_id) between 2 and 64
      and (
        contract_account_id ~ '^[0-9a-f]{64}$'
        or contract_account_id ~ '^(([a-z0-9]+[-_])*[a-z0-9]+\.)*([a-z0-9]+[-_])*[a-z0-9]+$'
      )
    )
  ),
  label text not null check (char_length(label) between 1 and 120),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, network, catalog_key)
);

create index if not exists saved_wallets_user_created_idx on public.saved_wallets (user_id, created_at desc);
create index if not exists saved_contracts_user_created_idx on public.saved_contracts (user_id, created_at desc);

drop trigger if exists saved_wallets_set_updated_at on public.saved_wallets;
create trigger saved_wallets_set_updated_at before update on public.saved_wallets for each row execute function public.forge_set_updated_at();
drop trigger if exists saved_contracts_set_updated_at on public.saved_contracts;
create trigger saved_contracts_set_updated_at before update on public.saved_contracts for each row execute function public.forge_set_updated_at();

alter table public.saved_wallets enable row level security;
alter table public.saved_contracts enable row level security;
alter table public.saved_wallets force row level security;
alter table public.saved_contracts force row level security;

grant select, insert, update, delete on public.saved_wallets to authenticated;
grant select, insert, update, delete on public.saved_contracts to authenticated;

create policy "saved_wallets_select_own" on public.saved_wallets for select to authenticated using ((select auth.uid()) = user_id);
create policy "saved_wallets_insert_own" on public.saved_wallets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saved_wallets_update_own" on public.saved_wallets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "saved_wallets_delete_own" on public.saved_wallets for delete to authenticated using ((select auth.uid()) = user_id);

create policy "saved_contracts_select_own" on public.saved_contracts for select to authenticated using ((select auth.uid()) = user_id);
create policy "saved_contracts_insert_own" on public.saved_contracts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saved_contracts_update_own" on public.saved_contracts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "saved_contracts_delete_own" on public.saved_contracts for delete to authenticated using ((select auth.uid()) = user_id);

commit;

POST-MIGRATION VERIFICATION
----------------------------
After applying the migration, verify the following:

1. Tables exist:
   - Query: SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
   - Expected: saved_wallets, saved_contracts

2. Authenticated grants exist:
   - Query: SELECT grantee, privilege FROM information_schema.table_grants WHERE table_name IN ('saved_wallets', 'saved_contracts');
   - Expected: select, insert, update, delete for "authenticated" role

3. RLS is enabled:
   - Query: SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('saved_wallets', 'saved_contracts');
   - Expected: relrowsecurity = true

4. Anonymous authenticated users can access their own records:
   - Sign in anonymously (works code-snip fix)
   - Insert a test record with user's own user_id
   - Read it back with .eq('user_id', session.user.id)
   - Expected: succeeds

5. Users cannot access another user's records:
   - Two anonymous sessions produce different user_ids
   - Query with wrong user_id returns no results (RLS blocks it)
   - Expected: cross-user access denied

6. True unauthenticated users cannot access private records:
   - Requests without a valid session fail
   - Expected: 401 / permission denied

CLOUD CRUD TESTING (after migration)
-------------------------------------
Using an authenticated anonymous session, test the following operations:

1. Insert a disposable saved wallet:
   - supabase.from('saved_wallets').insert({ user_id, network: 'testnet', account_id: 'alice.testnet', label: 'Alice' })
   - Verify: returns inserted row with generated id

2. Read it back:
   - supabase.from('saved_wallets').select('*').eq('user_id', userId).eq('network', 'testnet').eq('account_id', 'alice.testnet')
   - Verify: returns the inserted row

3. Update it:
   - supabase.from('saved_wallets').update({ label: 'Alice Updated' }).eq('id', row.id)
   - Verify: label changed, updated_at timestamp updated (via forge_set_updated_at trigger)

4. Delete it:
   - supabase.from('saved_wallets').delete().eq('id', row.id)
   - Verify: row no longer exists

5. Repeat for saved_contracts:
   - Insert: catalog_key, label, network
   - Read: filter by user_id and network
   - Update: change label
   - Delete: remove by id

6. User isolation verification:
   - Run entire test suite with two different anonymous sessions
   - Session A's data must not be visible to Session B
   - RLS policy (auth.uid() = user_id) must enforce this

FILES CHANGED (during this repair)
-----------------------------------
1. frontend/src/lib/supabase.ts         - Fixed anonymous_users field name
2. supabase/migrations/202611120001_forge_saved_items.sql - Fixed RLS to use authenticated
3. frontend/src/data/ForgeDataContext.tsx - Added disability detection UI message
4. frontend/src/lib/supabase.test.ts   - Updated test mock field name
5. supabase/migrations/202611130001_fix_rls_policies.sql - Created corrective migration

TEST RESULTS
------------
- Frontend unit tests: 37/37 passed (12 test files)
- TypeScript check: tsc -b passes with no errors
- Production build: vite build succeeds
- Anonymous sign-in: WORKS (after code fix)
- Cloud tables: NOT YET (migration pending)
- Cloud CRUD: NOT YET (tables missing)

REMAINING MANUAL ACTIONS
------------------------
1. Apply the migration SQL in Supabase Dashboard SQL Editor (see exact SQL above)
2. After migration, sign in anonymously and verify cloud CRUD works
3. Test user isolation with two anonymous sessions
4. Verify localStorage fallback still works if Supabase is unavailable
5. Confirm "Cloud sign-in blocked" error no longer appears

SUCCESS CRITERIA
----------------
- [ ] Migration applied: saved_wallets and saved_contracts tables exist
- [ ] RLS enabled with authenticated role and auth.uid() = user_id ownership checks
- [ ] Anonymous sign-in succeeds and creates valid session
- [ ] Cloud CRUD operations (insert/read/update/delete) succeed for both tables
- [ ] User isolation: different anonymous sessions cannot access each other's data
- [ ] Frontend displays "Cloud synced" status, not "Cloud tables missing"
- [ ] Saved items survive browser refresh (session persistence)

FINAL VERIFICATION CHECKlist
----------------------------
☐ Migration SQL applied to project mupzcmrppcxivpkwbrgl
☐ Tables: public.saved_wallets exists
☐ Tables: public.saved_contracts exists
☐ RLS enabled on both tables
☐ Grants: authenticated has SELECT, INSERT, UPDATE, DELETE
☐ Policies: (select auth.uid()) = user_id ownership checks present
☐ Anonymous sign-in: succeeds, returns session with user.id
☐ Cloud CRUD: insert/read/update/delete all succeed
☐ User isolation: cross-session data access blocked by RLS
☐ Frontend: status shows "Cloud synced" or "Local only" (not "Cloud tables missing")
☐ LocalStorage fallback: intact and functional

GENERATED BY: SUPABASE CLOUD TABLES REPAIR SCRIPT
DATE: 2026-11-13
PROJECT: Near Forge