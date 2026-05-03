// Pure game logic for Birdle: Marsh Madness.
//
// The round model is "spot every bird in 60 seconds":
//  - exactly one placement per bird species is scattered across the marsh
//  - the player drags a spotting scope and identifies a bird only when it sits
//    inside the eyepiece (caller decides which bird is focused)
//  - finding all birds wins; the timer runs out otherwise

export const GAME_LENGTH_SECONDS = 60;
export const GAME_MODES = {
  standard: 'standard',
  expert: 'expert',
};
export const GAME_MODE_LENGTH_SECONDS = {
  [GAME_MODES.standard]: GAME_LENGTH_SECONDS,
  [GAME_MODES.expert]: 45,
};

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
const EXPERT_Y_SHIFT = -5;
const EXPERT_SCALE_FACTOR = 0.86;
const EXPERT_SPACING_FACTOR = 0.88;

export function createPlacements(
  birds,
  random = Math.random,
  scopeArtXMin = SCOPE_ART_X_MIN,
  scopeArtYMin = SCOPE_ART_Y_MIN,
  mode = GAME_MODES.standard,
) {
  if (!Array.isArray(birds) || birds.length === 0) {
    throw new Error('createPlacements requires a non-empty birds array');
  }

  const gameMode = normalizeGameMode(mode);
  const placements = [];
  for (const bird of birds) {
    const profile = getPlacementProfile(bird, gameMode);
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

function getPlacementProfile(bird, mode = GAME_MODES.standard) {
  const profile = PLACEMENT_PROFILES[bird?.difficulty] ?? DEFAULT_PROFILE;
  if (mode !== GAME_MODES.expert) return profile;
  return {
    ...profile,
    yMin: Math.max(32, profile.yMin + EXPERT_Y_SHIFT),
    yMax: Math.max(42, profile.yMax + EXPERT_Y_SHIFT),
    scaleMin: profile.scaleMin * EXPERT_SCALE_FACTOR,
    scaleMax: profile.scaleMax * EXPERT_SCALE_FACTOR,
    minSpacingPct: profile.minSpacingPct * EXPERT_SPACING_FACTOR,
  };
}

function tooCloseToOthers(candidate, placements, minSpacingPct) {
  for (const p of placements) {
    const dx = candidate.xPct - p.xPct;
    const dy = candidate.yPct - p.yPct;
    if (Math.hypot(dx, dy) < minSpacingPct) return true;
  }
  return false;
}

export function createGameState({ birds, now = Date.now(), placements, mode = GAME_MODES.standard } = {}) {
  if (!Array.isArray(birds) || birds.length === 0) {
    throw new Error('createGameState requires at least one bird');
  }
  const gameMode = normalizeGameMode(mode);
  const roundLengthSeconds = GAME_MODE_LENGTH_SECONDS[gameMode];
  return {
    birds,
    placements: placements ?? createPlacements(birds, Math.random, SCOPE_ART_X_MIN, SCOPE_ART_Y_MIN, gameMode),
    mode: gameMode,
    roundLengthSeconds,
    startedAt: now,
    remainingSeconds: roundLengthSeconds,
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
  const roundLengthSeconds = getRoundLengthSeconds(state);
  const elapsed = Math.max(0, Math.floor((now - state.startedAt) / 1000));
  state.remainingSeconds = Math.max(0, roundLengthSeconds - elapsed);
  if (state.remainingSeconds === 0) {
    state.isOver = true;
    state.finishedSeconds = roundLengthSeconds;
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
      state.finishedSeconds = Math.min(getRoundLengthSeconds(state), elapsed);
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

export function normalizeLeaderboardPlayerKey(playerLabel) {
  if (typeof playerLabel !== 'string') return '';
  return playerLabel.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function selectUniqueLeaderboardEntries(entries, limit = Infinity) {
  const rankedEntries = Array.isArray(entries) ? entries : [];
  const bestByPlayer = new Map();

  rankedEntries.forEach((entry, index) => {
    const playerKey = normalizeLeaderboardPlayerKey(entry?.player_label ?? '') || `__entry_${index}`;

    const candidate = {
      entry,
      score: Number.parseInt(entry?.score, 10) || 0,
      createdAt: parseLeaderboardCreatedAt(entry?.created_at),
      index,
    };
    const existing = bestByPlayer.get(playerKey);
    if (!existing || compareLeaderboardCandidates(candidate, existing) < 0) {
      bestByPlayer.set(playerKey, candidate);
    }
  });

  const maxEntries = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : Infinity;
  return [...bestByPlayer.values()]
    .sort(compareLeaderboardCandidates)
    .slice(0, maxEntries)
    .map((candidate) => candidate.entry);
}

export function isTopLeaderboardScore(scoreValue, entries, limit = 5, playerLabel = '') {
  const numericScore = Number.parseInt(scoreValue, 10);
  if (!Number.isFinite(numericScore) || numericScore < 0 || limit <= 0) return false;
  const uniqueEntries = selectUniqueLeaderboardEntries(entries);
  const playerKey = normalizeLeaderboardPlayerKey(playerLabel);
  const existingEntry = playerKey
    ? uniqueEntries.find((entry) => normalizeLeaderboardPlayerKey(entry?.player_label ?? '') === playerKey)
    : null;

  if (existingEntry) {
    const existingScore = Number.parseInt(existingEntry.score, 10);
    if (Number.isFinite(existingScore) && numericScore <= existingScore) {
      return false;
    }
  }

  const comparisonEntries = existingEntry
    ? uniqueEntries.filter((entry) => normalizeLeaderboardPlayerKey(entry?.player_label ?? '') !== playerKey)
    : uniqueEntries;
  if (comparisonEntries.length < limit) return true;

  const cutoff = Number.parseInt(comparisonEntries[limit - 1]?.score, 10);
  return !Number.isFinite(cutoff) || numericScore > cutoff;
}

export function normalizeGameMode(mode) {
  return mode === GAME_MODES.expert ? GAME_MODES.expert : GAME_MODES.standard;
}

function getRoundLengthSeconds(state) {
  return state.roundLengthSeconds ?? GAME_MODE_LENGTH_SECONDS[normalizeGameMode(state.mode)];
}

function compareLeaderboardCandidates(left, right) {
  if (left.score !== right.score) return right.score - left.score;
  if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
  return left.index - right.index;
}

function parseLeaderboardCreatedAt(value) {
  const timestamp = Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}
