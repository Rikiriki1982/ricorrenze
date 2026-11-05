-- Schema app Ricorrenze (Supabase / Postgres)
-- Eseguire una volta nello SQL Editor del progetto scelto.

create table if not exists public.ricorrenze (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null default 'spesa' check (tipo in ('spesa','manutenzione')),
  nome text not null,
  categoria text not null default 'altro',
  importo numeric(12,2),
  frequenza text not null default 'mensile'
    check (frequenza in ('mensile','bimestrale','trimestrale','semestrale','annuale','stagionale','personalizzata')),
  ogni int not null default 1 check (ogni > 0),
  unita text not null default 'mesi' check (unita in ('giorni','settimane','mesi')),
  stagione text,
  prossima_scadenza date not null,
  giorno_mese int,
  promemoria_giorni int not null default 3,
  allegato_path text,
  note text,
  attiva boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ricorrenze_storico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ricorrenza_id uuid not null references public.ricorrenze(id) on delete cascade,
  data date not null,
  importo numeric(12,2),
  created_at timestamptz not null default now()
);

create index if not exists ricorrenze_user_scad_idx on public.ricorrenze (user_id, prossima_scadenza);
create index if not exists ricorrenze_storico_ric_idx on public.ricorrenze_storico (ricorrenza_id);

alter table public.ricorrenze enable row level security;
alter table public.ricorrenze_storico enable row level security;

drop policy if exists "ricorrenze_own" on public.ricorrenze;
create policy "ricorrenze_own" on public.ricorrenze
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "storico_own" on public.ricorrenze_storico;
create policy "storico_own" on public.ricorrenze_storico
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Bucket privato per foto e documenti allegati (una cartella per utente)
insert into storage.buckets (id, name, public)
values ('allegati', 'allegati', false)
on conflict (id) do nothing;

drop policy if exists "allegati_select_own" on storage.objects;
create policy "allegati_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'allegati' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "allegati_insert_own" on storage.objects;
create policy "allegati_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'allegati' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "allegati_delete_own" on storage.objects;
create policy "allegati_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'allegati' and (storage.foldername(name))[1] = auth.uid()::text);
