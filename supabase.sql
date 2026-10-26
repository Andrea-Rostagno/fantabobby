-- FantaBobby: da incollare una volta in Supabase → SQL Editor → Run.
-- Una riga per account con rosa, consigliati/formazioni di ogni giornata e valori modificati a mano.
create table if not exists public.stato (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  dati       jsonb not null default '{}'::jsonb,
  aggiornato timestamptz not null default now()
);

alter table public.stato enable row level security;

-- ogni account vede e modifica solo i propri dati
drop policy if exists "solo il proprietario" on public.stato;
create policy "solo il proprietario" on public.stato
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- modalità ospite: chi entra senza login può solo LEGGERE (mai scrivere) i dati salvati
drop policy if exists "lettura ospiti" on public.stato;
create policy "lettura ospiti" on public.stato
  for select to anon
  using (true);
