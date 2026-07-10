-- Bunny Meadow backend schema.
-- One shared tracker row + a tiny config table holding the shared password.
-- RLS is enabled with NO policies, so the anon/authenticated roles get zero
-- access. Only the service_role key (used inside the `sync` edge function,
-- server-side, never shipped to the browser) bypasses RLS.

create table if not exists public.tracker (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_config (
  key text primary key,
  value text not null
);

alter table public.tracker enable row level security;
alter table public.app_config enable row level security;

-- Seed the single tracker row and the shared password.
-- Change the password any time with:
--   update public.app_config set value = 'new-password' where key = 'shared_password';
insert into public.tracker (id, state) values ('sister', '{}'::jsonb)
  on conflict (id) do nothing;

insert into public.app_config (key, value) values ('shared_password', '2alexarae')
  on conflict (key) do nothing;
