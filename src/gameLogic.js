export const GAME_LENGTH_SECONDS = 60;

export function createSpawnQueue(birds, random = Math.random) {
  if (!Array.isArray(birds) || birds.length === 0) {
    throw new Error('createSpawnQueue requires at least one bird');
  }

  let index = Math.floor(random() * birds.length);

  return {
    next() {
      const bird = birds[index % birds.length];
      index += 1;
      return { ...bird };
    },
  };
}

export function createGameState({ birds, now = Date.now(), queue = createSpawnQueue(birds) }) {
  if (!Array.isArray(birds) || birds.length === 0) {
    throw new Error('createGameState requires at least one bird');
  }

  return {
    birds,
    queue,
    startedAt: now,
    score: 0,
    misses: 0,
    remainingSeconds: GAME_LENGTH_SECONDS,
    isOver: false,
    seenCounts: {},
    currentBird: queue.next(),
    lastGuess: null,
  };
}

export function tickGame(state, now = Date.now()) {
  const elapsedSeconds = Math.floor((now - state.startedAt) / 1000);
  state.remainingSeconds = Math.max(0, GAME_LENGTH_SECONDS - elapsedSeconds);
  state.isOver = state.remainingSeconds === 0;
  return state;
}

export function recordGuess(state, birdId, now = Date.now()) {
  tickGame(state, now);

  if (state.isOver) {
    return { correct: false, ignored: true, actualBird: state.currentBird };
  }

  const actualBird = state.currentBird;
  const correct = actualBird.id === birdId;

  if (correct) {
    state.score += 1;
    state.seenCounts[actualBird.id] = (state.seenCounts[actualBird.id] ?? 0) + 1;
  } else {
    state.misses += 1;
  }

  state.lastGuess = {
    birdId,
    actualBirdId: actualBird.id,
    correct,
    at: now,
  };
  state.currentBird = state.queue.next();

  return { correct, actualBird };
}