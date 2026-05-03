import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GAME_LENGTH_SECONDS,
  GAME_MODE_LENGTH_SECONDS,
  GAME_MODES,
  createGameState,
  createPlacements,
  isTopLeaderboardScore,
  normalizeLeaderboardPlayerKey,
  recordGuess,
  score,
  selectUniqueLeaderboardEntries,
  tickGame,
} from '../src/gameLogic.js';

const BIRDS = [
  { id: 'mallard', name: 'Mallard' },
  { id: 'marsh_wren', name: 'Marsh Wren' },
  { id: 'song_sparrow', name: 'Song Sparrow' },
];

const ALL_BIRDS = [
  { id: 'american_avocet', name: 'American Avocet' },
  { id: 'american_coot', name: 'American Coot' },
  { id: 'black-necked_stilt', name: 'Black-necked Stilt' },
  { id: 'canada_goose', name: 'Canada Goose' },
  { id: 'cinnamon_teal', name: 'Cinnamon Teal' },
  { id: 'great_egret', name: 'Great Egret' },
  { id: 'mallard', name: 'Mallard' },
  { id: 'marsh_wren', name: 'Marsh Wren' },
  { id: 'northern_shoveler', name: 'Northern Shoveler' },
  { id: 'red-winged_blackbird', name: 'Red-winged Blackbird' },
  { id: 'snowy_egret', name: 'Snowy Egret' },
  { id: 'song_sparrow', name: 'Song Sparrow' },
];

function deterministicRandom(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

test('createPlacements returns one placement per bird inside the marsh band', () => {
  const placements = createPlacements(BIRDS, deterministicRandom(7));
  assert.equal(placements.length, BIRDS.length);
  const seen = new Set();
  for (const p of placements) {
    assert.ok(!seen.has(p.birdId), 'no duplicate species');
    seen.add(p.birdId);
    assert.ok(p.xPct > 0 && p.xPct < 100);
    assert.ok(p.yPct > 0 && p.yPct < 100);
    assert.ok([1, -1].includes(p.flip));
    assert.ok(p.scale > 0);
  }
});

test('birds lower in the frame (closer to viewer) are larger than birds further back', () => {
  const placements = createPlacements(BIRDS, deterministicRandom(11));
  const sorted = [...placements].sort((a, b) => a.yPct - b.yPct);
  assert.ok(sorted[0].scale <= sorted[sorted.length - 1].scale);
});

test('difficulty tiers make easy birds larger and lower than hard birds', () => {
  const random = () => 0.5;
  const easy = createPlacements([{ id: 'easy', difficulty: 'easy' }], random)[0];
  const medium = createPlacements([{ id: 'medium', difficulty: 'medium' }], random)[0];
  const hard = createPlacements([{ id: 'hard', difficulty: 'hard' }], random)[0];

  assert.ok(easy.yPct > medium.yPct && medium.yPct > hard.yPct);
  assert.ok(easy.scale > medium.scale && medium.scale > hard.scale);
});

test('expert placements are smaller and higher than standard placements', () => {
  const random = () => 0.5;
  const birds = [{ id: 'mallard', difficulty: 'easy' }];
  const standard = createPlacements(birds, random)[0];
  const expert = createPlacements(birds, random, undefined, undefined, GAME_MODES.expert)[0];

  assert.ok(expert.yPct < standard.yPct);
  assert.ok(expert.scale < standard.scale);
});

test('all bird species are placed every round', () => {
  const placements = createPlacements(ALL_BIRDS, deterministicRandom(15));
  assert.equal(placements.length, ALL_BIRDS.length);
  assert.deepEqual(
    new Set(placements.map((p) => p.birdId)),
    new Set(ALL_BIRDS.map((b) => b.id)),
  );
});

test('birds stay in the distant marsh band and away from the scope art', () => {
  const placements = createPlacements(ALL_BIRDS, deterministicRandom(21));
  for (const placement of placements) {
    assert.ok(placement.yPct >= 38, 'bird should not be in the sky');
    assert.ok(placement.yPct <= 64, 'bird should stay farther from the viewer');
    assert.ok(!(placement.xPct >= 72 && placement.yPct >= 40), 'bird should not sit under the scope art');
  }
});

test('round length is one minute and starts with no birds found', () => {
  const state = createGameState({ birds: BIRDS, now: 1000 });
  assert.equal(GAME_LENGTH_SECONDS, 60);
  assert.equal(state.mode, GAME_MODES.standard);
  assert.equal(state.roundLengthSeconds, GAME_MODE_LENGTH_SECONDS[GAME_MODES.standard]);
  assert.equal(state.remainingSeconds, 60);
  assert.equal(state.isOver, false);
  assert.equal(state.isWon, false);
  assert.equal(state.foundIds.size, 0);
  assert.equal(state.misses, 0);
});

test('expert round uses a shorter timer', () => {
  const state = createGameState({ birds: BIRDS, now: 1000, mode: GAME_MODES.expert });
  assert.equal(GAME_MODE_LENGTH_SECONDS[GAME_MODES.expert], 45);
  assert.equal(state.mode, GAME_MODES.expert);
  assert.equal(state.roundLengthSeconds, 45);
  assert.equal(state.remainingSeconds, 45);
});

test('tapping a bird name with nothing in the eyepiece counts as a miss', () => {
  const state = createGameState({ birds: BIRDS, now: 0 });
  const result = recordGuess(state, 'mallard', null, 500);
  assert.equal(result.correct, false);
  assert.equal(result.reason, 'no-focus');
  assert.equal(state.misses, 1);
  assert.equal(state.foundIds.size, 0);
});

test('a correct guess only counts when the focused bird matches', () => {
  const state = createGameState({ birds: BIRDS, now: 0 });
  const wrong = recordGuess(state, 'mallard', 'song_sparrow', 1000);
  assert.equal(wrong.correct, false);
  assert.equal(state.misses, 1);

  const right = recordGuess(state, 'mallard', 'mallard', 2000);
  assert.equal(right.correct, true);
  assert.ok(state.foundIds.has('mallard'));
});

test('identifying the same bird twice does not double-count', () => {
  const state = createGameState({ birds: BIRDS, now: 0 });
  recordGuess(state, 'mallard', 'mallard', 500);
  const second = recordGuess(state, 'mallard', 'mallard', 800);
  assert.equal(second.correct, false);
  assert.equal(second.reason, 'already-found');
  assert.equal(state.foundIds.size, 1);
});

test('finding all birds wins the round and locks the time', () => {
  const state = createGameState({ birds: BIRDS, now: 0 });
  recordGuess(state, 'mallard', 'mallard', 1000);
  recordGuess(state, 'marsh_wren', 'marsh_wren', 2000);
  const final = recordGuess(state, 'song_sparrow', 'song_sparrow', 3000);
  assert.equal(final.correct, true);
  assert.equal(state.isWon, true);
  assert.equal(state.isOver, true);
  assert.equal(state.finishedSeconds, 3);
});

test('time runs out and ends the round without a win', () => {
  const state = createGameState({ birds: BIRDS, now: 10_000 });
  tickGame(state, 71_000);
  assert.equal(state.remainingSeconds, 0);
  assert.equal(state.isOver, true);
  assert.equal(state.isWon, false);
});

test('expert timer ends after its shorter round length', () => {
  const state = createGameState({ birds: BIRDS, now: 10_000, mode: GAME_MODES.expert });
  tickGame(state, 55_000);
  assert.equal(state.remainingSeconds, 0);
  assert.equal(state.isOver, true);
  assert.equal(state.finishedSeconds, 45);
});

test('scoring rewards finds and time bonus, penalizes misses', () => {
  const state = createGameState({ birds: BIRDS, now: 0 });
  recordGuess(state, 'mallard', 'mallard', 1000);
  recordGuess(state, 'marsh_wren', 'song_sparrow', 1500); // miss
  assert.equal(score(state), 100 - 15);
});

test('leaderboard qualification only accepts scores that can rank in the top five', () => {
  const currentTopFive = [
    { score: 1200 },
    { score: 1020 },
    { score: 880 },
    { score: 640 },
    { score: 500 },
  ];

  assert.equal(isTopLeaderboardScore(501, currentTopFive), true);
  assert.equal(isTopLeaderboardScore(500, currentTopFive), false);
  assert.equal(isTopLeaderboardScore(900, currentTopFive.slice(0, 4)), true);
});

test('leaderboard keeps only the highest score for each normalized player name', () => {
  const uniqueEntries = selectUniqueLeaderboardEntries([
    { player_label: 'Alice', score: 820, created_at: '2026-05-02T10:00:00Z' },
    { player_label: 'Bob', score: 790, created_at: '2026-05-02T10:01:00Z' },
    { player_label: ' alice ', score: 910, created_at: '2026-05-02T10:02:00Z' },
    { player_label: 'Carol', score: 700, created_at: '2026-05-02T10:03:00Z' },
  ]);

  assert.deepEqual(uniqueEntries.map((entry) => [entry.player_label, entry.score]), [
    [' alice ', 910],
    ['Bob', 790],
    ['Carol', 700],
  ]);
  assert.equal(normalizeLeaderboardPlayerKey('  ALIce '), 'alice');
});

test('leaderboard qualification compares against the player’s existing best score', () => {
  const currentTopFive = [
    { player_label: 'Alice', score: 1200 },
    { player_label: 'Bob', score: 1020 },
    { player_label: 'Carol', score: 880 },
    { player_label: 'Dan', score: 640 },
    { player_label: 'Eve', score: 500 },
  ];

  assert.equal(isTopLeaderboardScore(760, currentTopFive, 5, 'Alice'), false);
  assert.equal(isTopLeaderboardScore(1201, currentTopFive, 5, 'Alice'), true);
  assert.equal(isTopLeaderboardScore(501, currentTopFive, 5, 'Frank'), true);
});
