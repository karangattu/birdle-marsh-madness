// Pure game logic for Birdle: Marsh Madness.
//
// The round model is "spot every bird in 60 seconds":
//  - exactly one placement per bird species is scattered across the marsh
//  - the player drags a spotting scope and identifies a bird only when it sits
//    inside the eyepiece (caller decides which bird is focused)
//  - finding all birds wins; the timer runs out otherwise

export const GAME_LENGTH_SECONDS = 60;

// Bird placement bounds (percent of stage). Keep birds in the far marsh band:
// below the open sky, but not so close that the scope decoration covers them.
const X_MIN = 6;
const X_MAX = 94;
const Y_MIN = 42;
const Y_MAX = 70;

const SCOPE_ART_X_MIN = 72;
const SCOPE_ART_Y_MIN = 40;

const SCALE_MIN = 0.78;
const SCALE_MAX = 1.35;

const MIN_SPACING_PCT = 9;

export function createPlacements(birds, random = Math.random) {
  if (!Array.isArray(birds) || birds.length === 0) {
    throw new Error('createPlacements requires a non-empty birds array');
  }

  const placements = [];
  for (const bird of birds) {
    let candidate;
    let attempts = 0;
    do {
      const yPct = Y_MIN + random() * (Y_MAX - Y_MIN);
      let xPct = X_MIN + random() * (X_MAX - X_MIN);
      if (xPct >= SCOPE_ART_X_MIN && yPct >= SCOPE_ART_Y_MIN) {
        xPct = X_MIN + random() * (SCOPE_ART_X_MIN - X_MIN - 2);
      }
      // Perspective: birds lower on the screen (closer to viewer) appear larger.
      const depth = (yPct - Y_MIN) / (Y_MAX - Y_MIN); // 0 = far, 1 = near
      const scale = SCALE_MIN + depth * (SCALE_MAX - SCALE_MIN);
      candidate = {
        birdId: bird.id,
        xPct,
        yPct,
        flip: random() < 0.5 ? -1 : 1,
        scale,
        bobDelayMs: 0,
      };
      attempts += 1;
    } while (attempts < 40 && (tooCloseToOthers(candidate, placements) || overlapsScopeArt(candidate)));
    placements.push(candidate);
  }
  return placements;
}

function overlapsScopeArt(candidate) {
  return candidate.xPct >= SCOPE_ART_X_MIN && candidate.yPct >= SCOPE_ART_Y_MIN;
}

function tooCloseToOthers(candidate, placements) {
  for (const p of placements) {
    const dx = candidate.xPct - p.xPct;
    const dy = candidate.yPct - p.yPct;
    if (Math.hypot(dx, dy) < MIN_SPACING_PCT) return true;
  }
  return false;
}

export function createGameState({ birds, now = Date.now(), placements } = {}) {
  if (!Array.isArray(birds) || birds.length === 0) {
    throw new Error('createGameState requires at least one bird');
  }
  return {
    birds,
    placements: placements ?? createPlacements(birds),
    startedAt: now,
    remainingSeconds: GAME_LENGTH_SECONDS,
    isOver: false,
    isWon: false,
    foundIds: new Set(),
    misses: 0,
    finishedSeconds: null,
    lastGuess: null,
  };
}

export function tickGame(state, now = Date.now()) {
  if (state.isOver) return state;
  const elapsed = Math.max(0, Math.floor((now - state.startedAt) / 1000));
  state.remainingSeconds = Math.max(0, GAME_LENGTH_SECONDS - elapsed);
  if (state.remainingSeconds === 0) {
    state.isOver = true;
    state.finishedSeconds = GAME_LENGTH_SECONDS;
  }
  return state;
}

export function recordGuess(state, guessedBirdId, focusedBirdId, now = Date.now()) {
  tickGame(state, now);
  if (state.isOver) {
    return { correct: false, ignored: true };
  }
  if (!focusedBirdId) {
    state.misses += 1;
    state.lastGuess = { guessedBirdId, focusedBirdId: null, correct: false, at: now };
    return { correct: false, reason: 'no-focus' };
  }
  if (state.foundIds.has(focusedBirdId)) {
    state.lastGuess = { guessedBirdId, focusedBirdId, correct: false, at: now };
    return { correct: false, reason: 'already-found' };
  }
  if (guessedBirdId === focusedBirdId) {
    state.foundIds.add(focusedBirdId);
    const bird = state.birds.find((b) => b.id === focusedBirdId);
    state.lastGuess = { guessedBirdId, focusedBirdId, correct: true, at: now };
    if (state.foundIds.size === state.birds.length) {
      state.isWon = true;
      state.isOver = true;
      const elapsed = Math.max(0, Math.floor((now - state.startedAt) / 1000));
      state.finishedSeconds = Math.min(GAME_LENGTH_SECONDS, elapsed);
    }
    return { correct: true, bird };
  }
  state.misses += 1;
  state.lastGuess = { guessedBirdId, focusedBirdId, correct: false, at: now };
  return {
    correct: false,
    reason: 'wrong-guess',
  };
}

export function score(state) {
  const found = state.foundIds.size;
  const base = found * 100;
  const timeBonus = state.isWon ? state.remainingSeconds * 10 : 0;
  const missPenalty = state.misses * 15;
  return Math.max(0, base + timeBonus - missPenalty);
}
