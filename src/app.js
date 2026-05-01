import {
  GAME_LENGTH_SECONDS,
  GAME_MODE_LENGTH_SECONDS,
  GAME_MODES,
  createGameState,
  createPlacements,
  normalizeGameMode,
  recordGuess,
  score,
  tickGame,
} from './gameLogic.js';

// ---------------- Bird catalog ----------------
const BIRDS = [
  { id: 'american_avocet',       name: 'American Avocet', difficulty: 'medium' },
  { id: 'american_coot',         name: 'American Coot', difficulty: 'easy' },
  { id: 'black-necked_stilt',    name: 'Black-necked Stilt', difficulty: 'hard' },
  { id: 'canada_goose',          name: 'Canada Goose', difficulty: 'easy' },
  { id: 'cinnamon_teal',         name: 'Cinnamon Teal', difficulty: 'medium' },
  { id: 'great_egret',           name: 'Great Egret', difficulty: 'easy' },
  { id: 'mallard',               name: 'Mallard', difficulty: 'easy' },
  { id: 'marsh_wren',            name: 'Marsh Wren', difficulty: 'hard' },
  { id: 'northern_shoveler',     name: 'Northern Shoveler', difficulty: 'hard' },
  { id: 'red-winged_blackbird',  name: 'Red-winged Blackbird', difficulty: 'hard' },
  { id: 'snowy_egret',           name: 'Snowy Egret', difficulty: 'easy' },
  { id: 'song_sparrow',          name: 'Song Sparrow', difficulty: 'hard' },
].map((b) => ({ ...b, image: `assets/${b.id}.png` }));

const LEGACY_BEST_TIME_KEY = 'birdle:bestTimeSeconds';
const LEGACY_HIGH_SCORE_KEY = 'birdle:highScore';
const DEFAULT_ZOOM = 4.2;
const MISSED_BIRD_REVEAL_MS = 4000;
const TUTORIAL_TARGET = { x: 0.56, y: 0.55 };
const GAME_MODE_ORDER = [GAME_MODES.standard, GAME_MODES.expert];
const GAME_MODE_DETAILS = {
  [GAME_MODES.standard]: { label: 'Standard', description: '60s round' },
  [GAME_MODES.expert]: { label: 'Expert', description: '45s, smaller birds' },
};

const ICONS = {
  check: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>',
};

// ---------------- Element refs ----------------
const $ = (id) => document.getElementById(id);

const screens = {
  splash: $('splashScreen'),
  intro: $('introScreen'),
  tutorial: $('tutorialScreen'),
  game: $('gameScreen'),
  result: $('resultScreen'),
};

const els = {
  splashStart: $('splashStart'),
  splashHowTo: $('splashHowTo'),
  splashBest: $('splashBest'),
  modeButtons: Array.from(document.querySelectorAll('[data-game-mode]')),
  introVideo: $('introVideo'),
  introSkip: $('introSkip'),
  tutorialDemo: $('tutorialDemo'),
  tutorialDemoScope: $('tutorialDemoScope'),
  demoMallardButton: $('demoMallardButton'),
  tutorialStart: $('tutorialStart'),
  tutorialSkip: $('tutorialSkip'),
  tutorialBack: $('tutorialBack'),
  marshStage: $('marshStage'),
  distantBirds: $('distantBirds'),
  magnifiedBirds: $('magnifiedBirds'),
  eyepiece: $('eyepiece'),
  scopeHint: $('scopeHint'),
  feedback: $('feedback'),
  analogTimer: $('analogTimer'),
  modeLabel: $('modeLabel'),
  timeRemaining: $('timeRemaining'),
  foundCount: $('foundCount'),
  misses: $('misses'),
  tutorialAudio: $('tutorialAudio'),
  gameAudio: $('gameAudio'),
  birdButtons: $('birdButtons'),
  scopeDecoration: document.querySelector('.scope-decoration'),
  quitButton: $('quitButton'),
  restartButton: $('restartButton'),
  howToButton: $('howToButton'),
  resultTitle: $('resultTitle'),
  resultStats: $('resultStats'),
  resultBest: $('resultBest'),
  resultCompare: $('resultCompare'),
  resultProgress: $('resultProgress'),
  resultSupport: $('resultSupport'),
  resultRestart: $('resultRestart'),
  resultHome: $('resultHome'),
};

// ---------------- Screen state ----------------
let activeScreen = 'splash';
let returnToScreenAfterTutorial = 'splash';
let selectedMode = GAME_MODES.standard;

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    const isActive = key === name;
    el.hidden = !isActive;
    el.classList.toggle('is-active', isActive);
  }
  if (name !== 'intro') {
    els.introVideo.pause();
  }
  if (name !== 'game') {
    pauseMarshAmbience(name === 'splash');
  }
  if (name === 'tutorial') {
    playTutorialAmbience();
  } else {
    pauseTutorialAmbience();
  }
  activeScreen = name;
  if (name === 'tutorial') {
    resetTutorialDemo();
  }
}

function setSelectedMode(mode) {
  selectedMode = normalizeGameMode(mode);
  for (const button of els.modeButtons) {
    const isSelected = button.dataset.gameMode === selectedMode;
    button.classList.toggle('is-selected', isSelected);
    button.setAttribute('aria-pressed', String(isSelected));
  }
  refreshBestTimeLabel();
}

// ---------------- Game state ----------------
let state = null;
let rafId = null;
let scopePos = { x: 0.5, y: 0.45 };           // fractions of stage
let stageRect = null;
let isDragging = false;
let hasMoved = false;
let focusedBirdId = null;
let feedbackTimer = null;
let pointerGrabId = null;
let currentZoom = DEFAULT_ZOOM;
let tutorialScopePos = { x: 0.24, y: 0.58 };
let tutorialPointerId = null;
let tutorialPointerCaptureEl = null;
let tutorialMallardClicked = false;
let tutorialNudgeTimer = null;
let missedRevealTimer = null;
let isRevealingMisses = false;
let lastHud = { remainingSeconds: GAME_MODE_LENGTH_SECONDS[GAME_MODES.standard], foundCount: 0, misses: 0 };
let foundCueContext = null;

// ---------------- Setup splash best-time ----------------
function refreshBestTimeLabel() {
  els.splashBest.hidden = false;
  els.splashBest.innerHTML = renderScoreRecordsHtml(selectedMode);
}

function readBest(mode = GAME_MODES.standard) {
  const gameMode = normalizeGameMode(mode);
  const saved = readStoredNumber(getBestTimeKey(gameMode));
  if (saved != null) return saved;
  return gameMode === GAME_MODES.standard ? readStoredNumber(LEGACY_BEST_TIME_KEY) : null;
}

function readHighScore(mode = GAME_MODES.standard) {
  const gameMode = normalizeGameMode(mode);
  const saved = readStoredNumber(getHighScoreKey(gameMode));
  if (saved != null) return saved;
  return gameMode === GAME_MODES.standard ? (readStoredNumber(LEGACY_HIGH_SCORE_KEY) ?? 0) : 0;
}

function getBestTimeKey(mode) {
  return `birdle:bestTimeSeconds:${normalizeGameMode(mode)}`;
}

function getHighScoreKey(mode) {
  return `birdle:highScore:${normalizeGameMode(mode)}`;
}

function readStoredNumber(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeBest(seconds, mode = GAME_MODES.standard) {
  try {
    localStorage.setItem(getBestTimeKey(mode), String(seconds));
  } catch {
    /* ignore */
  }
}

function writeHighScoreIfBetter(points, mode = GAME_MODES.standard) {
  const gameMode = normalizeGameMode(mode);
  const previous = readHighScore(gameMode);
  const nextScore = Math.max(0, points);
  if (nextScore <= previous) return { highScore: previous, isNew: false };
  try {
    localStorage.setItem(getHighScoreKey(gameMode), String(nextScore));
  } catch {
    return { highScore: previous, isNew: false };
  }
  return { highScore: nextScore, isNew: nextScore > previous };
}

function getModeDetail(mode) {
  return GAME_MODE_DETAILS[normalizeGameMode(mode)];
}

function renderScoreRecordsHtml(activeMode = selectedMode) {
  return GAME_MODE_ORDER.map((mode) => {
    const detail = getModeDetail(mode);
    const highScore = readHighScore(mode);
    const best = readBest(mode);
    const isSelected = normalizeGameMode(activeMode) === mode;
    const bestText = best == null ? 'No win yet' : `Best ${best}s`;
    return `<span class="score-record${isSelected ? ' is-selected' : ''}"><span class="record-mode">${detail.label}</span><strong>${highScore}</strong><span>${bestText}</span></span>`;
  }).join('');
}

// ---------------- Bird DOM rendering ----------------
function renderBirdLayers() {
  els.distantBirds.innerHTML = '';
  els.magnifiedBirds.innerHTML = '';

  for (const placement of state.placements) {
    const bird = BIRDS.find((b) => b.id === placement.birdId);
    els.distantBirds.appendChild(makeBirdEl(bird, placement));
    els.magnifiedBirds.appendChild(makeBirdEl(bird, placement));
  }
}

function makeBirdEl(bird, placement) {
  const img = document.createElement('img');
  img.className = 'marsh-bird';
  img.src = bird.image;
  img.alt = '';
  img.dataset.birdId = bird.id;
  img.style.setProperty('--bx', `${placement.xPct}%`);
  img.style.setProperty('--by', `${placement.yPct}%`);
  img.style.setProperty('--flip', String(placement.flip));
  img.style.setProperty('--bs', placement.scale.toFixed(2));
  img.style.setProperty('--bob-delay', `${placement.bobDelayMs}ms`);
  img.draggable = false;
  return img;
}

function renderBirdButtons() {
  els.birdButtons.innerHTML = '';
  for (const bird of BIRDS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bird-button';
    btn.dataset.birdId = bird.id;
    btn.innerHTML = `<span>${bird.name}</span><span class="check" aria-hidden="true">${ICONS.check}</span>`;
    btn.addEventListener('click', onBirdButtonClick);
    els.birdButtons.appendChild(btn);
  }
}

function onBirdButtonClick(e) {
  if (!state || state.isOver) return;
  const id = e.currentTarget.dataset.birdId;
  const result = recordGuess(state, id, focusedBirdId, performance.now());
  if (result.correct) {
    flashFeedback(`Spotted: ${BIRDS.find((b) => b.id === id).name}!`, 'good');
    markBirdFound(id);
    playFoundCue();
    vibrate([40, 30, 40]);
  } else if (result.reason === 'no-focus') {
    flashFeedback('Nothing in the eyepiece — keep scanning', 'bad');
    vibrate(18);
  } else if (result.reason === 'already-found') {
    flashFeedback('Already logged', 'bad');
  } else if (result.reason === 'wrong-guess') {
    flashFeedback('Not quite — look closer', 'bad');
    vibrate(18);
  }
  refreshHud();
  if (state.isOver) endRound();
}

function markBirdFound(birdId) {
  for (const layer of [els.distantBirds, els.magnifiedBirds]) {
    const el = layer.querySelector(`[data-bird-id="${cssEscape(birdId)}"]`);
    if (el) el.classList.add('is-found');
  }
  const btn = els.birdButtons.querySelector(`[data-bird-id="${cssEscape(birdId)}"]`);
  if (btn) {
    btn.classList.add('is-found');
    btn.classList.add('is-just-found');
    window.setTimeout(() => btn.classList.remove('is-just-found'), 520);
  }
  els.eyepiece.classList.add('is-confirmed');
  window.setTimeout(() => els.eyepiece.classList.remove('is-confirmed'), 360);
}

function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/"/g, '\\"');
}

// ---------------- Scope dragging ----------------
function setScopeFromClient(clientX, clientY) {
  if (!stageRect) stageRect = els.marshStage.getBoundingClientRect();
  const x = (clientX - stageRect.left) / stageRect.width;
  const y = (clientY - stageRect.top) / stageRect.height;
  scopePos.x = clamp(x, 0.04, 0.96);
  scopePos.y = clamp(y, 0.04, 0.96);
  applyScopeStyle();
  updateFocus();
}

function applyScopeStyle() {
  els.marshStage.style.setProperty('--scope-x', `${(scopePos.x * 100).toFixed(2)}%`);
  els.marshStage.style.setProperty('--scope-y', `${(scopePos.y * 100).toFixed(2)}%`);
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

function onPointerDown(e) {
  if (!state || state.isOver) return;
  pointerGrabId = e.pointerId;
  els.marshStage.setPointerCapture?.(e.pointerId);
  isDragging = true;
  hasMoved = true;
  els.marshStage.classList.add('is-dragging');
  els.scopeHint.classList.add('is-hidden');
  stageRect = els.marshStage.getBoundingClientRect();
  setScopeFromClient(e.clientX, e.clientY);
}
function onPointerMove(e) {
  if (!isDragging || e.pointerId !== pointerGrabId) return;
  setScopeFromClient(e.clientX, e.clientY);
}
function onPointerUp(e) {
  if (e.pointerId !== pointerGrabId) return;
  isDragging = false;
  els.marshStage.classList.remove('is-dragging');
  try { els.marshStage.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
  pointerGrabId = null;
}

function attachStageListeners() {
  els.marshStage.addEventListener('pointerdown', onPointerDown);
  els.marshStage.addEventListener('pointermove', onPointerMove);
  els.marshStage.addEventListener('pointerup', onPointerUp);
  els.marshStage.addEventListener('pointercancel', onPointerUp);
}

// ---------------- Tutorial demo ----------------
function resetTutorialDemo() {
  if (!els.tutorialDemo) return;
  tutorialMallardClicked = false;
  tutorialScopePos = { x: 0.24, y: 0.58 };
  els.tutorialDemo.classList.remove('is-on-target', 'is-dragging', 'needs-target');
  els.demoMallardButton.classList.remove('is-highlighted', 'is-found');
  setTutorialStartEnabled(false);
  applyTutorialScopeStyle();
}

function setTutorialStartEnabled(enabled) {
  els.tutorialStart.disabled = !enabled;
  els.tutorialStart.setAttribute('aria-disabled', String(!enabled));
  els.tutorialStart.classList.toggle('is-disabled', !enabled);
}

function applyTutorialScopeStyle() {
  els.tutorialDemo.style.setProperty('--tutorial-scope-x', `${(tutorialScopePos.x * 100).toFixed(2)}%`);
  els.tutorialDemo.style.setProperty('--tutorial-scope-y', `${(tutorialScopePos.y * 100).toFixed(2)}%`);
}

function setTutorialScopeFromClient(clientX, clientY) {
  const rect = els.tutorialDemo.getBoundingClientRect();
  tutorialScopePos = {
    x: clamp((clientX - rect.left) / rect.width, 0.08, 0.92),
    y: clamp((clientY - rect.top) / rect.height, 0.12, 0.88),
  };
  applyTutorialScopeStyle();
  updateTutorialFocus(rect);
}

function updateTutorialFocus(rect = els.tutorialDemo.getBoundingClientRect()) {
  const dx = (tutorialScopePos.x - TUTORIAL_TARGET.x) * rect.width;
  const dy = (tutorialScopePos.y - TUTORIAL_TARGET.y) * rect.height;
  const isOnTarget = Math.hypot(dx, dy) <= Math.min(rect.width, rect.height) * 0.14;
  els.tutorialDemo.classList.toggle('is-on-target', isOnTarget);
  els.demoMallardButton.classList.toggle('is-highlighted', isOnTarget);
}

function onTutorialPointerDown(e) {
  e.stopPropagation();
  tutorialPointerId = e.pointerId;
  tutorialPointerCaptureEl = e.currentTarget;
  try { tutorialPointerCaptureEl.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
  els.tutorialDemo.classList.add('is-dragging');
  els.tutorialDemo.classList.remove('needs-target');
  setTutorialScopeFromClient(e.clientX, e.clientY);
}

function onTutorialPointerMove(e) {
  if (e.pointerId !== tutorialPointerId) return;
  setTutorialScopeFromClient(e.clientX, e.clientY);
}

function onTutorialPointerUp(e) {
  if (e.pointerId !== tutorialPointerId) return;
  endTutorialDrag(e.pointerId);
}

function onTutorialMouseMove(e) {
  if (tutorialPointerId == null) return;
  setTutorialScopeFromClient(e.clientX, e.clientY);
}

function onTutorialMouseUp() {
  if (tutorialPointerId == null) return;
  endTutorialDrag(tutorialPointerId);
}

function endTutorialDrag(pointerId) {
  els.tutorialDemo.classList.remove('is-dragging');
  try { tutorialPointerCaptureEl?.releasePointerCapture?.(pointerId); } catch { /* ignore */ }
  tutorialPointerCaptureEl = null;
  tutorialPointerId = null;
}

function onDemoMallardClick() {
  if (!els.demoMallardButton.classList.contains('is-highlighted')) {
    els.tutorialDemo.classList.add('needs-target');
    if (tutorialNudgeTimer) clearTimeout(tutorialNudgeTimer);
    tutorialNudgeTimer = setTimeout(() => els.tutorialDemo.classList.remove('needs-target'), 700);
    return;
  }
  tutorialMallardClicked = true;
  els.demoMallardButton.classList.add('is-found');
  setTutorialStartEnabled(true);
}

function attachTutorialDemoListeners() {
  els.tutorialDemo.addEventListener('pointerdown', onTutorialPointerDown);
  els.tutorialDemoScope.addEventListener('pointerdown', onTutorialPointerDown);
  window.addEventListener('pointermove', onTutorialPointerMove);
  window.addEventListener('pointerup', onTutorialPointerUp);
  window.addEventListener('pointercancel', onTutorialPointerUp);
  window.addEventListener('mousemove', onTutorialMouseMove);
  window.addEventListener('mouseup', onTutorialMouseUp);
  els.demoMallardButton.addEventListener('click', onDemoMallardClick);
}

// ---------------- Scope zoom and ambience ----------------
function setZoom(zoom) {
  currentZoom = zoom;
  els.marshStage.style.setProperty('--magnify', String(zoom));
  updateFocus();
}

function playMarshAmbience() {
  els.gameAudio.pause();
  els.gameAudio.currentTime = 0;
  els.gameAudio.load();
  els.gameAudio.volume = 0.28;
  const playPromise = els.gameAudio.play();
  if (playPromise) playPromise.catch(() => {});
}

function pauseMarshAmbience(reset = false) {
  els.gameAudio.pause();
  if (reset) els.gameAudio.currentTime = 0;
}

// ---------------- Focus detection ----------------
function updateFocus() {
  if (!state || state.isOver) return;
  if (!stageRect) stageRect = els.marshStage.getBoundingClientRect();

  const cs = getComputedStyle(els.marshStage);
  const eyepieceRadiusPx = parsePx(cs.getPropertyValue('--eyepiece-radius'));
  const magnify = parseFloat(cs.getPropertyValue('--magnify')) || 3.4;

  // Distance threshold in stage pixels: bird must appear inside the
  // (radius / magnify) circle around the scope center.
  const threshold = eyepieceRadiusPx / magnify;

  const sx = scopePos.x * stageRect.width;
  const sy = scopePos.y * stageRect.height;

  let bestId = null;
  let bestDist = Infinity;
  for (const placement of state.placements) {
    if (state.foundIds.has(placement.birdId)) continue;
    const bx = (placement.xPct / 100) * stageRect.width;
    const by = (placement.yPct / 100) * stageRect.height;
    const d = Math.hypot(bx - sx, by - sy);
    if (d < threshold && d < bestDist) {
      bestDist = d;
      bestId = placement.birdId;
    }
  }

  if (bestId !== focusedBirdId) {
    const justAcquired = bestId !== null && focusedBirdId === null;
    focusedBirdId = bestId;
    els.eyepiece.classList.toggle('is-on-target', !!focusedBirdId);
    if (justAcquired) vibrate(25);
  }
}

function parsePx(value) {
  // Resolves clamp() etc. by creating a probe element.
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.width = value;
  els.marshStage.appendChild(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();
  return px;
}

// ---------------- HUD ----------------
function refreshHud() {
  const previousRemaining = lastHud.remainingSeconds;
  const previousFound = lastHud.foundCount;
  const previousMisses = lastHud.misses;
  const nextFound = state.foundIds.size;
  const nextMisses = state.misses;
  const roundLengthSeconds = state.roundLengthSeconds ?? GAME_LENGTH_SECONDS;

  els.timeRemaining.textContent = String(state.remainingSeconds);
  const elapsedSeconds = roundLengthSeconds - state.remainingSeconds;
  const progress = state.remainingSeconds / roundLengthSeconds;
  els.analogTimer.style.setProperty('--timer-progress', progress.toFixed(3));
  els.analogTimer.style.setProperty('--timer-hand-angle', `${(elapsedSeconds / roundLengthSeconds) * 360}deg`);
  els.analogTimer.setAttribute('aria-label', `${state.remainingSeconds} seconds remaining`);
  els.analogTimer.classList.toggle('is-warn', state.remainingSeconds <= 10);
  els.analogTimer.classList.toggle('is-expert', state.mode === GAME_MODES.expert);
  if (state.remainingSeconds <= 10 && state.remainingSeconds > 0 && state.remainingSeconds !== previousRemaining) {
    playUrgencyCue(state.remainingSeconds);
    vibrate(10);
  }
  if (state.remainingSeconds !== previousRemaining) {
    els.analogTimer.classList.add('is-tick');
    window.clearTimeout(els.analogTimer._tickTimer);
    els.analogTimer._tickTimer = window.setTimeout(() => els.analogTimer.classList.remove('is-tick'), 180);
  }
  els.foundCount.textContent = `${nextFound}/${BIRDS.length}`;
  els.misses.textContent = String(nextMisses);
  if (nextFound > previousFound) {
    els.foundCount.classList.add('is-bump');
    window.clearTimeout(els.foundCount._pulseTimer);
    els.foundCount._pulseTimer = window.setTimeout(() => els.foundCount.classList.remove('is-bump'), 260);
  }
  if (nextMisses > previousMisses) {
    els.misses.classList.add('is-soft-penalty');
    window.clearTimeout(els.misses._pulseTimer);
    els.misses._pulseTimer = window.setTimeout(() => els.misses.classList.remove('is-soft-penalty'), 300);
  }
  lastHud = { remainingSeconds: state.remainingSeconds, foundCount: nextFound, misses: nextMisses };
}

function flashFeedback(text, kind) {
  els.feedback.textContent = text;
  els.feedback.classList.remove('is-good', 'is-bad');
  els.feedback.classList.add(kind === 'good' ? 'is-good' : 'is-bad');
  els.feedback.classList.add('is-visible');
  if (feedbackTimer) clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    els.feedback.classList.remove('is-visible');
  }, 1400);
}

function enterFullscreenMode() {
  if (document.fullscreenElement || !document.fullscreenEnabled) return;
  document.documentElement.requestFullscreen().catch(() => {});
}

function playFoundCue() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  foundCueContext ??= new AudioContextClass();
  const context = foundCueContext;
  if (context.state === 'suspended') {
    context.resume().catch(() => {});
  }
  const now = context.currentTime;
  const gain = context.createGain();
  const osc = context.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(740, now);
  osc.frequency.exponentialRampToValueAtTime(980, now + 0.09);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(now);
  osc.stop(now + 0.14);
}

function playUrgencyCue(secondsRemaining) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  foundCueContext ??= new AudioContextClass();
  const context = foundCueContext;
  if (context.state === 'suspended') {
    context.resume().catch(() => {});
  }
  const now = context.currentTime;
  const gain = context.createGain();
  const osc = context.createOscillator();
  const countdownStep = clamp(11 - secondsRemaining, 1, 10);
  const baseFrequency = 410 + (countdownStep * 26);
  const endFrequency = Math.max(280, baseFrequency - 92);
  const peakGain = 0.028 + (countdownStep * 0.0035);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(baseFrequency, now);
  osc.frequency.exponentialRampToValueAtTime(endFrequency, now + 0.11);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(now);
  osc.stop(now + 0.19);
}

function playTutorialAmbience() {
  els.tutorialAudio.pause();
  els.tutorialAudio.currentTime = 0;
  els.tutorialAudio.load();
  els.tutorialAudio.volume = 0.22;
  const playPromise = els.tutorialAudio.play();
  if (playPromise) playPromise.catch(() => {});
}

function pauseTutorialAmbience(reset = false) {
  els.tutorialAudio.pause();
  if (reset) els.tutorialAudio.currentTime = 0;
}

function beginGameSequence() {
  enterFullscreenMode();
  showScreen('intro');
  els.introVideo.pause();
  els.introVideo.currentTime = 0;
  els.introVideo.load();
  const playPromise = els.introVideo.play();
  if (playPromise) {
    playPromise.catch(() => showScreen('tutorial'));
  }
}

function advanceFromIntro() {
  els.introVideo.pause();
  showScreen('tutorial');
}

// ---------------- Haptics ----------------
function vibrate(pattern) {
  navigator.vibrate?.(pattern);
}

// ---------------- Scope art bounds ----------------
function computeScopeArtBounds() {
  const stageR = els.marshStage.getBoundingClientRect();
  const scopeR = els.scopeDecoration?.getBoundingClientRect();
  if (!stageR.width || !stageR.height || !scopeR?.width || !scopeR?.height) {
    return { xMin: 62, yMin: 40 };
  }
  // Measure where the decoration image starts as a % of the stage, with a
  // 3% safety buffer so the bird exclusion zone slightly overlaps the image edge.
  const xMin = Math.max(30, ((scopeR.left - stageR.left) / stageR.width) * 100 - 3);
  const yMin = Math.max(20, ((scopeR.top - stageR.top) / stageR.height) * 100);
  return { xMin, yMin };
}

// ---------------- Round lifecycle ----------------
function startRound(mode = selectedMode) {
  const gameMode = normalizeGameMode(mode);
  const modeDetail = getModeDetail(gameMode);
  enterFullscreenMode();
  pauseTutorialAmbience(true);
  if (missedRevealTimer) {
    clearTimeout(missedRevealTimer);
    missedRevealTimer = null;
  }
  isRevealingMisses = false;
  showScreen('game');
  els.modeLabel.textContent = `${modeDetail.label} · ${GAME_MODE_LENGTH_SECONDS[gameMode]}s`;
  const scopeBounds = computeScopeArtBounds();
  const placements = createPlacements(BIRDS, Math.random, scopeBounds.xMin, scopeBounds.yMin, gameMode);
  state = createGameState({ birds: BIRDS, now: performance.now(), placements, mode: gameMode });
  scopePos = { x: 0.5, y: 0.45 };
  focusedBirdId = null;
  els.eyepiece.classList.remove('is-on-target');
  els.marshStage.classList.remove('is-revealing-misses');
  els.scopeHint.classList.remove('is-hidden');
  els.feedback.classList.remove('is-visible');
  applyScopeStyle();
  renderBirdLayers();
  renderBirdButtons();
  setZoom(currentZoom);
  lastHud = { remainingSeconds: state.roundLengthSeconds, foundCount: 0, misses: 0 };
  refreshHud();
  playMarshAmbience();

  // Recompute stage rect after layout settles, then start the loop.
  requestAnimationFrame(() => {
    stageRect = els.marshStage.getBoundingClientRect();
    updateFocus();
    if (rafId) cancelAnimationFrame(rafId);
    loop();
  });
}

function loop() {
  if (!state) return;
  tickGame(state, performance.now());
  refreshHud();
  if (state.isOver) {
    endRound();
    return;
  }
  rafId = requestAnimationFrame(loop);
}

function endRound() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  if (state.isWon) vibrate([60, 40, 100]);

  const missedIds = getMissedBirdIds();
  if (!state.isWon && missedIds.length > 0 && !isRevealingMisses) {
    isRevealingMisses = true;
    revealMissedBirds(missedIds);
    missedRevealTimer = setTimeout(() => {
      missedRevealTimer = null;
      showResultScreen();
    }, MISSED_BIRD_REVEAL_MS);
    return;
  }

  showResultScreen();
}

function getMissedBirdIds() {
  return BIRDS.map((bird) => bird.id).filter((birdId) => !state.foundIds.has(birdId));
}

function revealMissedBirds(missedIds) {
  els.marshStage.classList.add('is-revealing-misses');
  for (const birdId of missedIds) {
    for (const layer of [els.distantBirds, els.magnifiedBirds]) {
      const el = layer.querySelector(`[data-bird-id="${cssEscape(birdId)}"]`);
      if (el) el.classList.add('is-missed');
    }
  }
  flashFeedback('Birds you missed are marked in the marsh', 'bad');
}

function quitRoundToHome() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (missedRevealTimer) {
    clearTimeout(missedRevealTimer);
    missedRevealTimer = null;
  }
  if (pointerGrabId != null) {
    try { els.marshStage.releasePointerCapture?.(pointerGrabId); } catch { /* ignore */ }
    pointerGrabId = null;
  }
  state = null;
  focusedBirdId = null;
  isDragging = false;
  isRevealingMisses = false;
  els.marshStage.classList.remove('is-dragging', 'is-revealing-misses');
  els.eyepiece.classList.remove('is-on-target', 'is-confirmed');
  els.feedback.classList.remove('is-visible', 'is-good', 'is-bad');
  refreshBestTimeLabel();
  showScreen('splash');
}

function showResultScreen() {
  const finalScore = score(state);
  const mode = normalizeGameMode(state.mode);
  const modeDetail = getModeDetail(mode);
  const highScore = writeHighScoreIfBetter(finalScore, mode);
  const won = state.isWon;
  const tier = scoreTierFor(finalScore);
  els.resultTitle.textContent = won ? `${modeDetail.label}: You spotted them all — ${tier.label}` : `${modeDetail.label}: ${tier.label}`;
  const seconds = won ? state.finishedSeconds : (state.roundLengthSeconds ?? GAME_LENGTH_SECONDS);
  els.resultStats.innerHTML = won
    ? `Found <strong>${state.foundIds.size}/${BIRDS.length}</strong> in <strong>${seconds}s</strong> with <strong>${state.misses}</strong> misses.<br>${modeDetail.label} score: <strong>${finalScore}</strong>`
    : `Found <strong>${state.foundIds.size}/${BIRDS.length}</strong> birds with <strong>${state.misses}</strong> misses.<br>${modeDetail.label} score: <strong>${finalScore}</strong>`;

  const summaryLines = [highScore.isNew ? `New ${modeDetail.label} high score: ${highScore.highScore}!` : `${modeDetail.label} high score: ${highScore.highScore}`];
  if (won) {
    const prevBest = readBest(mode);
    if (prevBest == null || seconds < prevBest) {
      writeBest(seconds, mode);
      summaryLines.push(`New ${modeDetail.label} best time: ${seconds}s!`);
    } else {
      summaryLines.push(`${modeDetail.label} best time: ${prevBest}s`);
    }
  } else {
    const prevBest = readBest(mode);
    if (prevBest != null) summaryLines.push(`${modeDetail.label} best time: ${prevBest}s`);
  }
  els.resultBest.innerHTML = `<span class="result-current-record">${summaryLines.join(' | ')}</span><span class="score-records compact">${renderScoreRecordsHtml(mode)}</span>`;
  els.resultCompare.textContent = `Rank: ${tier.label}`;
  const pointsFromHighScore = Math.max(0, highScore.highScore - finalScore);
  els.resultProgress.textContent = pointsFromHighScore === 0
    ? `You are at the ${modeDetail.label} high score.`
    : `You are ${pointsFromHighScore} points from the ${modeDetail.label} high score.`;
  els.resultSupport.innerHTML = 'Want to support the real-world conservation work behind Birdle? Explore SFBBO surveys and field projects at <a href="https://sfbbo.org" target="_blank" rel="noreferrer">sfbbo.org</a>.';

  showScreen('result');
  refreshBestTimeLabel();
}

function scoreTierFor(scoreValue) {
  if (scoreValue >= 1050) return { label: 'Marsh Legend' };
  if (scoreValue >= 900) return { label: 'Field Guide Ace' };
  if (scoreValue >= 750) return { label: 'Birding Pro' };
  if (scoreValue >= 550) return { label: 'Sharp-Eyed Spotter' };
  if (scoreValue >= 350) return { label: 'Trail Scout' };
  return { label: 'New to the Marsh' };
}

// ---------------- Wiring ----------------
function init() {
  preloadImages();
  renderBirdButtons();
  attachStageListeners();
  attachTutorialDemoListeners();
  setSelectedMode(GAME_MODES.standard);
  lastHud = { remainingSeconds: GAME_MODE_LENGTH_SECONDS[GAME_MODES.standard], foundCount: 0, misses: 0 };

  for (const button of els.modeButtons) {
    button.addEventListener('click', () => setSelectedMode(button.dataset.gameMode));
  }

  els.splashStart.addEventListener('click', () => {
    returnToScreenAfterTutorial = 'splash';
    beginGameSequence();
  });
  els.splashHowTo.addEventListener('click', () => {
    returnToScreenAfterTutorial = 'splash';
    showScreen('tutorial');
  });
  els.introVideo.addEventListener('ended', advanceFromIntro);
  els.introVideo.addEventListener('error', advanceFromIntro);
  els.introSkip.addEventListener('click', advanceFromIntro);
  els.tutorialStart.addEventListener('click', () => {
    if (!tutorialMallardClicked) {
      els.tutorialDemo.classList.add('needs-target');
      if (tutorialNudgeTimer) clearTimeout(tutorialNudgeTimer);
      tutorialNudgeTimer = setTimeout(() => els.tutorialDemo.classList.remove('needs-target'), 700);
      return;
    }
    startRound();
  });
  els.tutorialSkip.addEventListener('click', () => startRound());
  els.tutorialBack.addEventListener('click', () => showScreen(returnToScreenAfterTutorial));

  els.howToButton.addEventListener('click', () => {
    returnToScreenAfterTutorial = 'game';
    showScreen('tutorial');
  });
  els.quitButton.addEventListener('click', quitRoundToHome);
  els.restartButton.addEventListener('click', () => startRound());
  els.resultRestart.addEventListener('click', () => beginGameSequence());
  els.resultHome.addEventListener('click', () => showScreen('splash'));

  window.addEventListener('resize', () => {
    stageRect = els.marshStage.getBoundingClientRect();
    updateFocus();
    updateTutorialFocus();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseMarshAmbience();
    } else if (activeScreen === 'game' && state && !state.isOver) {
      playMarshAmbience();
    }
  });

  registerServiceWorker();
}

function preloadImages() {
  const urls = [
    'assets/marsh_madness_poster.png',
    'assets/marsh_backdrop.png',
    'assets/poster.png',
    ...BIRDS.map((b) => b.image),
  ];
  for (const url of urls) {
    const img = new Image();
    img.src = url;
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Non-fatal: the game still runs normally without offline install support.
    });
  });
}

init();
