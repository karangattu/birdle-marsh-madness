create extension if not exists pgcrypto with schema extensions;

create table if not exists public.marsh_madness_leaderboard (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('regular', 'expert')),
  player_label text not null default 'Marsh Birder' check (char_length(player_label) between 1 and 40),
  score integer not null check (score >= 0 and score <= 100000),
  found_count integer not null check (found_count >= 0),
  total_birds integer not null check (total_birds > 0 and total_birds <= 64),
  misses integer not null check (misses >= 0 and misses <= 999),
  finished_seconds integer check (finished_seconds is null or finished_seconds between 0 and 60),
  is_won boolean not null default false,
  created_at timestamp with time zone not null default now(),
  check (found_count <= total_birds)
);

alter table public.marsh_madness_leaderboard enable row level security;

grant select, insert on public.marsh_madness_leaderboard to anon;

drop policy if exists "Public leaderboard read access" on public.marsh_madness_leaderboard;
create policy "Public leaderboard read access"
on public.marsh_madness_leaderboard
for select
to anon
using (true);

drop policy if exists "Public leaderboard score submissions" on public.marsh_madness_leaderboard;
create policy "Public leaderboard score submissions"
on public.marsh_madness_leaderboard
for insert
to anon
with check (
  mode in ('regular', 'expert')
  and char_length(player_label) between 1 and 40
  and score >= 0
  and score <= 100000
  and found_count >= 0
  and total_birds > 0
  and total_birds <= 64
  and found_count <= total_birds
  and misses >= 0
  and misses <= 999
  and (finished_seconds is null or finished_seconds between 0 and 60)
);

create index if not exists marsh_madness_leaderboard_top_scores_idx
on public.marsh_madness_leaderboard (mode, score desc, created_at asc);

create index if not exists marsh_madness_leaderboard_recent_idx
on public.marsh_madness_leaderboard (created_at desc);
