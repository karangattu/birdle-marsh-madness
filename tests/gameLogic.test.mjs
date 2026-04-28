import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GAME_LENGTH_SECONDS,
  createGameState,
  createPlacements,
  recordGuess,
  score,
  tickGame,
} from '../src/gameLogic.js';

const BIRDS = [
  { id: 'mallard', name: 'Mallard' },
  { id: 'marsh_wren', name: 'Marsh Wren' },
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

test('round length is one minute and starts with no birds found', () => {
  const state = createGameState({ birds: BIRDS, now: 1000 });
  assert.equal(GAME_LENGTH_SECONDS, 60);
  assert.equal(state.remainingSeconds, 60);
  assert.equal(state.isOver, false);
  assert.equal(state.isWon, false);
  assert.equal(state.foundIds.size, 0);
  assert.equal(state.misses, 0);
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

test('scoring rewards finds and time bonus, penalizes misses', () => {
  const state = createGameState({ birds: BIRDS, now: 0 });
  recordGuess(state, 'mallard', 'mallard', 1000);
  recordGuess(state, 'marsh_wren', 'song_sparrow', 1500); // miss
  assert.equal(score(state), 100 - 15);
});
