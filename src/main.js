import { Game } from './core/Game.js';

// Let the loading screen paint before the (synchronous) texture generation starts.
requestAnimationFrame(() => {
  setTimeout(() => {
    try {
      window.__game = new Game();
    } catch (err) {
      console.error(err);
      const el = document.querySelector('#loading .tag');
      if (el) el.textContent = `Failed to start: ${err.message}. See the browser console (Cmd+Option+J).`;
    }
  }, 30);
});
