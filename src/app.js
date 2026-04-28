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

// ---------------- Element refs ----------------
const $ = (id) => document.getElementById(id);

const screens = {
  splash: $('splashScreen'),
  tutorial: $('tutorialScreen'),
  game: $('gameScreen'),
  result: $('resultScreen'),
};

const els = {
  splashStart: $('splashStart'),
  splashHowTo: $('splashHowTo'),
  splashBest: $('splashBest'),
  tutorialStart: $('tutorialStart'),
  tutorialBack: $('tutorialBack'),
  marshStage: $('marshStage'),
  distantBirds: $('distantBirds'),
  magnifiedBirds: $('magnifiedBirds'),
  eyepiece: $('eyepiece'),
  scopeHint: $('scopeHint'),
  feedback: $('feedback'),
  timeRemaining: $('timeRemaining'),
  foundCount: $('foundCount'),
  misses: $('misses'),
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
  activeScreen = name;
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

// ---------------- Setup splash best-time ----------------
function refreshBestTimeLabel() {
  const best = readBest();
  if (best != null) {
    els.splashBest.hidden = false;
    els.splashBest.textContent = `Best time: ${best}s`;
  } else {
    els.splashBest.hidden = true;
  }
}

function readBest() {
  try {
    const raw = localStorage.getItem(BEST_TIME_KEY);
    return raw == null ? null : Number.parseInt(raw, 10);
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
    btn.innerHTML = `<span>${bird.name}</span><span class="check" aria-hidden="true">✓</span>`;
    btn.addEventListener('click', onBirdButtonClick);
    els.birdButtons.appendChild(btn);
  }
}

function onBirdButtonClick(e) {
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
  els.timeRemaining.parentElement.classList.toggle('is-warn', state.remainingSeconds <= 10);
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

// ---------------- Round lifecycle ----------------
function startRound() {
  showScreen('game');
  state = createGameState({ birds: BIRDS, now: performance.now() });
  scopePos = { x: 0.5, y: 0.45 };
  focusedBirdId = null;
  els.eyepiece.classList.remove('is-on-target');
  els.scopeHint.classList.remove('is-hidden');
  els.feedback.classList.remove('is-visible');
  applyScopeStyle();
  renderBirdLayers();
  renderBirdButtons();
  refreshHud();

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
  const finalScore = score(state);
  const won = state.isWon;
  els.resultTitle.textContent = won ? 'You spotted them all!' : "Time's up";
  const seconds = won ? state.finishedSeconds : GAME_LENGTH_SECONDS;
  els.resultStats.innerHTML = won
    ? `Found <strong>${state.foundIds.size}/${BIRDS.length}</strong> in <strong>${seconds}s</strong> with <strong>${state.misses}</strong> misses.<br>Score: <strong>${finalScore}</strong>`
    : `Found <strong>${state.foundIds.size}/${BIRDS.length}</strong> birds with <strong>${state.misses}</strong> misses.<br>Score: <strong>${finalScore}</strong>`;

  let bestLine = '';
  if (won) {
    const prevBest = readBest();
    if (prevBest == null || seconds < prevBest) {
      writeBest(seconds);
      bestLine = `New best time: ${seconds}s!`;
    } else {
      bestLine = `Best time: ${prevBest}s`;
    }
  } else {
    const prevBest = readBest();
    if (prevBest != null) bestLine = `Best time: ${prevBest}s`;
  }
  els.resultBest.textContent = bestLine;

  showScreen('result');
  refreshBestTimeLabel();
}

// ---------------- Wiring ----------------
function init() {
  preloadImages();
  renderBirdButtons();
  attachStageListeners();
  refreshBestTimeLabel();

  els.splashStart.addEventListener('click', () => {
    returnToScreenAfterTutorial = 'splash';
    if (readBest() == null) {
      showScreen('tutorial'); // first-timers see tutorial
    } else {
      startRound();
    }
  });
  els.splashHowTo.addEventListener('click', () => {
    returnToScreenAfterTutorial = 'splash';
    showScreen('tutorial');
  });
  els.tutorialStart.addEventListener('click', () => startRound());
  els.tutorialBack.addEventListener('click', () => showScreen(returnToScreenAfterTutorial));

  els.howToButton.addEventListener('click', () => {
    returnToScreenAfterTutorial = 'game';
    showScreen('tutorial');
  });
  els.restartButton.addEventListener('click', () => startRound());
  els.resultRestart.addEventListener('click', () => startRound());
  els.resultHome.addEventListener('click', () => showScreen('splash'));

  window.addEventListener('resize', () => {
    stageRect = els.marshStage.getBoundingClientRect();
    updateFocus();
  });
}

function preloadImages() {
  const urls = [
    'assets/poster.png',
    'assets/marsh_backdrop.png',
    'assets/birdle_logo.png',
    'assets/marsh_madness_title.png',
    ...BIRDS.map((b) => b.image),
  ];
  for (const url of urls) {
    const img = new Image();
    img.src = url;
  }
}

init();
