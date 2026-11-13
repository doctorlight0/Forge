-- Corrective migration: Fix RLS policies from anon to authenticated
-- This migration should be run after 202611120001_forge_saved_items.sql
-- if the anonymous-based policies were already applied to the remote project.

drop policy if exists "saved_wallets_select_own" on public.saved_wallets;
drop policy if exists "saved_wallets_insert_own" on public.saved_wallets;
drop policy if exists "saved_wallets_update_own" on public.saved_wallets;
drop policy if exists "saved_wallets_delete_own" on public.saved_wallets;
drop policy if exists "saved_contracts_select_own" on public.saved_contracts;
drop policy if exists "saved_contracts_insert_own" on public.saved_contracts;
drop policy if exists "saved_contracts_update_own" on public.saved_contracts;
drop policy if exists "saved_contracts_delete_own" on public.saved_contracts;

create policy "saved_wallets_select_own" on public.saved_wallets for select to authenticated using ((select auth.uid()) = user_id);
create policy "saved_wallets_insert_own" on public.saved_wallets for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saved_wallets_update_own" on public.saved_wallets for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "saved_wallets_delete_own" on public.saved_wallets for delete to authenticated using ((select auth.uid()) = user_id);

create policy "saved_contracts_select_own" on public.saved_contracts for select to authenticated using ((select auth.uid()) = user_id);
create policy "saved_contracts_insert_own" on public.saved_contracts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "saved_contracts_update_own" on public.saved_contracts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "saved_contracts_delete_own" on public.saved_contracts for delete to authenticated using ((select auth.uid()) = user_id);