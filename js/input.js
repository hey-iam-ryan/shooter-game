// Tracks keyboard and mouse state relative to the canvas.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set(); // keys pressed since last consume
  const mouse = { x: 0, y: 0, down: false };

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => {
    keys.clear();
    mouse.down = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.down = true;
      pressed.add('click');
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    mouse,
    isDown: (...names) => names.some((n) => keys.has(n)),
    // Returns true once per physical press.
    consume(name) {
      const had = pressed.has(name);
      pressed.delete(name);
      return had;
    },
    clearPressed: () => pressed.clear(),
  };
}
