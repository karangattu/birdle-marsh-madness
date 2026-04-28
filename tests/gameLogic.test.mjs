import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GAME_LENGTH_SECONDS,
  createGameState,
  createSpawnQueue,
  recordGuess,
  tickGame,
} from '../src/gameLogic.js';

const birds = [
  { id: 'mallard', name: 'Mallard' },
  { id: 'marsh_wren', name: 'Marsh Wren' },
  { id: 'song_sparrow', name: 'Song Sparrow' },
];

test('creates a one-minute game state with score and timer reset', () => {
  const state = createGameState({ birds, now: 1000 });

  assert.equal(GAME_LENGTH_SECONDS, 60);
  assert.equal(state.score, 0);
  assert.equal(state.remainingSeconds, 60);
  assert.equal(state.isOver, false);
  assert.ok(state.currentBird);
});

test('records correct repeated bird sightings and advances to the next spawn', () => {
  const queue = createSpawnQueue(birds, () => 0);
  const state = createGameState({ birds, now: 0, queue });
  const firstBird = state.currentBird.id;

  const result = recordGuess(state, firstBird, 1500);

  assert.equal(result.correct, true);
  assert.equal(state.score, 1);
  assert.equal(state.seenCounts[firstBird], 1);
  assert.notEqual(state.currentBird.id, firstBird);
});

test('incorrect guesses do not increase score but still continue play', () => {
  const queue = createSpawnQueue(birds, () => 0);
  const state = createGameState({ birds, now: 0, queue });

  const result = recordGuess(state, 'song_sparrow', 1200);

  assert.equal(result.correct, false);
  assert.equal(state.score, 0);
  assert.equal(state.misses, 1);
  assert.equal(state.currentBird.id, 'marsh_wren');
});

test('tickGame ends the round after sixty seconds', () => {
  const state = createGameState({ birds, now: 10_000 });

  tickGame(state, 70_500);

  assert.equal(state.remainingSeconds, 0);
  assert.equal(state.isOver, true);
});