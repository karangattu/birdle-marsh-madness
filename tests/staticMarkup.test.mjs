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

test('game uses a fixed 4.2x zoom and looping marsh ambience', () => {
  assert.doesNotMatch(html, /id="zoomControls"/);
  assert.match(appSource, /const DEFAULT_ZOOM = 4\.2;/);
  assert.match(appSource, /let currentZoom = DEFAULT_ZOOM;/);
  assert.match(html, /id="gameAudio"/);
  assert.match(html, /src="assets\/marsh_sounds\.mp3"/);
  assert.match(html, /loop/);
});

test('service worker caches the marsh ambience for installed play', () => {
  assert.match(serviceWorker, /assets\/marsh_sounds\.mp3/);
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

test('tutorial eyepiece itself accepts drag input', () => {
  assert.match(styles, /\.tutorial-demo-scope[\s\S]*pointer-events:\s*auto/);
});

test('service worker no longer caches superseded source assets', () => {
  assert.doesNotMatch(serviceWorker, /marsh_madness_intro\.mp4/);
  assert.doesNotMatch(serviceWorker, /marsh_madness_title_trimmed\.png/);
  assert.doesNotMatch(serviceWorker, /birdle_logo\.png/);
  assert.doesNotMatch(serviceWorker, /SFBBO_Logo_Rounded\.png/);
});