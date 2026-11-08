# NEON MAZE

A neon-styled Pac-Man–inspired arcade game built with HTML5 Canvas and vanilla JavaScript. No dependencies, no build step.

## Run locally

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Controls

| Key | Action |
|---|---|
| W / Up Arrow | Move up |
| S / Down Arrow | Move down |
| A / Left Arrow | Move left |
| D / Right Arrow | Move right |
| P / Escape | Pause / resume |
| Enter | Start / restart |

## Deploy

The game is fully static (`index.html`, `style.css`, `game.js`).

- **GitHub Pages:** Repo Settings → Pages → Source: "Deploy from a branch" → `main` / root → Save. The game is served at `https://<user>.github.io/<repo>/`.
- **Netlify:** Drag the project folder onto https://app.netlify.com/drop, or connect the repo with no build command and publish directory `.`.
- **Vercel:** Import the repo at https://vercel.com/new, framework preset "Other", no build command, output directory `.`.
