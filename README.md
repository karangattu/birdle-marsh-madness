# Birdle: Marsh Madness

A static one-minute bird identification game for GitHub Pages.

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