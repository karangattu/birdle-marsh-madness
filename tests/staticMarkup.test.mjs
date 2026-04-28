import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../sw.js', import.meta.url), 'utf8');

test('tutorial exposes a draggable demo scope and a Mallard target button', () => {
  assert.match(html, /id="tutorialDemo"/);
  assert.match(html, /id="tutorialDemoScope"/);
  assert.match(html, /id="demoMallardButton"/);
});

test('game catalog exposes 12 bird buttons including Cinnamon Teal', () => {
  const birdEntries = appSource.match(/\{ id: '/g) ?? [];
  assert.equal(birdEntries.length, 12);
  assert.match(appSource, /cinnamon_teal/);
});

test('game uses a fixed 4.2x zoom and looping marsh ambience', () => {
  assert.doesNotMatch(html, /id="zoomControls"/);
  assert.match(appSource, /const DEFAULT_ZOOM = 4\.2;/);
  assert.match(appSource, /let currentZoom = DEFAULT_ZOOM;/);
  assert.match(html, /id="gameAudio"/);
  assert.match(html, /src="assets\/marsh_sounds\.mp3"/);
  assert.match(html, /loop/);
});

test('tutorial screen includes looping background audio', () => {
  assert.match(html, /id="tutorialAudio"/);
  assert.match(html, /src="assets\/tutorial_sound\.mp3"/);
  assert.match(html, /loop/);
  assert.match(appSource, /playTutorialAmbience/);
  assert.match(appSource, /pauseTutorialAmbience/);
});

test('service worker caches the marsh ambience for installed play', () => {
  assert.match(serviceWorker, /assets\/marsh_sounds\.mp3/);
});

test('service worker caches the Cinnamon Teal art for installed play', () => {
  assert.match(serviceWorker, /assets\/cinnamon_teal\.png/);
});

test('service worker caches the tutorial ambience for installed play', () => {
  assert.match(serviceWorker, /assets\/tutorial_sound\.mp3/);
});

test('missed birds are revealed for four seconds before results', () => {
  assert.match(appSource, /MISSED_BIRD_REVEAL_MS\s*=\s*4000/);
  assert.match(appSource, /revealMissedBirds/);
  assert.match(styles, /\.marsh-bird\.is-missed/);
});

test('opening screen can show locally stored high score', () => {
  assert.match(appSource, /HIGH_SCORE_KEY\s*=\s*'birdle:highScore'/);
  assert.match(appSource, /High score:/);
  assert.match(html, /src="assets\/marsh_madness_poster\.png"/);
  assert.doesNotMatch(html, /splash-sfbbo/);
  assert.doesNotMatch(html, /splash-logo/);
  assert.doesNotMatch(html, /splash-title/);
});

test('game over screen includes an SFBBO support line', () => {
  assert.match(html, /id="resultSupport"/);
  assert.match(appSource, /Want to support the real-world conservation work behind Birdle\? Explore SFBBO surveys and field projects at <a href="https:\/\/sfbbo\.org" target="_blank" rel="noreferrer">sfbbo\.org<\/a>\./);
});

test('result screen includes payoff and progress lines', () => {
  assert.match(html, /id="resultCompare"/);
  assert.match(html, /id="resultProgress"/);
  assert.match(appSource, /Rank:/);
  assert.match(appSource, /You are .* points from the high score\./);
});

test('game plays an urgency cue at ten seconds left', () => {
  assert.match(appSource, /urgencyCuePlayed/);
  assert.match(appSource, /playUrgencyCue/);
  assert.match(appSource, /state\.remainingSeconds <= 10/);
});

test('game requests fullscreen when a session starts', () => {
  assert.match(appSource, /function enterFullscreenMode\(\)/);
  assert.match(appSource, /requestFullscreen\(\)\.catch\(/);
  assert.match(appSource, /enterFullscreenMode\(\);\s*\n\s*showScreen\('intro'\);/);
});

test('game shows a portrait rotate guard on touch devices', () => {
  assert.match(html, /id="orientationGuard"/);
  assert.match(html, /Rotate to landscape/);
  assert.match(styles, /@media \(orientation: portrait\) and \(pointer: coarse\)/);
  assert.match(styles, /orientation-guard-icon/);
});

test('tutorial eyepiece itself accepts drag input', () => {
  assert.match(styles, /\.tutorial-demo-scope[\s\S]*pointer-events:\s*auto/);
});

test('birds and spotting scope no longer pulse or bob', () => {
  assert.doesNotMatch(styles, /tutorial-bird-bob/);
  assert.doesNotMatch(styles, /bird-bob/);
  assert.doesNotMatch(styles, /tutorial-scope-sway/);
  assert.doesNotMatch(styles, /lock-on-pulse/);
  assert.doesNotMatch(styles, /eyepiece-confirm/);
  assert.doesNotMatch(styles, /missed-bird-pulse/);
});

test('service worker no longer caches superseded source assets', () => {
  assert.doesNotMatch(serviceWorker, /marsh_madness_intro\.mp4/);
  assert.doesNotMatch(serviceWorker, /marsh_madness_title_trimmed\.png/);
  assert.doesNotMatch(serviceWorker, /birdle_logo\.png/);
  assert.doesNotMatch(serviceWorker, /SFBBO_Logo_Rounded\.png/);
});