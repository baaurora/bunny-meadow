# Bunny Meadow

A cozy, pastel marathon-training and nutrition tracker for one person, gamified in the spirit of Neko Atsume: check off your day and collect bunnies.

Built from an 18-week training plan (Jul 2 - Nov 1, 2026). Runs as a static site with no build step, and installs to an iPhone home screen as an app (PWA).

## Run locally
Serve the folder over http, for example:

    python3 -m http.server 8137

then open http://localhost:8137

## Files
- `index.html`, `styles.css`, `app.js` - the app
- `bunnies.js` - the bunny art + collectible catalog
- `data.js` - the plan data (generated from the source workbook by `tools/build_data.py`)
- `meals.js` - recipe details per meal
- `manifest.webmanifest`, `sw.js`, `icons/` - PWA install + offline
- `character-sheet.html` - standalone breed art reference

## Notes
- Data saves on-device (localStorage). Cross-device sync and Strava can be added later via a small free backend.
- The lock screen password lives in `config.js`.
