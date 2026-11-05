import { createInput } from './input.js';
import { createGame } from './game.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const game = createGame(input);

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  game.resize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// Exposed for debugging and automated browser checks.
window.__game = game.state;

let last = performance.now();
function frame(now) {
  // Clamp dt so a backgrounded tab does not teleport everything on return.
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  game.update(dt);
  game.render(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
