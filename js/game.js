// Core game state, simulation and rendering for the top-down arena shooter.

const BEST_KEY = 'neon-arena-best';

const PLAYER = { radius: 14, speed: 260, maxHp: 100, fireDelay: 0.12, bulletSpeed: 720, invuln: 0.8 };

const ENEMY_TYPES = {
  grunt: { radius: 14, speed: 90, hp: 1, damage: 10, score: 10, color: '#ff4d6d' },
  runner: { radius: 10, speed: 165, hp: 1, damage: 8, score: 15, color: '#ffd166' },
  tank: { radius: 24, speed: 55, hp: 5, damage: 25, score: 50, color: '#9b5de5' },
};

const rand = (min, max) => min + Math.random() * (max - min);
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage may be unavailable (private mode); best score stays in memory.
  }
}

export function createGame(input) {
  const game = {
    state: 'menu', // menu | playing | paused | over
    width: 800,
    height: 600,
    player: null,
    bullets: [],
    enemies: [],
    particles: [],
    score: 0,
    best: loadBest(),
    newBest: false,
    wave: 0,
    toSpawn: 0,
    spawnTimer: 0,
    spawnDelay: 1,
    intermission: 0,
    shake: 0,
    time: 0,
    overAt: 0,
  };

  function reset() {
    game.player = { x: game.width / 2, y: game.height / 2, hp: PLAYER.maxHp, cooldown: 0, invuln: 0, angle: 0 };
    game.bullets = [];
    game.enemies = [];
    game.particles = [];
    game.score = 0;
    game.newBest = false;
    game.wave = 0;
    game.shake = 0;
    startWave();
    game.state = 'playing';
  }

  function startWave() {
    game.wave += 1;
    game.toSpawn = 6 + game.wave * 3;
    game.spawnDelay = Math.max(0.22, 1.0 - game.wave * 0.07);
    game.spawnTimer = 0.5;
    game.intermission = 1.8; // shows the "Wave N" banner
  }

  function pickEnemyType() {
    const w = game.wave;
    const roll = Math.random();
    if (w >= 3 && roll < Math.min(0.08 + w * 0.02, 0.25)) return 'tank';
    if (w >= 2 && roll < Math.min(0.3 + w * 0.03, 0.55)) return 'runner';
    return 'grunt';
  }

  function spawnEnemy() {
    const type = pickEnemyType();
    const t = ENEMY_TYPES[type];
    const margin = t.radius + 10;
    let x;
    let y;
    switch (Math.floor(Math.random() * 4)) {
      case 0: x = rand(0, game.width); y = -margin; break;
      case 1: x = game.width + margin; y = rand(0, game.height); break;
      case 2: x = rand(0, game.width); y = game.height + margin; break;
      default: x = -margin; y = rand(0, game.height);
    }
    const speedScale = 1 + (game.wave - 1) * 0.06;
    game.enemies.push({ type, x, y, hp: t.hp, radius: t.radius, speed: t.speed * speedScale, flash: 0 });
  }

  function burst(x, y, color, count, speed = 200) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(speed * 0.3, speed);
      game.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.7), max: 0.7, color });
    }
  }

  function gameOver() {
    game.state = 'over';
    game.overAt = game.time;
    burst(game.player.x, game.player.y, '#4cc9f0', 60, 320);
    if (game.score > game.best) {
      game.best = game.score;
      game.newBest = true;
      saveBest(game.best);
    }
  }

  function updatePlayer(dt) {
    const p = game.player;
    let dx = 0;
    let dy = 0;
    if (input.isDown('a', 'arrowleft')) dx -= 1;
    if (input.isDown('d', 'arrowright')) dx += 1;
    if (input.isDown('w', 'arrowup')) dy -= 1;
    if (input.isDown('s', 'arrowdown')) dy += 1;
    if (dx || dy) {
      const len = Math.hypot(dx, dy);
      p.x += (dx / len) * PLAYER.speed * dt;
      p.y += (dy / len) * PLAYER.speed * dt;
    }
    p.x = Math.min(Math.max(p.x, PLAYER.radius), game.width - PLAYER.radius);
    p.y = Math.min(Math.max(p.y, PLAYER.radius), game.height - PLAYER.radius);
    p.angle = Math.atan2(input.mouse.y - p.y, input.mouse.x - p.x);

    p.cooldown -= dt;
    p.invuln = Math.max(0, p.invuln - dt);
    if ((input.mouse.down || input.isDown(' ')) && p.cooldown <= 0) {
      p.cooldown = PLAYER.fireDelay;
      const spread = rand(-0.04, 0.04);
      const a = p.angle + spread;
      const muzzle = PLAYER.radius + 10;
      game.bullets.push({
        x: p.x + Math.cos(a) * muzzle,
        y: p.y + Math.sin(a) * muzzle,
        vx: Math.cos(a) * PLAYER.bulletSpeed,
        vy: Math.sin(a) * PLAYER.bulletSpeed,
        radius: 4,
      });
    }
  }

  function updateWaves(dt) {
    if (game.intermission > 0) game.intermission -= dt;
    if (game.toSpawn > 0) {
      game.spawnTimer -= dt;
      if (game.spawnTimer <= 0) {
        spawnEnemy();
        game.toSpawn -= 1;
        game.spawnTimer = game.spawnDelay;
      }
    } else if (game.enemies.length === 0) {
      startWave();
    }
  }

  function updateEnemies(dt) {
    const p = game.player;
    for (const e of game.enemies) {
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.x += Math.cos(a) * e.speed * dt;
      e.y += Math.sin(a) * e.speed * dt;
      e.flash = Math.max(0, e.flash - dt);
    }
    // Keep enemies from stacking into a single blob.
    for (let i = 0; i < game.enemies.length; i++) {
      for (let j = i + 1; j < game.enemies.length; j++) {
        const a = game.enemies[i];
        const b = game.enemies[j];
        const min = a.radius + b.radius;
        const d2 = dist2(a, b);
        if (d2 > 0 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const nx = (a.x - b.x) / d;
          const ny = (a.y - b.y) / d;
          a.x += nx * push; a.y += ny * push;
          b.x -= nx * push; b.y -= ny * push;
        }
      }
    }
  }

  function handleCollisions() {
    const p = game.player;
    // Bullets vs enemies.
    for (const b of game.bullets) {
      for (const e of game.enemies) {
        if (e.hp <= 0) continue;
        const r = b.radius + e.radius;
        if (dist2(b, e) < r * r) {
          b.dead = true;
          e.hp -= 1;
          e.flash = 0.08;
          const t = ENEMY_TYPES[e.type];
          if (e.hp <= 0) {
            game.score += t.score;
            burst(e.x, e.y, t.color, 18);
          } else {
            burst(b.x, b.y, '#ffffff', 4, 120);
          }
          break;
        }
      }
    }
    // Enemies vs player.
    for (const e of game.enemies) {
      if (e.hp <= 0) continue;
      const r = PLAYER.radius + e.radius;
      if (dist2(p, e) < r * r && p.invuln <= 0) {
        p.hp = Math.max(0, p.hp - ENEMY_TYPES[e.type].damage);
        p.invuln = PLAYER.invuln;
        game.shake = 0.25;
        burst(p.x, p.y, '#ff4d6d', 14, 180);
        // Knock the enemy back so contact damage is not instant again.
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        e.x += Math.cos(a) * 40;
        e.y += Math.sin(a) * 40;
      }
    }
    game.bullets = game.bullets.filter(
      (b) => !b.dead && b.x > -20 && b.y > -20 && b.x < game.width + 20 && b.y < game.height + 20,
    );
    game.enemies = game.enemies.filter((e) => e.hp > 0);
    if (p.hp <= 0) gameOver();
  }

  function updateParticles(dt) {
    for (const pt of game.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= dt;
    }
    game.particles = game.particles.filter((pt) => pt.life > 0);
  }

  function update(dt) {
    game.time += dt;
    const startKey = input.consume('enter') || input.consume('click');

    if (game.state === 'menu' || game.state === 'over') {
      // Short delay after death so frantic clicking does not restart instantly.
      const ready = game.state === 'menu' || game.time - game.overAt > 0.8;
      if (startKey && ready) reset();
      updateParticles(dt);
      return;
    }
    if (input.consume('p') || input.consume('escape')) {
      game.state = game.state === 'paused' ? 'playing' : 'paused';
    }
    if (game.state === 'paused') return;

    updatePlayer(dt);
    for (const b of game.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    updateWaves(dt);
    updateEnemies(dt);
    handleCollisions();
    updateParticles(dt);
    game.shake = Math.max(0, game.shake - dt);
  }

  // ---------- Rendering ----------

  function drawGrid(ctx) {
    ctx.strokeStyle = 'rgba(76, 201, 240, 0.06)';
    ctx.lineWidth = 1;
    const step = 40;
    ctx.beginPath();
    for (let x = 0; x <= game.width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, game.height); }
    for (let y = 0; y <= game.height; y += step) { ctx.moveTo(0, y); ctx.lineTo(game.width, y); }
    ctx.stroke();
  }

  function glowCircle(ctx, x, y, r, color) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawPlayer(ctx) {
    const p = game.player;
    if (p.invuln > 0 && Math.floor(game.time * 20) % 2 === 0) return; // blink while invulnerable
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#4cc9f0';
    ctx.fillRect(PLAYER.radius - 4, -4, 16, 8); // barrel
    ctx.restore();
    glowCircle(ctx, p.x, p.y, PLAYER.radius, '#4cc9f0');
    ctx.fillStyle = '#0b0d17';
    ctx.beginPath();
    ctx.arc(p.x, p.y, PLAYER.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawEnemy(ctx, e) {
    const t = ENEMY_TYPES[e.type];
    glowCircle(ctx, e.x, e.y, e.radius, e.flash > 0 ? '#ffffff' : t.color);
    if (t.hp > 1) {
      const w = e.radius * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 10, w, 4);
      ctx.fillStyle = t.color;
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 10, (w * e.hp) / t.hp, 4);
    }
  }

  function drawHud(ctx) {
    const p = game.player;
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#e0e6ff';
    ctx.fillText(`Điểm: ${game.score}`, 20, 18);
    ctx.fillText(`Đợt: ${game.wave}`, 20, 42);
    ctx.fillStyle = '#8a93b8';
    ctx.fillText(`Kỷ lục: ${game.best}`, 20, 66);

    const barW = 220;
    const x = game.width - barW - 20;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(x, 20, barW, 14);
    ctx.fillStyle = p.hp > 30 ? '#06d6a0' : '#ff4d6d';
    ctx.fillRect(x, 20, (barW * p.hp) / PLAYER.maxHp, 14);
    ctx.fillStyle = '#e0e6ff';
    ctx.textAlign = 'right';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(`HP ${p.hp}`, game.width - 20, 40);
  }

  function overlay(ctx, title, lines) {
    ctx.fillStyle = 'rgba(11, 13, 23, 0.72)';
    ctx.fillRect(0, 0, game.width, game.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = game.width / 2;
    let y = game.height / 2 - 40 - lines.length * 14;
    ctx.shadowColor = '#4cc9f0';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#4cc9f0';
    ctx.font = '800 56px system-ui, sans-serif';
    ctx.fillText(title, cx, y);
    ctx.shadowBlur = 0;
    y += 64;
    ctx.font = '500 18px system-ui, sans-serif';
    for (const line of lines) {
      ctx.fillStyle = line.color || '#e0e6ff';
      ctx.fillText(line.text, cx, y);
      y += 30;
    }
  }

  function render(ctx) {
    ctx.fillStyle = '#0b0d17';
    ctx.fillRect(0, 0, game.width, game.height);
    drawGrid(ctx);

    ctx.save();
    if (game.shake > 0) ctx.translate(rand(-6, 6) * game.shake * 4, rand(-6, 6) * game.shake * 4);

    for (const pt of game.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;

    if (game.player) {
      for (const e of game.enemies) drawEnemy(ctx, e);
      for (const b of game.bullets) glowCircle(ctx, b.x, b.y, b.radius, '#f8f9ff');
      if (game.state !== 'over') drawPlayer(ctx);
    }
    ctx.restore();

    if (game.state === 'menu') {
      overlay(ctx, 'NEON ARENA', [
        { text: 'WASD / phím mũi tên: di chuyển   •   Chuột: ngắm   •   Click / Space: bắn' },
        { text: 'P / Esc: tạm dừng' },
        { text: `Kỷ lục: ${game.best}`, color: '#8a93b8' },
        { text: 'Click hoặc nhấn Enter để bắt đầu', color: '#ffd166' },
      ]);
      return;
    }

    drawHud(ctx);

    if (game.intermission > 0 && game.state === 'playing') {
      ctx.globalAlpha = Math.min(1, game.intermission);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd166';
      ctx.font = '800 42px system-ui, sans-serif';
      ctx.fillText(`ĐỢT ${game.wave}`, game.width / 2, game.height / 3);
      ctx.globalAlpha = 1;
    }
    if (game.state === 'paused') {
      overlay(ctx, 'TẠM DỪNG', [{ text: 'Nhấn P hoặc Esc để tiếp tục', color: '#ffd166' }]);
    }
    if (game.state === 'over') {
      overlay(ctx, 'GAME OVER', [
        { text: `Điểm: ${game.score}   •   Đợt: ${game.wave}` },
        game.newBest
          ? { text: 'Kỷ lục mới!', color: '#06d6a0' }
          : { text: `Kỷ lục: ${game.best}`, color: '#8a93b8' },
        { text: 'Click hoặc nhấn Enter để chơi lại', color: '#ffd166' },
      ]);
    }
  }

  function resize(width, height) {
    game.width = width;
    game.height = height;
    if (game.player) {
      game.player.x = Math.min(game.player.x, width - PLAYER.radius);
      game.player.y = Math.min(game.player.y, height - PLAYER.radius);
    }
  }

  return { state: game, update, render, resize };
}
