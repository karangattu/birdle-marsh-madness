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
const PLACEMENT_PROFILES = {
  easy: {
    xMin: 12,
    xMax: 88,
    yMin: 46,
    yMax: 64,
    scaleMin: 0.92,
    scaleMax: 1.22,
    minSpacingPct: 11,
  },
  medium: {
    xMin: 8,
    xMax: 92,
    yMin: 42,
    yMax: 60,
    scaleMin: 0.8,
    scaleMax: 1.08,
    minSpacingPct: 9,
  },
  hard: {
    xMin: 6,
    xMax: 94,
    yMin: 38,
    yMax: 54,
    scaleMin: 0.68,
    scaleMax: 0.92,
    minSpacingPct: 8,
  },
};

const SCOPE_ART_X_MIN = 72;
const SCOPE_ART_Y_MIN = 40;

const DEFAULT_PROFILE = PLACEMENT_PROFILES.hard;

export function createPlacements(
  birds,
  random = Math.random,
  scopeArtXMin = SCOPE_ART_X_MIN,
  scopeArtYMin = SCOPE_ART_Y_MIN,
) {
  if (!Array.isArray(birds) || birds.length === 0) {
    throw new Error('createPlacements requires a non-empty birds array');
  }

  const placements = [];
  for (const bird of birds) {
    const profile = getPlacementProfile(bird);
    let candidate;
    let attempts = 0;
    do {
      const yPct = profile.yMin + random() * (profile.yMax - profile.yMin);
      let xPct = profile.xMin + random() * (profile.xMax - profile.xMin);
      if (xPct >= scopeArtXMin && yPct >= scopeArtYMin) {
        xPct = profile.xMin + random() * Math.max(scopeArtXMin - profile.xMin - 2, 0);
      }
      // Perspective: birds lower on the screen (closer to viewer) appear larger.
      const depth = (yPct - profile.yMin) / (profile.yMax - profile.yMin); // 0 = far, 1 = near
      const scale = profile.scaleMin + depth * (profile.scaleMax - profile.scaleMin);
      candidate = {
        birdId: bird.id,
        xPct,
        yPct,
        flip: random() < 0.5 ? -1 : 1,
        scale,
        bobDelayMs: Math.floor(random() * 2200),
      };
      attempts += 1;
    } while (
      attempts < 40 &&
      (tooCloseToOthers(candidate, placements, profile.minSpacingPct) ||
        (candidate.xPct >= scopeArtXMin && candidate.yPct >= scopeArtYMin))
    );
    placements.push(candidate);
  }
  return placements;
}

function getPlacementProfile(bird) {
  return PLACEMENT_PROFILES[bird?.difficulty] ?? DEFAULT_PROFILE;
}

function tooCloseToOthers(candidate, placements, minSpacingPct) {
  for (const p of placements) {
    const dx = candidate.xPct - p.xPct;
    const dy = candidate.yPct - p.yPct;
    if (Math.hypot(dx, dy) < minSpacingPct) return true;
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
