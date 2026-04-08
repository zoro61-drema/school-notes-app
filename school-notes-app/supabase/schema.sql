create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null default 'Untitled Note',
  content text not null default '',
  drawing text,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_classes_sort_order on public.classes(sort_order desc, created_at desc);
create index if not exists idx_notes_class_sort_order on public.notes(class_id, sort_order desc, updated_at desc);

drop trigger if exists classes_set_updated_at on public.classes;
create trigger classes_set_updated_at
before update on public.classes
for each row
execute function public.set_updated_at();

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
before update on public.notes
for each row
execute function public.set_updated_at();

alter table public.classes enable row level security;
alter table public.notes enable row level security;

drop policy if exists "Temporary public read classes" on public.classes;
create policy "Temporary public read classes"
on public.classes
for select
to anon
using (true);

drop policy if exists "Temporary public write classes" on public.classes;
create policy "Temporary public write classes"
on public.classes
for all
to anon
using (true)
with check (true);

drop policy if exists "Temporary public read notes" on public.notes;
create policy "Temporary public read notes"
on public.notes
for select
to anon
using (true);

drop policy if exists "Temporary public write notes" on public.notes;
create policy "Temporary public write notes"
on public.notes
for all
to anon
using (true)
with check (true);
