import {
  createGameState,
  recordGuess,
  tickGame,
} from './gameLogic.js';

const birds = [
  { id: 'american_avocet', name: 'American Avocet', image: 'assets/american_avocet.png' },
  { id: 'american_coot', name: 'American Coot', image: 'assets/american_coot.png' },
  { id: 'black-necked_stilt', name: 'Black-necked Stilt', image: 'assets/black-necked_stilt.png' },
  { id: 'canada_goose', name: 'Canada Goose', image: 'assets/canada_goose.png' },
  { id: 'great_egret', name: 'Great Egret', image: 'assets/great_egret.png' },
  { id: 'mallard', name: 'Mallard', image: 'assets/mallard.png' },
  { id: 'marsh_wren', name: 'Marsh Wren', image: 'assets/marsh_wren.png' },
  { id: 'northern_shoveler', name: 'Northern Shoveler', image: 'assets/northern_shoveler.png' },
  { id: 'red-winged_blackbird', name: 'Red-winged Blackbird', image: 'assets/red-winged_blackbird.png' },
  { id: 'snowy_egret', name: 'Snowy Egret', image: 'assets/snowy_egret.png' },
  { id: 'song_sparrow', name: 'Song Sparrow', image: 'assets/song_sparrow.png' },
];

const stage = document.querySelector('#marshStage');
const birdSprite = document.querySelector('#birdSprite');
const birdButtons = document.querySelector('#birdButtons');
const timeRemaining = document.querySelector('#timeRemaining');
const score = document.querySelector('#score');
const misses = document.querySelector('#misses');
const feedback = document.querySelector('#feedback');
const startButton = document.querySelector('#startButton');
const restartButton = document.querySelector('#restartButton');

const sightings = [
  { x: 30, y: 50, size: 230, flip: 1 },
  { x: 47, y: 42, size: 265, flip: -1 },
  { x: 63, y: 55, size: 250, flip: 1 },
  { x: 73, y: 43, size: 230, flip: -1 },
  { x: 54, y: 61, size: 295, flip: 1 },
  { x: 40, y: 58, size: 245, flip: -1 },
];

let state = createGameState({ birds, now: Date.now() });
let timerId = null;
let sightingIndex = 0;
let feedbackId = null;

function renderButtons() {
  birdButtons.replaceChildren(
    ...birds.map((bird) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bird-button';
      button.textContent = bird.name;
      button.dataset.birdId = bird.id;
      button.disabled = true;
      button.addEventListener('click', () => handleGuess(bird.id, button));
      return button;
    }),
  );
}

function setButtonsEnabled(enabled) {
  birdButtons.querySelectorAll('button').forEach((button) => {
    button.disabled = !enabled;
    button.classList.remove('is-hit', 'is-miss');
  });
}

function showBird() {
  const bird = state.currentBird;
  const sighting = sightings[sightingIndex % sightings.length];
  sightingIndex += 1;

  birdSprite.classList.add('is-changing');
  window.setTimeout(() => {
    stage.style.setProperty('--bird-x', `${sighting.x}%`);
    stage.style.setProperty('--bird-y', `${sighting.y}%`);
    stage.style.setProperty('--bird-size', `${sighting.size}px`);
    stage.style.setProperty('--bird-flip', sighting.flip);
    birdSprite.src = bird.image;
    birdSprite.alt = '';
    birdSprite.classList.remove('is-changing');
    birdSprite.classList.add('is-visible');
  }, 120);
}

function renderHud() {
  timeRemaining.textContent = state.remainingSeconds.toString();
  score.textContent = state.score.toString();
  misses.textContent = state.misses.toString();
}

function showFeedback(message, tone) {
  window.clearTimeout(feedbackId);
  feedback.textContent = message;
  feedback.className = `feedback is-visible ${tone === 'correct' ? 'is-correct' : 'is-wrong'}`;
  feedbackId = window.setTimeout(() => {
    feedback.className = 'feedback';
  }, 720);
}

function clearFeedback() {
  window.clearTimeout(feedbackId);
  feedback.textContent = '';
  feedback.className = 'feedback';
}

function handleGuess(birdId, button) {
  if (state.isOver) {
    return;
  }

  const result = recordGuess(state, birdId, Date.now());
  birdButtons.querySelectorAll('button').forEach((candidate) => {
    candidate.classList.remove('is-hit', 'is-miss');
  });
  button.classList.add(result.correct ? 'is-hit' : 'is-miss');

  if (result.correct) {
    showFeedback(`Logged: ${result.actualBird.name}`, 'correct');
  } else {
    showFeedback(`That was ${result.actualBird.name}`, 'wrong');
  }

  renderHud();
  showBird();
}

function updateTimer() {
  tickGame(state, Date.now());
  renderHud();

  if (state.isOver) {
    finishRound();
  }
}

function startRound() {
  window.clearInterval(timerId);
  state = createGameState({ birds, now: Date.now() });
  sightingIndex = Math.floor(Math.random() * sightings.length);
  startButton.hidden = true;
  restartButton.hidden = false;
  clearFeedback();
  setButtonsEnabled(true);
  renderHud();
  showBird();
  timerId = window.setInterval(updateTimer, 250);
}

function finishRound() {
  window.clearInterval(timerId);
  timerId = null;
  birdSprite.classList.remove('is-visible');
  setButtonsEnabled(false);
  showFeedback(`Final score: ${state.score}`, 'correct');
}

function preloadImages() {
  [
    'assets/marsh_backdrop.jpg',
    'assets/looking_through_scope.png',
    ...birds.map((bird) => bird.image),
  ].forEach((source) => {
    const image = new Image();
    image.src = source;
  });
}

renderButtons();
renderHud();
showBird();
preloadImages();

startButton.addEventListener('click', startRound);
restartButton.addEventListener('click', startRound);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && timerId) {
    finishRound();
  }
});