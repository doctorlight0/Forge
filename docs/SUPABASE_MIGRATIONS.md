# Forge Supabase migration and rollback

## Migration under review

`supabase/migrations/202611120001_forge_saved_items.sql`

The migration creates only `saved_wallets`, `saved_contracts`, their indexes, timestamp triggers, grants, and owner-only RLS policies. It does not store blockchain balances or escrow state and does not modify another application's tables.

## Pre-application review

1. Confirm the selected Supabase project is Forge's dedicated project.
2. Take or confirm a current database backup/PITR policy.
3. Review the SQL and verify there are no existing conflicting table/function names.
4. Enable anonymous Auth sign-ins. Live verification on 2026-11-12 showed they are currently disabled.
5. Apply first to a non-production branch/project when available.

## Application

Applying to production requires explicit approval and authenticated Supabase CLI/dashboard access. No production migration was applied during this work.

With a correctly linked CLI:

```bash
supabase db push --include-all
```

Alternatively, paste the migration into the Forge project's SQL editor and run it once. Capture the execution result and migration history.

## Post-application verification

```sql
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('saved_wallets', 'saved_contracts');

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('saved_wallets', 'saved_contracts')
order by tablename, cmd;
```

Then use two separate anonymous browser sessions. Confirm each sees only its own rows, cross-user insert/update/delete attempts fail, unauthenticated publishable-key access is denied, and each owner's data survives refresh.

## Rollback

Rollback is destructive and requires separate approval plus a backup:

```sql
begin;
drop table if exists public.saved_contracts;
drop table if exists public.saved_wallets;
drop function if exists public.forge_set_updated_at();
commit;
```

The preferred first response is a data-preserving application rollback: deploy the previous frontend/backend version and leave these isolated, non-authoritative tables in place.
