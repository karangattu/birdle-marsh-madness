create extension if not exists pgcrypto with schema extensions;

create table if not exists public.marsh_madness_leaderboard (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('regular', 'expert')),
  player_label text not null default 'Marsh Birder' check (char_length(btrim(player_label)) between 1 and 40),
  player_key text not null default 'marsh birder',
  score integer not null check (score >= 0 and score <= 100000),
  found_count integer not null check (found_count >= 0),
  total_birds integer not null check (total_birds > 0 and total_birds <= 64),
  misses integer not null check (misses >= 0 and misses <= 999),
  finished_seconds integer check (finished_seconds is null or finished_seconds between 0 and 60),
  is_won boolean not null default false,
  created_at timestamp with time zone not null default now(),
  check (found_count <= total_birds)
);

alter table public.marsh_madness_leaderboard
add column if not exists player_label text;

alter table public.marsh_madness_leaderboard
add column if not exists player_key text;

update public.marsh_madness_leaderboard
set
  player_label = case
    when player_label is null or char_length(btrim(player_label)) = 0 then 'Marsh Birder'
    else left(btrim(player_label), 40)
  end,
  player_key = lower(case
    when player_label is null or char_length(btrim(player_label)) = 0 then 'Marsh Birder'
    else left(btrim(player_label), 40)
  end);

alter table public.marsh_madness_leaderboard
alter column player_label set default 'Marsh Birder',
alter column player_label set not null,
alter column player_key set default 'marsh birder',
alter column player_key set not null;

alter table public.marsh_madness_leaderboard
drop constraint if exists marsh_madness_leaderboard_player_label_check;

alter table public.marsh_madness_leaderboard
drop constraint if exists marsh_madness_leaderboard_player_key_check;

alter table public.marsh_madness_leaderboard
add constraint marsh_madness_leaderboard_player_label_check
check (char_length(btrim(player_label)) between 1 and 40);

alter table public.marsh_madness_leaderboard
add constraint marsh_madness_leaderboard_player_key_check
check (
  player_key = lower(btrim(player_label))
  and char_length(player_key) between 1 and 40
);

create or replace function public.marsh_madness_leaderboard_normalize_player()
returns trigger
language plpgsql
as $$
begin
  new.player_label := case
    when new.player_label is null or char_length(btrim(new.player_label)) = 0 then 'Marsh Birder'
    else left(btrim(new.player_label), 40)
  end;
  new.player_key := lower(new.player_label);
  return new;
end;
$$;

create or replace function public.marsh_madness_leaderboard_keep_highest_score()
returns trigger
language plpgsql
as $$
begin
  if new.score <= old.score then
    new.score := old.score;
    new.found_count := old.found_count;
    new.total_birds := old.total_birds;
    new.misses := old.misses;
    new.finished_seconds := old.finished_seconds;
    new.is_won := old.is_won;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists marsh_madness_leaderboard_normalize_player on public.marsh_madness_leaderboard;
create trigger marsh_madness_leaderboard_normalize_player
before insert or update on public.marsh_madness_leaderboard
for each row
execute function public.marsh_madness_leaderboard_normalize_player();

drop trigger if exists marsh_madness_leaderboard_keep_highest_score on public.marsh_madness_leaderboard;
create trigger marsh_madness_leaderboard_keep_highest_score
before update on public.marsh_madness_leaderboard
for each row
execute function public.marsh_madness_leaderboard_keep_highest_score();

with ranked as (
  select
    id,
    row_number() over (partition by mode, player_key order by score desc, created_at asc, id asc) as rn
  from public.marsh_madness_leaderboard
)
delete from public.marsh_madness_leaderboard leaderboard
using ranked
where leaderboard.id = ranked.id
  and ranked.rn > 1;

alter table public.marsh_madness_leaderboard enable row level security;

grant select, insert, update on public.marsh_madness_leaderboard to anon;

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
  and char_length(btrim(player_label)) between 1 and 40
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

drop policy if exists "Public leaderboard score updates" on public.marsh_madness_leaderboard;
create policy "Public leaderboard score updates"
on public.marsh_madness_leaderboard
for update
to anon
using (mode in ('regular', 'expert'))
with check (
  mode in ('regular', 'expert')
  and player_key = lower(btrim(player_label))
  and char_length(btrim(player_label)) between 1 and 40
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

create unique index if not exists marsh_madness_leaderboard_mode_player_key_idx
on public.marsh_madness_leaderboard (mode, player_key);

create index if not exists marsh_madness_leaderboard_top_scores_idx
on public.marsh_madness_leaderboard (mode, score desc, created_at asc);

create index if not exists marsh_madness_leaderboard_recent_idx
on public.marsh_madness_leaderboard (created_at desc);
