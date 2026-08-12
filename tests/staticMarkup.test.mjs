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

test('tutorial requires the Mallard interaction unless skipped', () => {
  assert.match(html, /id="tutorialStart"[^>]*disabled/);
  assert.match(html, /id="tutorialSkip"/);
  assert.match(appSource, /tutorialMallardClicked\s*=\s*false/);
  assert.match(appSource, /setTutorialStartEnabled\(false\)/);
  assert.match(appSource, /setTutorialStartEnabled\(true\)/);
  assert.match(appSource, /tutorialSkip\.addEventListener\('click', \(\) => startRound\(\)\)/);
});

test('splash screen lets players choose standard or expert mode', () => {
  assert.match(html, /data-game-mode="standard"/);
  assert.match(html, /data-game-mode="expert"/);
  assert.match(html, /45s, smaller birds/);
  assert.match(appSource, /GAME_MODE_ORDER\s*=\s*\[GAME_MODES\.standard, GAME_MODES\.expert\]/);
  assert.match(appSource, /setSelectedMode/);
});

test('game catalog exposes 12 bird buttons including Cinnamon Teal', () => {
  const birdCatalog = /const BIRDS = \[([\s\S]*?)\]\.map/.exec(appSource)?.[1] ?? '';
  const birdEntries = birdCatalog.match(/\{ id: '/g) ?? [];
  assert.equal(birdEntries.length, 12);
  assert.match(birdCatalog, /cinnamon_teal/);
});

test('game uses adjustable magnification: base 4.2x with up to +5x via scroll and pinch', () => {
  assert.doesNotMatch(html, /id="zoomControls"/);
  assert.match(appSource, /const DEFAULT_ZOOM = 4\.2;/);
  assert.match(appSource, /const MIN_ZOOM = DEFAULT_ZOOM;/);
  assert.match(appSource, /const MAX_ZOOM = MIN_ZOOM \+ 5;/);
  assert.match(appSource, /function clampZoom\(/);
  assert.match(appSource, /function setZoom\(/);
  assert.match(appSource, /function onWheel\(/);
  assert.match(appSource, /function startPinch\(/);
  assert.match(html, /id="zoomIndicator"/);
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
  assert.match(appSource, /LEGACY_HIGH_SCORE_KEY\s*=\s*'birdle:highScore'/);
  assert.match(appSource, /birdle:highScore:\$\{normalizeGameMode\(mode\)\}/);
  assert.match(appSource, /renderScoreRecordsHtml/);
  assert.match(styles, /\.score-record/);
  assert.match(html, /src="assets\/marsh_madness_poster\.png"/);
  assert.doesNotMatch(html, /splash-sfbbo/);
  assert.doesNotMatch(html, /splash-logo/);
  assert.doesNotMatch(html, /splash-title/);
});

test('opening screen shows regular and expert mode buttons', () => {
  assert.match(html, /id="modeRegular"/);
  assert.match(html, /id="modeExpert"/);
  assert.match(appSource, /leaderboardMode: 'regular'/);
  assert.match(appSource, /leaderboardMode: 'expert'/);
});

test('field guide is available before the round, not during active play', () => {
  assert.match(html, /id="splashFieldGuide"/);
  assert.doesNotMatch(html, /id="fieldGuideButton"/);
  assert.match(html, /Review the birds here before starting your round\./);
  assert.match(appSource, /splashFieldGuide\.addEventListener\('click', openFieldGuide\)/);
  assert.doesNotMatch(appSource, /fieldGuidePausedAt/);
});

test('splash includes a dismissible install prompt for non-PWA play', () => {
  assert.match(html, /id="installPrompt"/);
  assert.match(html, /id="installPromptInstall"/);
  assert.match(html, /id="installPromptDismiss"/);
  assert.match(appSource, /beforeinstallprompt/);
  assert.match(appSource, /appinstalled/);
  assert.match(appSource, /display-mode:\s*standalone/);
  assert.match(appSource, /INSTALL_PROMPT_DISMISS_KEY/);
  assert.match(appSource, /localStorage/);
  assert.match(styles, /\.install-prompt/);
});

test('result screen includes a top five leaderboard panel', () => {
  assert.match(html, /id="resultLeaderboard"/);
  assert.match(html, /id="resultLeaderboardList"/);
  assert.match(html, /id="resultLeaderboardStatus"/);
  assert.match(appSource, /limit', '5'/);
  assert.match(appSource, /renderLeaderboard\('result'/);
});

test('result screen asks qualifying top-five players for their leaderboard name', () => {
  assert.match(html, /id="leaderboardNameForm"/);
  assert.match(html, /id="leaderboardPlayerName"/);
  assert.match(html, /maxlength="40"/);
  assert.match(appSource, /isTopLeaderboardScore\(finalScore/);
  assert.match(appSource, /submitLeaderboardName/);
  assert.doesNotMatch(appSource, /submitLeaderboardScore\(finalScore, seconds, won, mode\);/);
});

test('app saves and fetches leaderboard scores through Supabase REST', () => {
  assert.match(appSource, /SUPABASE_URL\s*=\s*'https:\/\/ovwktjjeoowlktdfbuuu\.supabase\.co'/);
  assert.match(appSource, /SUPABASE_PUBLISHABLE_KEY\s*=\s*'sb_publishable_B2pz5WTA3UEVUeKACIgmBw_8_r0S3kU'/);
  assert.match(appSource, /LEADERBOARD_TABLE\s*=\s*'marsh_madness_leaderboard'/);
  assert.match(appSource, /function fetchLeaderboard\(mode/);
  assert.match(appSource, /function saveLeaderboardScore\(entry/);
  assert.match(appSource, /mode: leaderboardModeForGameMode\(gameMode\)/);
});

test('app upserts leaderboard scores by unique player key', () => {
  assert.match(appSource, /selectUniqueLeaderboardEntries/);
  assert.match(appSource, /on_conflict', 'mode,player_key'/);
  assert.match(appSource, /Prefer: 'resolution=merge-duplicates,return=minimal'/);
});

test('game over screen includes an SFBBO support line', () => {
  assert.match(html, /id="resultSupport"/);
  assert.match(appSource, /Want to support the real-world conservation work behind Birdle\? Explore SFBBO surveys and field projects at <a href="https:\/\/sfbbo\.org" target="_blank" rel="noreferrer">sfbbo\.org<\/a>\./);
});

test('result screen includes payoff and progress lines', () => {
  assert.match(html, /id="resultCompare"/);
  assert.match(html, /id="resultProgress"/);
  assert.match(appSource, /Rank:/);
  assert.match(appSource, /points from the \$\{modeDetail\.label\} high score\./);
  assert.match(appSource, /New \$\{modeDetail\.label\} high score/);
});

test('game screen can quit an active round back to the home screen', () => {
  assert.match(html, /id="quitButton"/);
  assert.match(html, /Quit round and return home/);
  assert.match(appSource, /function quitRoundToHome\(\)/);
  assert.match(appSource, /cancelAnimationFrame\(rafId\)/);
  assert.match(appSource, /state\s*=\s*null/);
  assert.match(appSource, /showScreen\('splash'\)/);
});

test('game plays an audible countdown during the last ten seconds', () => {
  assert.match(appSource, /playUrgencyCue/);
  assert.match(appSource, /state\.remainingSeconds <= 10/);
  assert.match(appSource, /state\.remainingSeconds > 0/);
  assert.match(appSource, /playUrgencyCue\(state\.remainingSeconds\)/);
});

test('game requests fullscreen when a session starts', () => {
  assert.match(appSource, /function enterFullscreenMode\(\)/);
  assert.match(appSource, /requestFullscreen\(\)\.catch\(/);
  assert.match(appSource, /enterFullscreenMode\(\);\s*\n\s*showScreen\('intro'\);/);
});

test('each start or replay path shows the intro before the tutorial and keeps video skip available', () => {
  assert.match(html, /id="introSkip"/);
  assert.match(appSource, /function beginGameSequence\(\) \{[\s\S]*showScreen\('intro'\);[\s\S]*introVideo\.currentTime = 0;[\s\S]*introVideo\.play\(\)/);
  assert.match(appSource, /function advanceFromIntro\(\) \{[\s\S]*showScreen\('tutorial'\);/);
  assert.match(appSource, /introSkip\.addEventListener\('click', advanceFromIntro\)/);
  assert.match(appSource, /restartButton\.addEventListener\('click', \(\) => beginGameSequence\(\)\)/);
  assert.match(appSource, /resultRestart\.addEventListener\('click', \(\) => beginGameSequence\(\)\)/);
});

test('service worker caches the intro video for replay', () => {
  assert.match(serviceWorker, /assets\/intro_video\.mp4/);
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
  assert.doesNotMatch(serviceWorker, /marsh_madness_intro_optimized\.mp4/);
  assert.doesNotMatch(serviceWorker, /marsh_madness_intro\.mp4/);
  assert.doesNotMatch(serviceWorker, /marsh_madness_title_trimmed\.png/);
  assert.doesNotMatch(serviceWorker, /birdle_logo\.png/);
  assert.doesNotMatch(serviceWorker, /SFBBO_Logo_Rounded\.png/);
});

test('portrait mode lock exists for touch devices and tutorial can scroll', () => {
  assert.match(html, /id="globalOrientationLock"/);
  assert.match(styles, /\.global-orientation-lock/);
  assert.match(styles, /\.screen-tutorial\s*\{[\s\S]*overflow-y:\s*auto/);
  assert.match(styles, /@media \(orientation: portrait\) and \(pointer: coarse\)[\s\S]*\.global-orientation-lock\s*\{[\s\S]*display:\s*flex/);
});

test('service worker only caches same-origin requests', () => {
  assert.match(serviceWorker, /if \(!event\.request\.url\.startsWith\(self\.location\.origin\)\) return;/);
});

test('leaderboard fetch requests disable cache', () => {
  assert.match(appSource, /'Cache-Control': 'no-cache'/);
  assert.match(appSource, /'Pragma': 'no-cache'/);
  assert.match(appSource, /cache: 'no-store'/);
});

test('start and restart paths call unlockAudioContext', () => {
  assert.match(appSource, /function unlockAudioContext\(\)/);
  assert.match(appSource, /function beginGameSequence\(\) \{\s*unlockAudioContext\(\)/);
  assert.match(appSource, /function startRound\([^)]*\) \{\s*unlockAudioContext\(\)/);
});

test('daylight mode toggles and screen wake lock exist in markup and logic', () => {
  assert.match(html, /id="splashDaylightToggle"/);
  assert.match(html, /id="gameDaylightToggle"/);
  assert.match(styles, /body\.daylight-mode/);
  assert.match(appSource, /function initDaylightMode\(\)/);
  assert.match(appSource, /async function requestWakeLock\(\)/);
  assert.match(appSource, /function releaseWakeLock\(\)/);
});

test('game interaction polish supports keyboard play and safe completed buttons', () => {
  assert.match(html, /id="marshStage"[^>]*role="region"[^>]*tabindex="0"/);
  assert.match(html, /scroll, pinch, or \+\/− to zoom/);
  assert.match(appSource, /function onStageKeyDown\(e\)/);
  assert.match(appSource, /addEventListener\('keydown', onStageKeyDown\)/);
  assert.match(appSource, /btn\.disabled = true/);
  assert.match(styles, /:where\(button, input, \.marsh-stage\):focus-visible/);
});

test('daylight controls announce their current action', () => {
  assert.match(html, /id="splashDaylightToggle"[^>]*aria-pressed="false"/);
  assert.match(appSource, /toggle\.setAttribute\('aria-pressed', String\(enabled\)\)/);
  assert.match(appSource, /Switch to dark mode/);
});
