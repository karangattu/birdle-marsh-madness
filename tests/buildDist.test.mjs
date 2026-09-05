import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildDist } from "../scripts/build_dist.js";

test("buildDist populates target directory with core game assets", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "marsh-madness-dist-"));
  try {
    buildDist(tmpDir);

    assert.ok(fs.existsSync(path.join(tmpDir, "index.html")));
    assert.ok(fs.existsSync(path.join(tmpDir, "manifest.webmanifest")));
    assert.ok(fs.existsSync(path.join(tmpDir, "sw.js")));
    assert.ok(fs.existsSync(path.join(tmpDir, "src", "app.js")));
    assert.ok(fs.existsSync(path.join(tmpDir, "src", "styles.css")));
    assert.ok(fs.existsSync(path.join(tmpDir, "src", "gameLogic.js")));
    assert.ok(fs.existsSync(path.join(tmpDir, "assets", "mallard.png")));
    assert.ok(fs.existsSync(path.join(tmpDir, "assets", "marsh_backdrop.png")));
    assert.ok(fs.existsSync(path.join(tmpDir, "assets", "marsh_sounds.mp3")));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("capacitor configuration specifies correct app id and assets directory", () => {
  const configPath = path.resolve("capacitor.config.json");
  assert.ok(fs.existsSync(configPath));

  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  assert.equal(config.appId, "org.sfbbo.marshmadness");
  assert.equal(config.appName, "Marsh Madness");
  assert.equal(config.webDir, "dist");
  assert.equal(config.android?.backgroundColor, "#06211b");
});

test("android project manifest locks orientation to landscape and enables internet", () => {
  const manifestPath = path.resolve("android/app/src/main/AndroidManifest.xml");
  assert.ok(fs.existsSync(manifestPath));

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  assert.match(manifest, /android:screenOrientation="sensorLandscape"/);
  assert.match(manifest, /android.permission.INTERNET/);
});

test("flat app icon assets exist for web and android mipmaps", () => {
  assert.ok(fs.existsSync(path.resolve("assets/pwa-icon-512.png")));
  assert.ok(fs.existsSync(path.resolve("assets/pwa-icon-192.png")));
  assert.ok(fs.existsSync(path.resolve("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png")));
});

test("release APK is present in releases directory", () => {
  const apkPath = path.resolve("releases/MarshMadness.apk");
  assert.ok(fs.existsSync(apkPath));
  const stats = fs.statSync(apkPath);
  assert.ok(stats.size > 1000000);
});
