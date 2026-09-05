import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "dist");

export function buildDist(targetDir = distDir) {
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  const rootFiles = ["index.html", "manifest.webmanifest", "sw.js"];
  for (const file of rootFiles) {
    const src = path.join(rootDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(targetDir, file));
    }
  }

  const directories = ["src", "assets"];
  for (const dir of directories) {
    const src = path.join(rootDir, dir);
    const dest = path.join(targetDir, dir);
    if (fs.existsSync(src)) {
      fs.cpSync(src, dest, {
        recursive: true,
        filter: (srcPath) => !srcPath.includes(".DS_Store")
      });
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  buildDist();
}
