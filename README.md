# Birdle: Marsh Madness

A static spotting-scope hidden-bird game for GitHub Pages. You have 60 seconds
to find all 11 birds hidden across the marsh — they're tiny dots from this far
away, so you'll need to drag the scope across the scene and identify each
species the moment it appears in the eyepiece.

## How To Play

1. **Splash → Start** — opens the tutorial on first run, otherwise jumps straight
   into a round.
2. **Drag the spotting scope** across the marsh with mouse or touch. The
   eyepiece magnifies whatever is under it.
3. When a bird is centered in the eyepiece, the matching species button lights
   up. Tap it to **log the sighting**. Wrong taps cost a miss.
4. Find all 11 species before the 60-second timer expires. Faster runs save a
   **best time** to local storage.

## Run Locally

```bash
npm run serve
```

Open `http://localhost:4173`.

## Deploy To GitHub Pages

1. Push this repository to GitHub.
2. In the repository settings, open **Pages**.
3. Set the source to **Deploy from a branch**.
4. Choose the `main` branch and `/ (root)` folder.

No build step is required. The deployed site uses [index.html](index.html), [src/app.js](src/app.js), [src/styles.css](src/styles.css), and the files in [assets](assets).

## Asset Processing

Bird sprites are committed as transparent `.png` files in [assets](assets). If you add new bird `.jpg` source files later and want to regenerate the PNGs locally:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install pillow
npm run process:birds
```