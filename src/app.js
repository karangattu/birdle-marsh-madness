import {
  GAME_LENGTH_SECONDS,
  createGameState,
  recordGuess,
  score,
  tickGame,
} from './gameLogic.js';

// ---------------- Bird catalog ----------------
const BIRDS = [
  { id: 'american_avocet',       name: 'American Avocet' },
  { id: 'american_coot',         name: 'American Coot' },
  { id: 'black-necked_stilt',    name: 'Black-necked Stilt' },
  { id: 'canada_goose',          name: 'Canada Goose' },
  { id: 'great_egret',           name: 'Great Egret' },
  { id: 'mallard',               name: 'Mallard' },
  { id: 'marsh_wren',            name: 'Marsh Wren' },
  { id: 'northern_shoveler',     name: 'Northern Shoveler' },
  { id: 'red-winged_blackbird',  name: 'Red-winged Blackbird' },
  { id: 'snowy_egret',           name: 'Snowy Egret' },
  { id: 'song_sparrow',          name: 'Song Sparrow' },
].map((b) => ({ ...b, image: `assets/${b.id}.png` }));

const BEST_TIME_KEY = 'birdle:bestTimeSeconds';
const HIGH_SCORE_KEY = 'birdle:highScore';
const DEFAULT_ZOOM = 4.2;
const MISSED_BIRD_REVEAL_MS = 4000;
const TUTORIAL_TARGET = { x: 0.56, y: 0.55 };

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
  introVideo: $('introVideo'),
  introSkip: $('introSkip'),
  tutorialDemo: $('tutorialDemo'),
  tutorialDemoScope: $('tutorialDemoScope'),
  demoMallardButton: $('demoMallardButton'),
  tutorialStart: $('tutorialStart'),
  tutorialBack: $('tutorialBack'),
  marshStage: $('marshStage'),
  distantBirds: $('distantBirds'),
  magnifiedBirds: $('magnifiedBirds'),
  eyepiece: $('eyepiece'),
  scopeHint: $('scopeHint'),
  feedback: $('feedback'),
  analogTimer: $('analogTimer'),
  timeRemaining: $('timeRemaining'),
  foundCount: $('foundCount'),
  misses: $('misses'),
  gameAudio: $('gameAudio'),
  birdButtons: $('birdButtons'),
  restartButton: $('restartButton'),
  howToButton: $('howToButton'),
  resultTitle: $('resultTitle'),
  resultStats: $('resultStats'),
  resultBest: $('resultBest'),
  resultRestart: $('resultRestart'),
  resultHome: $('resultHome'),
};

// ---------------- Screen state ----------------
let activeScreen = 'splash';
let returnToScreenAfterTutorial = 'splash';

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
  activeScreen = name;
  if (name === 'tutorial') {
    resetTutorialDemo();
  }
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
let tutorialNudgeTimer = null;
let missedRevealTimer = null;
let isRevealingMisses = false;

// ---------------- Setup splash best-time ----------------
function refreshBestTimeLabel() {
  const best = readBest();
  const highScore = readHighScore();
  const parts = [`High score: ${highScore}`];
  if (best != null) parts.push(`Best time: ${best}s`);
  els.splashBest.hidden = false;
  els.splashBest.textContent = parts.join(' | ');
}

function readBest() {
  return readStoredNumber(BEST_TIME_KEY);
}

function readHighScore() {
  return readStoredNumber(HIGH_SCORE_KEY) ?? 0;
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

function writeBest(seconds) {
  try {
    localStorage.setItem(BEST_TIME_KEY, String(seconds));
  } catch {
    /* ignore */
  }
}

function writeHighScoreIfBetter(points) {
  const saved = readStoredNumber(HIGH_SCORE_KEY);
  const previous = saved ?? 0;
  const nextScore = Math.max(0, points);
  if (saved != null && nextScore <= previous) return { highScore: previous, isNew: false };
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(nextScore));
  } catch {
    return { highScore: previous, isNew: false };
  }
  return { highScore: nextScore, isNew: nextScore > previous };
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
  } else if (result.reason === 'no-focus') {
    flashFeedback('Nothing in the eyepiece — keep scanning', 'bad');
  } else if (result.reason === 'already-found') {
    flashFeedback('Already logged', 'bad');
  } else if (result.reason === 'wrong-guess') {
    flashFeedback('Not quite — look closer', 'bad');
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
  }
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
  tutorialScopePos = { x: 0.24, y: 0.58 };
  els.tutorialDemo.classList.remove('is-on-target', 'is-dragging', 'needs-target');
  els.demoMallardButton.classList.remove('is-highlighted', 'is-found');
  applyTutorialScopeStyle();
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
  els.demoMallardButton.classList.add('is-found');
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
    focusedBirdId = bestId;
    els.eyepiece.classList.toggle('is-on-target', !!focusedBirdId);
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
  els.timeRemaining.textContent = String(state.remainingSeconds);
  const elapsedSeconds = GAME_LENGTH_SECONDS - state.remainingSeconds;
  const progress = state.remainingSeconds / GAME_LENGTH_SECONDS;
  els.analogTimer.style.setProperty('--timer-progress', progress.toFixed(3));
  els.analogTimer.style.setProperty('--timer-hand-angle', `${(elapsedSeconds / GAME_LENGTH_SECONDS) * 360}deg`);
  els.analogTimer.setAttribute('aria-label', `${state.remainingSeconds} seconds remaining`);
  els.analogTimer.classList.toggle('is-warn', state.remainingSeconds <= 10);
  els.foundCount.textContent = `${state.foundIds.size}/${BIRDS.length}`;
  els.misses.textContent = String(state.misses);
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

function beginGameSequence() {
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

// ---------------- Round lifecycle ----------------
function startRound() {
  if (missedRevealTimer) {
    clearTimeout(missedRevealTimer);
    missedRevealTimer = null;
  }
  isRevealingMisses = false;
  showScreen('game');
  state = createGameState({ birds: BIRDS, now: performance.now() });
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

function showResultScreen() {
  const finalScore = score(state);
  const highScore = writeHighScoreIfBetter(finalScore);
  const won = state.isWon;
  els.resultTitle.textContent = won ? 'You spotted them all!' : "Time's up";
  const seconds = won ? state.finishedSeconds : GAME_LENGTH_SECONDS;
  els.resultStats.innerHTML = won
    ? `Found <strong>${state.foundIds.size}/${BIRDS.length}</strong> in <strong>${seconds}s</strong> with <strong>${state.misses}</strong> misses.<br>Score: <strong>${finalScore}</strong>`
    : `Found <strong>${state.foundIds.size}/${BIRDS.length}</strong> birds with <strong>${state.misses}</strong> misses.<br>Score: <strong>${finalScore}</strong>`;

  const summaryLines = [highScore.isNew ? `New high score: ${highScore.highScore}!` : `High score: ${highScore.highScore}`];
  if (won) {
    const prevBest = readBest();
    if (prevBest == null || seconds < prevBest) {
      writeBest(seconds);
      summaryLines.push(`New best time: ${seconds}s!`);
    } else {
      summaryLines.push(`Best time: ${prevBest}s`);
    }
  } else {
    const prevBest = readBest();
    if (prevBest != null) summaryLines.push(`Best time: ${prevBest}s`);
  }
  els.resultBest.textContent = summaryLines.join(' | ');

  showScreen('result');
  refreshBestTimeLabel();
}

// ---------------- Wiring ----------------
function init() {
  preloadImages();
  renderBirdButtons();
  attachStageListeners();
  attachTutorialDemoListeners();
  refreshBestTimeLabel();

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
  els.tutorialStart.addEventListener('click', () => startRound());
  els.tutorialBack.addEventListener('click', () => showScreen(returnToScreenAfterTutorial));

  els.howToButton.addEventListener('click', () => {
    returnToScreenAfterTutorial = 'game';
    showScreen('tutorial');
  });
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
