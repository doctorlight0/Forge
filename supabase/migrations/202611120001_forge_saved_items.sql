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