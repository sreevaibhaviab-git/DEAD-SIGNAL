# DEAD SIGNAL — Phase One

First-person psychological sci-fi horror for the browser (Three.js).
Phase One route: **Arrival Airlock → Cargo Bay → Observation Corridor → Security Office → Crew Hub → Mess Hall**.

## Run

Development (serves the project folder; edit and refresh):

```bash
npm run dev
```

Production build and run:

```bash
npm run build
npm start
```

Open **http://localhost:5173** in Chrome. One local server provides both the game and the EVA conversation API, and it only listens on this computer (127.0.0.1).

## Live EVA conversation (optional)

1. Copy `.env.example` to `.env`.
2. Put your Claude API key in `ANTHROPIC_API_KEY`.
3. Optionally add `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` for a recorded-quality EVA voice. Otherwise the browser's built-in voice is used.
4. Restart the server.

In game, press **T** to type to EVA. To talk instead, turn on **Settings → EVA conversation → Voice (hold V)**, then hold **V** while speaking.

Without a `.env`, the game is fully playable. Only the live conversation is disabled; scripted EVA dialogue and all progression still work.

- **Where the key lives:** keys stay in `.env` on the server and are never sent to the browser.
- **What EVA sees:** only the current room, objective, progress flags, door states and evidence you have found. Spoiler canon is never sent.
- **Action checks:** anything EVA proposes (for example, opening a nearby unlocked door) is checked by the server and again by the game.
- **Usage limits:** set in `.env`: replies per session, requests per minute, replies per day, and maximum message length.

## Controls

| Key | Action |
|---|---|
| WASD | Move |
| Mouse | Look |
| Shift | Sprint |
| E | Interact |
| F | Flashlight |
| I | Inventory |
| J | Investigation log |
| T | Message EVA |
| Hold V | Talk to EVA |
| Esc | Pause |

## Build notes

There is no bundler and there are no native binaries, so the Rolldown and Rollup native-binding problems cannot occur. `npm run build` does the following:

- Syntax-checks every file.
- Verifies that every import resolves and every named import exists.
- Copies exactly the modules the game uses into `dist/`.

`three` is the only dependency.
