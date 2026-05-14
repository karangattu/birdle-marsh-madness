import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function readLeaderboardSql() {
  try {
    return await readFile(new URL('../supabase/marsh_madness_leaderboard.sql', import.meta.url), 'utf8');
  } catch {
    assert.fail('expected supabase/marsh_madness_leaderboard.sql to exist');
  }
}

test('leaderboard SQL creates the public marsh madness table', async () => {
  const sql = await readLeaderboardSql();
  assert.match(sql, /create table if not exists public\.marsh_madness_leaderboard/);
  assert.match(sql, /mode text not null/);
  assert.match(sql, /check \(mode in \('regular', 'expert'\)\)/);
  assert.match(sql, /player_label text not null default 'Marsh Birder'/);
  assert.match(sql, /score integer not null/);
  assert.match(sql, /found_count integer not null/);
  assert.match(sql, /total_birds integer not null/);
  assert.match(sql, /misses integer not null/);
  assert.match(sql, /finished_seconds integer/);
  assert.match(sql, /is_won boolean not null/);
});

test('leaderboard SQL enables public read and insert policies for anon clients', async () => {
  const sql = await readLeaderboardSql();
  assert.match(sql, /alter table public\.marsh_madness_leaderboard enable row level security/);
  assert.match(sql, /for select\s+to anon\s+using \(true\)/);
  assert.match(sql, /for insert\s+to anon\s+with check/);
  assert.match(sql, /char_length\(btrim\(player_label\)\) between 1 and 40/);
  assert.match(sql, /score >= 0/);
  assert.match(sql, /mode in \('regular', 'expert'\)/);
});

test('leaderboard SQL grants the anon role explicit table access', async () => {
  const sql = await readLeaderboardSql();
  assert.match(sql, /grant select, insert, update on public\.marsh_madness_leaderboard to anon/);
});

test('leaderboard SQL upgrades existing tables with player labels', async () => {
  const sql = await readLeaderboardSql();
  assert.match(sql, /alter table public\.marsh_madness_leaderboard\s+add column if not exists player_label text/);
  assert.match(sql, /update public\.marsh_madness_leaderboard\s+set\s+player_label = case/);
  assert.match(sql, /when player_label is null or char_length\(btrim\(player_label\)\) = 0 then 'Marsh Birder'/);
  assert.match(sql, /else left\(btrim\(player_label\), 40\)/);
  assert.match(sql, /alter column player_label set not null/);
});

test('leaderboard SQL keeps one row per normalized player name in each mode', async () => {
  const sql = await readLeaderboardSql();
  assert.match(sql, /add column if not exists player_key text/);
  assert.match(sql, /create unique index if not exists marsh_madness_leaderboard_mode_player_key_idx/);
  assert.match(sql, /on public\.marsh_madness_leaderboard \(mode, player_key\)/);
  assert.match(sql, /row_number\(\) over \(partition by mode, player_key order by score desc, created_at asc, id asc\)/);
});

test('leaderboard SQL adds a top-score lookup index', async () => {
  const sql = await readLeaderboardSql();
  assert.match(sql, /create index if not exists marsh_madness_leaderboard_top_scores_idx/);
  assert.match(sql, /on public\.marsh_madness_leaderboard \(mode, score desc, created_at asc\)/);
});
