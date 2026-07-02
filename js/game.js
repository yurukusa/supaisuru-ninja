// スパイスルニンジャゲーム 本体
// シーン方式: current = {enter, update(dt), draw, down/move/up} を差し替えて進行する。
// 原案(6歳)の仕様: ハンマー15回 / ノーマル技10回(時間切れあり) / キラ技5回(時間切れなし)
// → ボスHP30、ダメージはハンマー2・ノーマル3・キラ6で回数を正確に再現する。
'use strict';

(() => {

// ============================================================
// 1. Canvas・入力・共通ヘルパー
// ============================================================
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let W = 0, H = 0;

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---- スプライト ----
const IMGS = {};
const SHEETS = ['ninja-idle', 'ninja-run', 'ninja-attack', 'ninja-throw', 'ninja-dead',
                'enemy-idle', 'enemy-attack', 'enemy-dead'];
const MONSTERS = ['cyclope', 'greenoctopus', 'bear', 'flam', 'dragon'];
let imagesReady = false;

function loadImages() {
  const jobs = [];
  for (const n of SHEETS) jobs.push(load(`assets/sprites/${n}.png`, n));
  for (const n of MONSTERS) jobs.push(load(`assets/monsters/${n}.png`, n));
  function load(src, key) {
    return new Promise(res => {
      const im = new Image();
      im.onload = () => { IMGS[key] = im; res(); };
      im.onerror = () => res(); // 読めなくても代替描画で進む
      im.src = src;
    });
  }
  return Promise.all(jobs).then(() => { imagesReady = true; });
}

// シートは全部10フレーム横並び。x,yは足元中心。
function drawSheet(name, frame, x, y, h, { flip = false, alpha = 1 } = {}) {
  const im = IMGS[name];
  if (!im) return false;
  const fw = im.width / 10, fh = im.height;
  const w = h * (fw / fh);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(im, frame * fw, 0, fw, fh, -w / 2, -h, w, h);
  ctx.restore();
  return true;
}

function drawMonster(name, x, y, h, { flip = false, bright = false } = {}) {
  const im = IMGS[name];
  if (!im) return false;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (bright) ctx.filter = 'brightness(2.6)';
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(im, -h / 2, -h, h, h);
  ctx.restore();
  return true;
}

// ---- 画面ゆれ ----
let shakeT = 0, shakePow = 0;
function shake(pow, sec) { shakePow = pow; shakeT = sec; }

// ---- パーティクル ----
const parts = [];
function spawnParts(x, y, n, opt = {}) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(40, opt.speed || 260);
    parts.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.up || 60),
      life: 0, max: rand(0.4, opt.maxLife || 0.9),
      size: rand(3, opt.size || 9),
      color: opt.colors ? opt.colors[i % opt.colors.length] : '#ffb300',
      emoji: opt.emoji || null,
      grav: opt.grav === undefined ? 420 : opt.grav,
    });
  }
}
function updateDrawParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life += dt;
    if (p.life > p.max) { parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt;
    const t = 1 - p.life / p.max;
    ctx.globalAlpha = t;
    if (p.emoji) {
      ctx.font = `${p.size * 3}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(p.emoji, p.x, p.y);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ============================================================
// 2. セーブ
// ============================================================
const SAVE_KEY = 'supaisuru-ninja-v1';
const defaultSave = () => ({
  floor: 1,
  zukan: [],          // 図鑑(永久記録)
  inv: [],            // ノーマルカード持ち物(戦いで消費されうる)
  kira: [],           // キラカード(なくならない)
  stamps: [false, false, false, false, false, false],
  screenksDefeated: false,
});
let save = defaultSave();

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) { save = Object.assign(defaultSave(), JSON.parse(raw)); return true; }
  } catch (e) { /* 壊れたセーブは捨てる */ }
  return false;
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}
function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

const zukanSet = () => new Set(save.zukan);
const ownedKiras = () => save.kira.map(id => DATA.cardById(id));

// カード抽選: まだ図鑑にないカード優先(集める楽しさのため)
function pickNormalCard() {
  const owned = zukanSet();
  const normals = DATA.CARDS.filter(c => !c.kira);
  const unowned = normals.filter(c => !owned.has(c.id));
  const pool = (unowned.length && Math.random() < 0.75) ? unowned : normals;
  return pool[Math.floor(Math.random() * pool.length)];
}
function awardCard(card) {
  if (!save.zukan.includes(card.id)) save.zukan.push(card.id);
  if (card.kira) { if (!save.kira.includes(card.id)) save.kira.push(card.id); }
  else if (save.inv.length < 15) save.inv.push(card.id); // 持ち物は15枚まで(技バーが溢れないように)
  persist();
}

// ============================================================
// 3. 背景描画(地獄の古いお屋敷)
// ============================================================
// 階ごとの色味。上の階ほど禍々しく。
const FLOOR_TINTS = [
  { wall: '#2a0a08', deep: '#160404', glow: '#ff5722' },
  { wall: '#1f2408', deep: '#101202', glow: '#aeea00' },
  { wall: '#2a1608', deep: '#160a02', glow: '#ffab00' },
  { wall: '#2a0812', deep: '#160208', glow: '#ff1744' },
  { wall: '#1c082a', deep: '#0c0216', glow: '#d500f9' },
];

let bgTime = 0;
const embers = [];
function drawInterior(floorIdx, groundY) {
  const t = FLOOR_TINTS[clamp(floorIdx, 0, 4)];
  // 壁
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, t.deep); g.addColorStop(0.62, t.wall); g.addColorStop(1, '#050101');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  // 奥の柱
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  for (let i = 0; i < 4; i++) {
    const px = (W / 4) * i + (W / 8);
    ctx.fillRect(px - 13, groundY - H * 0.52, 26, H * 0.52);
    ctx.fillRect(px - 20, groundY - H * 0.52 - 10, 40, 12);
  }

  // 鬼の掛け軸
  ctx.save();
  ctx.globalAlpha = 0.85;
  const sx = W * 0.5, sy = groundY - H * 0.5;
  ctx.fillStyle = '#3d2b1f'; ctx.fillRect(sx - 34, sy, 68, H * 0.24);
  ctx.fillStyle = '#e8dcc0'; ctx.fillRect(sx - 28, sy + 8, 56, H * 0.24 - 16);
  ctx.font = `${Math.min(44, W * 0.09)}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('👹', sx, sy + H * 0.13);
  ctx.restore();

  // 提灯(ゆらめく灯り)
  for (let i = 0; i < 3; i++) {
    const lx = W * (0.18 + i * 0.32), ly = H * 0.16 + Math.sin(bgTime * 1.3 + i * 2) * 5;
    const fl = 0.75 + Math.sin(bgTime * 9 + i * 7) * 0.14 + Math.sin(bgTime * 23 + i) * 0.06;
    const gg = ctx.createRadialGradient(lx, ly + 26, 4, lx, ly + 26, 120 * fl);
    gg.addColorStop(0, t.glow + 'aa'); gg.addColorStop(1, 'transparent');
    ctx.fillStyle = gg; ctx.fillRect(lx - 130, ly - 100, 260, 260);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, ly); ctx.stroke();
    ctx.fillStyle = `rgba(216,42,28,${0.85 + fl * 0.1})`;
    ctx.beginPath(); ctx.ellipse(lx, ly + 26, 20, 27, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(lx - 12, ly - 3, 24, 5); ctx.fillRect(lx - 12, ly + 51, 24, 5);
    ctx.strokeStyle = 'rgba(60,8,4,0.8)'; ctx.lineWidth = 1;
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.ellipse(lx, ly + 26, 20, 27, 0, 0, Math.PI * 2); ctx.stroke(); }
  }

  // 床板
  ctx.fillStyle = '#160a06';
  ctx.fillRect(0, groundY, W, H - groundY);
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const yy = groundY + (H - groundY) * (i / 6);
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
  }
  const fg = ctx.createLinearGradient(0, groundY, 0, H);
  fg.addColorStop(0, t.glow + '22'); fg.addColorStop(1, 'transparent');
  ctx.fillStyle = fg; ctx.fillRect(0, groundY, W, H - groundY);

  // 漂う霧
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#ffccbc';
  for (let i = 0; i < 2; i++) {
    const off = (bgTime * (14 + i * 9)) % (W * 2) - W;
    for (let x = -1; x <= 1; x++) {
      ctx.beginPath();
      ctx.ellipse(off + x * W * 2 * (i ? 1 : -1), groundY - 24 - i * 40, W * 0.7, 34 + i * 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // 火の粉
  if (embers.length < 26 && Math.random() < 0.35) {
    embers.push({ x: rand(0, W), y: H + 8, v: rand(18, 55), sway: rand(0, 9), size: rand(1.4, 3.4) });
  }
  ctx.fillStyle = t.glow;
  for (let i = embers.length - 1; i >= 0; i--) {
    const e = embers[i];
    e.y -= e.v * 0.016;
    if (e.y < -10) { embers.splice(i, 1); continue; }
    ctx.globalAlpha = 0.35 + Math.sin(bgTime * 6 + e.sway) * 0.25;
    ctx.beginPath();
    ctx.arc(e.x + Math.sin(bgTime * 1.8 + e.sway) * 16, e.y, e.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 周辺減光で不気味さを出す
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, 'transparent'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

// お屋敷の外観(タイトルとイントロ用)。古い和風の御殿+地獄の赤い光。
function drawMansionExterior(cx, baseY, s, t) {
  ctx.save();
  ctx.translate(cx, baseY);
  ctx.scale(s, s);
  const flick = 0.7 + Math.sin(t * 8) * 0.15 + Math.sin(t * 21) * 0.08;

  // 背後の赤い妖気
  const aura = ctx.createRadialGradient(0, -130, 20, 0, -130, 260);
  aura.addColorStop(0, `rgba(255,60,20,${0.34 * flick})`);
  aura.addColorStop(1, 'transparent');
  ctx.fillStyle = aura; ctx.fillRect(-280, -400, 560, 480);

  const roof = (y, w, hh) => {
    ctx.fillStyle = '#1c0606';
    ctx.beginPath();
    ctx.moveTo(-w / 2 - 22, y);
    ctx.quadraticCurveTo(-w / 2, y - hh * 0.55, 0, y - hh);
    ctx.quadraticCurveTo(w / 2, y - hh * 0.55, w / 2 + 22, y);
    ctx.quadraticCurveTo(w / 2 * 0.6, y - hh * 0.28, 0, y - hh * 0.34);
    ctx.quadraticCurveTo(-w / 2 * 0.6, y - hh * 0.28, -w / 2 - 22, y);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,70,30,${0.55 * flick})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-w / 2 - 22, y);
    ctx.quadraticCurveTo(-w / 2, y - hh * 0.55, 0, y - hh);
    ctx.quadraticCurveTo(w / 2, y - hh * 0.55, w / 2 + 22, y);
    ctx.stroke();
  };
  const body = (y, w, hh, wins) => {
    ctx.fillStyle = '#120404';
    ctx.fillRect(-w / 2, y - hh, w, hh);
    ctx.strokeStyle = '#000'; ctx.strokeRect(-w / 2, y - hh, w, hh);
    ctx.fillStyle = `rgba(255,80,10,${0.75 * flick})`;
    for (let i = 0; i < wins; i++) {
      const wx = -w / 2 + (w / (wins + 1)) * (i + 1) - 7;
      ctx.fillRect(wx, y - hh * 0.62, 14, 18);
      ctx.fillStyle = `rgba(255,140,30,${0.9 * flick})`;
      ctx.fillRect(wx + 4, y - hh * 0.62 + 4, 6, 10);
      ctx.fillStyle = `rgba(255,80,10,${0.75 * flick})`;
    }
  };

  // 三層の御殿
  body(0, 220, 78, 4); roof(-74, 240, 44);
  body(-86, 168, 62, 3); roof(-146, 186, 40);
  body(-144, 112, 52, 2); roof(-194, 130, 38);
  // てっぺんの鬼の角
  ctx.fillStyle = '#2a0808';
  ctx.beginPath(); ctx.moveTo(-16, -228); ctx.lineTo(-7, -258); ctx.lineTo(1, -228); ctx.fill();
  ctx.beginPath(); ctx.moveTo(16, -228); ctx.lineTo(7, -258); ctx.lineTo(-1, -228); ctx.fill();

  // 入口(大きな門)
  ctx.fillStyle = '#050101';
  ctx.beginPath();
  ctx.moveTo(-26, 0); ctx.lineTo(-26, -46);
  ctx.quadraticCurveTo(0, -66, 26, -46);
  ctx.lineTo(26, 0); ctx.fill();
  const dg = ctx.createRadialGradient(0, -22, 2, 0, -22, 46);
  dg.addColorStop(0, `rgba(255,120,40,${0.5 * flick})`); dg.addColorStop(1, 'transparent');
  ctx.fillStyle = dg;
  ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-26, -46); ctx.quadraticCurveTo(0, -66, 26, -46); ctx.lineTo(26, 0); ctx.fill();
  ctx.restore();
}

// 夜の野原(イントロ)
function drawField(groundY) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a0614'); g.addColorStop(0.7, '#1a0d1e'); g.addColorStop(1, '#0c0510');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 星と赤い月
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 40; i++) {
    const sx = (i * 137.5) % W, sy = (i * 89.7) % (groundY * 0.8);
    ctx.globalAlpha = 0.2 + ((i * 7) % 10) / 14;
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.globalAlpha = 1;
  const mg = ctx.createRadialGradient(W * 0.8, H * 0.14, 6, W * 0.8, H * 0.14, 90);
  mg.addColorStop(0, '#ff8a65'); mg.addColorStop(0.4, '#c62828cc'); mg.addColorStop(1, 'transparent');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(W * 0.8, H * 0.14, 90, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e57368';
  ctx.beginPath(); ctx.arc(W * 0.8, H * 0.14, 34, 0, Math.PI * 2); ctx.fill();
  // 地面
  ctx.fillStyle = '#120a08'; ctx.fillRect(0, groundY, W, H - groundY);
}

// ============================================================
// 4. シーン管理
// ============================================================
let scene = null;
function setScene(s) {
  scene = s;
  parts.length = 0;
  document.body.classList.remove('screenks'); // ハート表示位置の切替をリセット
  if (s.enter) s.enter();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  bgTime += dt;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shakeT > 0) {
    shakeT -= dt;
    ctx.translate(rand(-shakePow, shakePow), rand(-shakePow, shakePow));
  }
  if (scene) {
    if (scene.update) scene.update(dt);
    if (scene.draw) scene.draw(dt);
  }
  updateDrawParts(dt);
  ctx.restore();
  requestAnimationFrame(loop);
}

// 入力はcanvasに来たものをシーンへ流す(DOMオーバーレイが上にある時は来ない)
cv.addEventListener('pointerdown', e => { if (scene && scene.down) scene.down(e.clientX, e.clientY); });
cv.addEventListener('pointermove', e => { if (scene && scene.move) scene.move(e.clientX, e.clientY); });
cv.addEventListener('pointerup', e => { if (scene && scene.up) scene.up(e.clientX, e.clientY); });

// ============================================================
// 5. タイトル
// ============================================================
function titleScene() {
  let t = 0;
  return {
    enter() {
      UI.hideAllScreens(); UI.hideHud(); UI.hideBossHud(); UI.hideKiraBar();
      UI.show('scr-title');
      const has = hasSave();
      UI.$('btn-continue').classList.toggle('hidden', !has);
      UI.$('btn-start').textContent = has ? 'さいしょから' : 'はじめる';
    },
    update(dt) { t += dt; },
    draw() {
      const groundY = H * 0.9;
      drawField(groundY);
      drawMansionExterior(W / 2, groundY, Math.min(W, H) / 340, t);
      drawSheet('ninja-idle', Math.floor(t * 8) % 10, W * 0.2, groundY, 90);
    },
  };
}

// ============================================================
// 6. イントロ(お屋敷がドーンと降ってくる)
// ============================================================
function introScene() {
  let t = 0;
  let phase = 'wait';   // wait → fall → landed → story → walk → done
  let mansionY = -H;    // 御殿の底辺位置
  let ninjaX;
  const groundY = () => H * 0.88;

  return {
    enter() {
      UI.hideAllScreens();
      ninjaX = W * 0.5;
      AudioMan.bgm('title', { volume: 0.4 });
      UI.showStory(DATA.STORY.intro.slice(0, 1), () => {
        phase = 'fall'; t = 0;
        AudioMan.play('whoosh', { volume: 1, rate: 0.6 });
      });
    },
    update(dt) {
      t += dt;
      if (phase === 'fall') {
        mansionY = lerp(-H * 0.6, groundY(), Math.min(1, t / 1.1) ** 2);
        // 忍者は慌てて左へ逃げる
        ninjaX = Math.max(W * 0.16, ninjaX - dt * 260);
        if (t >= 1.1) {
          phase = 'landed'; t = 0;
          shake(22, 0.8);
          AudioMan.play('impact', { volume: 1, rate: 0.7 });
          UI.banner('ドーーーン！！', 1500);
          spawnParts(W / 2, groundY(), 50, { colors: ['#8d6e63', '#5d4037', '#ffab91'], speed: 420, size: 12 });
        }
      } else if (phase === 'landed' && t > 1.7) {
        phase = 'story';
        UI.showStory(DATA.STORY.intro.slice(1), () => { phase = 'walk'; t = 0; });
      } else if (phase === 'walk') {
        ninjaX += dt * 200;
        if (ninjaX >= W * 0.5 - 10) {
          phase = 'done';
          UI.banner('おやしきに　はいる！', 1300);
          setTimeout(() => setScene(mansionScene()), 1300);
        }
      }
    },
    draw() {
      drawField(groundY());
      if (phase !== 'wait') drawMansionExterior(W / 2, phase === 'fall' ? mansionY : groundY(), Math.min(W, H) / 340, t);
      const anim = phase === 'walk' || phase === 'fall' ? 'ninja-run' : 'ninja-idle';
      drawSheet(anim, Math.floor(bgTime * 12) % 10, ninjaX, groundY(), 92, { flip: phase === 'fall' });
    },
  };
}

// ============================================================
// 7. お屋敷探索(指で忍者を動かす)
// ============================================================
const STREAK_NEED = 5;
let streak = 0;

function mansionScene(opt = {}) {
  const floorIdx = clamp(Math.min(save.floor, 5) - 1, 0, 4);
  const groundY = () => H * 0.82;
  let mode = 'explore'; // explore | quiz | enemyDying | emote | bossIn
  let t = 0;
  const ninja = { x: W * 0.3, y: 0, dir: 1, moving: false, tx: null };
  const enemy = { x: W * 0.85, dir: -1, wt: 0, safe: 1.2 };
  let emote = null;

  function respawnEnemy() {
    // 忍者から離れた場所に湧かせて、即接触を防ぐ
    enemy.x = ninja.x < W / 2 ? rand(W * 0.7, W * 0.92) : rand(W * 0.08, W * 0.3);
    enemy.dir = enemy.x > ninja.x ? -1 : 1;
    enemy.safe = 1.0;
  }

  function startQuiz() {
    mode = 'quiz';
    ninja.tx = null; ninja.moving = false;
    AudioMan.play('menu');
    UI.showQuiz(DATA.makeQuiz(save.floor), ok => {
      if (ok) {
        AudioMan.play('slash');
        setTimeout(() => AudioMan.play('victory', { volume: 0.7 }), 250);
        mode = 'enemyDying'; t = 0;
        streak++;
        spawnParts(enemy.x, groundY() - 60, 24, { colors: ['#ffd54a', '#ff7043', '#fff'], speed: 300 });
      } else {
        AudioMan.play('wrong');
        streak = 0;
        UI.showHud(save.floor, streak, STREAK_NEED, save.kira.length > 0);
        UI.banner('れんぞく　リセット！', 1200);
        respawnEnemy();
        mode = 'explore';
      }
    });
  }

  function afterEnemyDefeated() {
    const card = pickNormalCard();
    awardCard(card);
    AudioMan.play('chest-open', { volume: 0.9 });
    UI.showCardGet(card, () => {
      UI.showHud(save.floor, streak, STREAK_NEED, save.kira.length > 0);
      if (streak >= STREAK_NEED) {
        mode = 'bossIn'; t = 0;
        shake(10, 1.2);
        AudioMan.play('impact', { rate: 0.6 });
        UI.banner('ゴゴゴゴ……ボスが　くるぞ！！', 1900);
        setTimeout(() => setScene(bossScene(save.floor)), 2100);
      } else {
        respawnEnemy();
        mode = 'explore';
      }
    });
  }

  return {
    enter() {
      UI.hideAllScreens();
      UI.showHud(save.floor, streak, STREAK_NEED, save.kira.length > 0);
      AudioMan.bgm('mansion', { volume: 0.42 });
      if (opt.banner) UI.banner(opt.banner, 1600);
      respawnEnemy();
    },
    update(dt) {
      t += dt;
      if (mode === 'emote' && emote) {
        emote.t += dt;
        if (emote.t > 2.6) { emote = null; mode = 'explore'; }
        return;
      }
      if (mode !== 'explore') return;
      // 忍者の移動
      if (ninja.tx !== null) {
        const d = ninja.tx - ninja.x;
        if (Math.abs(d) > 8) {
          ninja.dir = d > 0 ? 1 : -1;
          ninja.x += clamp(d, -1, 1) * 250 * dt;
          ninja.moving = true;
        } else { ninja.moving = false; }
      } else ninja.moving = false;
      ninja.x = clamp(ninja.x, 34, W - 34);
      // 敵はうろうろ歩く
      enemy.wt -= dt;
      if (enemy.wt <= 0) { enemy.wt = rand(0.8, 2.2); enemy.dir = Math.random() < 0.5 ? -1 : 1; }
      enemy.x += enemy.dir * 55 * dt;
      if (enemy.x < 40 || enemy.x > W - 40) enemy.dir *= -1;
      enemy.x = clamp(enemy.x, 40, W - 40);
      if (enemy.safe > 0) enemy.safe -= dt;
      // 接触でクイズ開始
      else if (Math.abs(ninja.x - enemy.x) < 56) startQuiz();
    },
    draw() {
      drawInterior(floorIdx, groundY());
      const gy = groundY();
      // 敵
      if (mode === 'enemyDying') {
        drawSheet('enemy-dead', Math.min(9, Math.floor(t * 12)), enemy.x, gy, 96, { flip: enemy.x > ninja.x });
        if (t > 0.9) afterEnemyDefeated(), mode = 'wait';
      } else if (mode !== 'wait' && mode !== 'bossIn') {
        const anim = mode === 'quiz' ? 'enemy-attack' : 'enemy-idle';
        const fl = mode === 'quiz' ? enemy.x > ninja.x : enemy.dir < 0;
        drawSheet(anim, Math.floor(bgTime * (mode === 'quiz' ? 7 : 8)) % 10, enemy.x, gy, 96, { flip: fl });
        // ？マーク
        ctx.font = '26px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('❓', enemy.x, gy - 108 + Math.sin(bgTime * 4) * 4);
      }
      // 忍者
      if (mode === 'emote' && emote) {
        const k = emote.kira;
        // スポットライト
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
        const sg = ctx.createRadialGradient(ninja.x, gy - 60, 10, ninja.x, gy - 60, 170);
        sg.addColorStop(0, 'rgba(255,244,200,0.3)'); sg.addColorStop(1, 'transparent');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(ninja.x, gy - 60, 170, 0, Math.PI * 2); ctx.fill();
        const seq = ['ninja-attack', 'ninja-throw', 'ninja-run'][Math.floor(emote.t * 2.5) % 3];
        drawSheet(seq, Math.floor(emote.t * 14) % 10, ninja.x, gy, 100, { flip: Math.floor(emote.t * 5) % 2 === 0 });
        // 絵文字が周りをまわる
        ctx.font = '30px sans-serif'; ctx.textAlign = 'center';
        for (let i = 0; i < 6; i++) {
          const a = emote.t * 3 + (i / 6) * Math.PI * 2;
          ctx.fillText(k.emoteEmoji, ninja.x + Math.cos(a) * 86, gy - 66 + Math.sin(a) * 60);
        }
      } else {
        drawSheet(ninja.moving ? 'ninja-run' : 'ninja-idle', Math.floor(bgTime * (ninja.moving ? 14 : 8)) % 10, ninja.x, gy, 92, { flip: ninja.dir < 0 });
      }
      // 移動先の目印
      if (mode === 'explore' && ninja.tx !== null && Math.abs(ninja.tx - ninja.x) > 8) {
        ctx.strokeStyle = '#ffd54a88'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(ninja.tx, gy + 6, 12 + Math.sin(bgTime * 8) * 3, 0, Math.PI * 2); ctx.stroke();
      }
    },
    down(x, y) { if (mode === 'explore') ninja.tx = x; },
    move(x, y) { if (mode === 'explore' && ninja.tx !== null) ninja.tx = x; },
    up() {},
    playEmote(k) {
      if (mode !== 'explore') return;
      emote = { kira: k, t: 0 };
      mode = 'emote';
      AudioMan.play('magic', { volume: 0.9 });
      UI.banner(`${k.emoteEmoji} ${k.emote}！`, 1800);
    },
  };
}

// ============================================================
// 8. ボス戦(ハンマーでマークをたたく)
// ============================================================
const BOSS_MAX_HP = 30;
const PLAYER_MAX_HEARTS = 15;
const DMG = { hammer: 2, normal: 3, kira: 6 };
const CARD_TIME = 20; // ノーマル技の制限時間(秒)

function bossScene(floor) {
  const boss = DATA.BOSSES[clamp(floor - 1, 0, 4)];
  const groundY = () => H * 0.62;
  let hp = BOSS_MAX_HP;
  let hearts = PLAYER_MAX_HEARTS;
  let t = 0;
  let over = false;

  // 武器 = ハンマー + キラ + ノーマル持ちもの
  let weapon = { uid: 'hammer', type: 'hammer', emoji: '🔨', name: 'ハンマー' };
  const techs = [weapon];
  ownedKiras().forEach(k => techs.push({ uid: k.id, type: 'kira', emoji: k.emoji, name: k.name, kira: true, fx: k.fx }));
  save.inv.forEach((id, i) => {
    const c = DATA.cardById(id);
    techs.push({ uid: 'copy' + i, type: 'normal', cardId: id, emoji: c.emoji, name: c.name, border: c.border });
  });
  const timed = new Map(); // uid → のこり秒

  // たたくマーク
  const mark = { x: 0, y: 0, alive: false, t: 0 };
  let markDelay = 0.6;
  function placeMark() {
    mark.x = rand(W * 0.14, W * 0.86);
    mark.y = rand(H * 0.3, H * 0.72);
    mark.alive = true; mark.t = 0;
  }

  // ボスの攻撃
  let atkTimer = rand(3.2, 5.0);
  let telegraph = 0;  // 予備動作の残り秒
  let lungeT = 0;     // 突進表示

  // たたいた演出
  let swing = null; // {x,y,t,emoji,fx,hammer}

  function selectWeapon(tech) {
    if (over) return;
    weapon = tech;
    AudioMan.play('menu', { volume: 0.7 });
    UI.setActiveTech(tech.uid);
    if (tech.type === 'normal' && !timed.has(tech.uid)) {
      timed.set(tech.uid, CARD_TIME);
      UI.banner(`${tech.emoji} ${tech.name}！`, 1100);
    }
    if (tech.type === 'kira') UI.banner(`✨${tech.name}！！`, 1100);
    if (tech.type === 'normal') { UI.showTechTimer(tech.name); UI.updateTechTimer(timed.get(tech.uid) / CARD_TIME); }
    else UI.hideTechTimer();
  }

  function loseCard(uid) {
    const tech = techs.find(x => x.uid === uid);
    timed.delete(uid);
    UI.removeTech(uid);
    // セーブの持ち物からも1枚消す(図鑑には残る)
    const idx = save.inv.indexOf(tech.cardId);
    if (idx >= 0) { save.inv.splice(idx, 1); persist(); }
    if (weapon.uid === uid) {
      weapon = techs[0]; // ハンマーに戻る
      UI.setActiveTech('hammer');
      UI.hideTechTimer();
    }
    UI.banner('じかんぎれ！わざが　きえた！', 1500);
    AudioMan.play('wrong', { volume: 0.7 });
  }

  function win() {
    over = true;
    mark.alive = false;
    UI.hideTechTimer();
    AudioMan.stopBgm();
    AudioMan.play('victory');
    shake(14, 0.5);
    spawnParts(W / 2, groundY() - 100, 60, { colors: ['#ffd54a', '#fff', boss.tint], speed: 420, size: 11 });
    UI.banner(`${boss.name}を　たおした！！`, 2000);
    const kira = DATA.KIRA_CARDS[clamp(floor - 1, 0, 4)];
    // エンディング後の再戦: キラは持っているので、かわりにノーマルカード3枚
    if (save.kira.includes(kira.id)) {
      setTimeout(() => {
        UI.hideBossHud();
        let left = 3;
        const giveNext = () => {
          if (left-- <= 0) { streak = 0; setScene(mansionScene({ banner: 'カードを　3まい　ゲット！' })); return; }
          const card = pickNormalCard();
          awardCard(card);
          AudioMan.play('chest-open', { volume: 0.9 });
          UI.showCardGet(card, giveNext);
        };
        giveNext();
      }, 2100);
      return;
    }
    setTimeout(() => {
      awardCard(kira);
      AudioMan.play('bonus');
      UI.showCardGet(kira, () => setScene(emoteShowScene(kira, () => {
        UI.showStampRally(save.stamps, floor - 1, () => {
          save.stamps[floor - 1] = true;
          save.floor = floor + 1;
          persist();
          streak = 0;
          if (save.floor > 5 && !save.screenksDefeated) {
            setScene(basementScene());
          } else if (save.screenksDefeated || save.floor > 5) {
            setScene(mansionScene({ banner: 'カードを　もっと　あつめよう！' }));
          } else {
            setScene(mansionScene({ banner: `${save.floor}かいへ　すすむ！` }));
          }
        });
      })));
    }, 2100);
  }

  function lose() {
    over = true;
    UI.hideBossHud();
    UI.hideTechTimer();
    AudioMan.stopBgm();
    UI.show('scr-lose');
    const btn = UI.$('btn-retry');
    const h = () => { btn.removeEventListener('pointerdown', h); UI.hide('scr-lose'); setScene(bossScene(floor)); };
    btn.addEventListener('pointerdown', h);
  }

  return {
    enter() {
      UI.hideAllScreens(); UI.hideHud();
      AudioMan.bgm('boss', { volume: 0.5 });
      UI.showBossHud(boss.name, techs, selectWeapon);
      UI.setActiveTech('hammer');
      UI.updateBossHp(1);
      UI.updateHearts(hearts, PLAYER_MAX_HEARTS);
      UI.banner(`${boss.name}が　あらわれた！！`, 1800);
      setTimeout(placeMark, 900);
    },
    update(dt) {
      t += dt;
      if (over) return;
      if (mark.alive) mark.t += dt;
      if (!mark.alive) { markDelay -= dt; if (markDelay <= 0) { placeMark(); } }

      // ノーマル技の時間切れ管理
      for (const [uid, left] of [...timed]) {
        const nl = left - dt;
        if (nl <= 0) loseCard(uid);
        else {
          timed.set(uid, nl);
          if (weapon.uid === uid) UI.updateTechTimer(nl / CARD_TIME);
        }
      }

      // ボスの攻撃(急にたたいてくる)
      if (telegraph > 0) {
        telegraph -= dt;
        if (telegraph <= 0) {
          lungeT = 0.35;
          hearts--;
          UI.updateHearts(hearts, PLAYER_MAX_HEARTS);
          shake(16, 0.4);
          AudioMan.play('hit', { volume: 1, rate: 0.8 });
          spawnParts(W / 2, H * 0.78, 18, { colors: ['#ff5252', '#ff8a80'], speed: 300 });
          if (hearts <= 0) { lose(); return; }
          atkTimer = rand(3.2, 6.0);
        }
      } else {
        atkTimer -= dt;
        if (atkTimer <= 0) {
          telegraph = 0.9;
          AudioMan.play('shuriken', { rate: 0.7 });
        }
      }
      if (lungeT > 0) lungeT -= dt;
      if (swing) { swing.t += dt; if (swing.t > 0.45) swing = null; }
    },
    draw() {
      drawInterior(clamp(floor - 1, 0, 4), H * 0.86);
      const gy = groundY();
      // ボス登場台座の妖気
      const ag = ctx.createRadialGradient(W / 2, gy - 40, 10, W / 2, gy - 40, 200);
      ag.addColorStop(0, boss.tint + '44'); ag.addColorStop(1, 'transparent');
      ctx.fillStyle = ag; ctx.fillRect(W / 2 - 210, gy - 250, 420, 420);

      // ボス本体(ドット絵を大きく)
      const bob = Math.sin(bgTime * 2.4) * 8;
      const lunge = lungeT > 0 ? (0.35 - lungeT) * 240 : 0;
      const size = Math.min(W, H) * 0.42 * (boss.scale / 3.6);
      const bx = W / 2 + (telegraph > 0 ? rand(-4, 4) : 0);
      const by = gy + bob + lunge;
      if (telegraph > 0) {
        ctx.font = '44px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('❗', bx, by - size - 18 + Math.sin(bgTime * 20) * 4);
      }
      drawMonster(boss.sprite, bx, by, size, { bright: telegraph > 0 && Math.floor(bgTime * 10) % 2 === 0 });

      // 忍者(下で構えている)
      drawSheet(lungeT > 0 ? 'ninja-dead' : 'ninja-idle', lungeT > 0 ? 2 : Math.floor(bgTime * 8) % 10, W * 0.5, H * 0.86, 84);

      // たたくマーク
      if (mark.alive && !over) {
        const pulse = 1 + Math.sin(mark.t * 7) * 0.12;
        ctx.save();
        ctx.translate(mark.x, mark.y);
        ctx.scale(pulse, pulse);
        ctx.strokeStyle = '#ffd54a'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(0, 0, 34, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#ff5722'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ff5722';
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // たたいた瞬間の演出
      if (swing) {
        const p = swing.t / 0.45;
        ctx.save();
        ctx.translate(swing.x, swing.y);
        if (swing.hammer) {
          // ハンマーが振り下ろされる
          const ang = lerp(-1.9, 0.25, Math.min(1, p * 2.4));
          ctx.rotate(ang);
          ctx.fillStyle = '#8d6e63'; ctx.fillRect(-6, -12, 12, 86);
          ctx.fillStyle = '#616161';
          ctx.beginPath(); ctx.roundRect(-34, -52, 68, 44, 10); ctx.fill();
          ctx.fillStyle = '#9e9e9e';
          ctx.beginPath(); ctx.roundRect(-34, -52, 68, 14, 8); ctx.fill();
        } else {
          ctx.font = `${54 * (1 + p)}px sans-serif`; ctx.textAlign = 'center';
          ctx.globalAlpha = 1 - p;
          ctx.fillText(swing.emoji, 0, 10);
          ctx.strokeStyle = swing.fx || '#ffd54a';
          ctx.lineWidth = 5; ctx.globalAlpha = (1 - p) * 0.9;
          ctx.beginPath(); ctx.arc(0, 0, 20 + p * 70, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      // 予備動作の赤い縁
      if (telegraph > 0) {
        ctx.fillStyle = `rgba(255,20,10,${0.16 + Math.sin(bgTime * 16) * 0.08})`;
        ctx.fillRect(0, 0, W, H);
      }
    },
    down(x, y) {
      if (over || !mark.alive) return;
      if (Math.hypot(x - mark.x, y - mark.y) < 52) {
        mark.alive = false;
        markDelay = 0.32;
        const dmg = DMG[weapon.type];
        hp -= dmg;
        UI.updateBossHp(hp / BOSS_MAX_HP);
        swing = { x, y, t: 0, hammer: weapon.type === 'hammer', emoji: weapon.emoji, fx: weapon.fx };
        AudioMan.play('whoosh', { volume: 0.8 });
        setTimeout(() => AudioMan.play(weapon.type === 'kira' ? 'magic' : 'hit'), 110);
        shake(weapon.type === 'kira' ? 10 : 6, 0.18);
        spawnParts(x, y, weapon.type === 'kira' ? 22 : 10, {
          colors: weapon.type === 'kira' ? ['#fff', weapon.fx, '#ffd700'] : ['#ffd54a', '#ff7043'],
          speed: 320,
        });
        UI.tapFx(x, y, '💥');
        if (hp <= 0) win();
      }
    },
  };
}

// ============================================================
// 9. エモートおひろめ(キラ入手後に忍者が実演)
// ============================================================
function emoteShowScene(kira, onDone) {
  let t = 0;
  let finished = false;
  return {
    enter() {
      UI.hideBossHud();
      AudioMan.play('magic');
      UI.banner(`エモート「${kira.emote}」を　おぼえた！`, 2300);
    },
    update(dt) {
      t += dt;
      if (t > 3.2 && !finished) { finished = true; onDone(); }
    },
    draw() {
      ctx.fillStyle = '#080203'; ctx.fillRect(0, 0, W, H);
      const gy = H * 0.7;
      const sg = ctx.createRadialGradient(W / 2, gy - 70, 10, W / 2, gy - 70, 230);
      sg.addColorStop(0, 'rgba(255,244,200,0.32)'); sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(W / 2, gy - 70, 230, 0, Math.PI * 2); ctx.fill();
      const seq = ['ninja-attack', 'ninja-throw', 'ninja-run'][Math.floor(t * 2.5) % 3];
      drawSheet(seq, Math.floor(t * 14) % 10, W / 2, gy, 120, { flip: Math.floor(t * 5) % 2 === 0 });
      ctx.font = '38px sans-serif'; ctx.textAlign = 'center';
      for (let i = 0; i < 7; i++) {
        const a = t * 2.6 + (i / 7) * Math.PI * 2;
        ctx.fillText(kira.emoteEmoji, W / 2 + Math.cos(a) * 120, gy - 80 + Math.sin(a) * 80);
      }
      if (Math.random() < 0.3) spawnParts(rand(W * 0.2, W * 0.8), rand(H * 0.3, H * 0.7), 2, { colors: [kira.fx, '#fff'], grav: -40, speed: 60 });
    },
  };
}

// ============================================================
// 10. 地下(封印のとびら)→スクリーンクスモンスター
// ============================================================
function basementScene() {
  return {
    enter() {
      UI.hideAllScreens(); UI.hideHud();
      AudioMan.stopBgm();
      UI.showStory(DATA.STORY.basement, () => setScene(screenksScene()));
    },
    draw() {
      // 地下: 真っ暗+封印のとびら
      ctx.fillStyle = '#050103'; ctx.fillRect(0, 0, W, H);
      const dx = W / 2, dy = H * 0.62;
      const fl = 0.7 + Math.sin(bgTime * 6) * 0.2;
      ctx.fillStyle = '#160a06';
      ctx.fillRect(dx - 90, dy - 200, 180, 200);
      ctx.strokeStyle = `rgba(213,0,249,${fl})`; ctx.lineWidth = 4;
      ctx.strokeRect(dx - 90, dy - 200, 180, 200);
      // お札
      ctx.save();
      ctx.translate(dx, dy - 110);
      ctx.rotate(Math.sin(bgTime * 2) * 0.05);
      ctx.fillStyle = '#e8dcc0'; ctx.fillRect(-22, -60, 44, 120);
      ctx.strokeStyle = '#7f0f0f'; ctx.lineWidth = 3; ctx.strokeRect(-22, -60, 44, 120);
      ctx.fillStyle = '#7f0f0f'; ctx.font = '26px serif'; ctx.textAlign = 'center';
      ctx.fillText('封', 0, -18); ctx.fillText('印', 0, 22);
      ctx.restore();
      const gg = ctx.createRadialGradient(dx, dy - 100, 10, dx, dy - 100, 240);
      gg.addColorStop(0, `rgba(213,0,249,${0.16 * fl})`); gg.addColorStop(1, 'transparent');
      ctx.fillStyle = gg; ctx.fillRect(0, 0, W, H);
      drawSheet('ninja-idle', Math.floor(bgTime * 8) % 10, W * 0.24, dy, 86);
    },
  };
}

// スクリーンクスモンスター: 影に包まれた黒い体、紫・緑・青・赤のたくさんの目。
const SCREENKS_HP = 20;
function screenksScene() {
  let hp = SCREENKS_HP;
  let hearts = PLAYER_MAX_HEARTS;
  let t = 0;
  let over = false;
  let hurtT = 0;
  let telegraph = 0, atkTimer = 6, lungeT = 0;
  let dieT = -1;

  // 目の配置(色は原案どおり紫・緑・青・赤)
  const EYE_COLORS = ['#b388ff', '#69f0ae', '#40c4ff', '#ff5252', '#d500f9', '#00e676'];
  const eyes = [];
  for (let i = 0; i < 15; i++) {
    const a = rand(0, Math.PI * 2), r = rand(0.15, 0.95);
    eyes.push({
      ox: Math.cos(a) * r * 0.85, oy: Math.sin(a) * r * 0.6 - 0.1,
      s: rand(0.07, 0.16),
      color: EYE_COLORS[i % EYE_COLORS.length],
      blink: rand(0, 6), speed: rand(2.2, 4.2),
    });
  }

  function win() {
    over = true;
    dieT = 0;
    UI.hideKiraBar();
    AudioMan.stopBgm();
    AudioMan.play('victory');
    setTimeout(() => {
      save.screenksDefeated = true;
      persist();
      UI.showStory(DATA.STORY.ending, () => {
        UI.showStampRally(save.stamps, 5, () => {
          save.stamps[5] = true;
          persist();
          setScene(endingScene());
        });
      });
    }, 2600);
  }

  function lose() {
    over = true;
    UI.hideKiraBar();
    AudioMan.stopBgm();
    UI.show('scr-lose');
    const btn = UI.$('btn-retry');
    const h = () => { btn.removeEventListener('pointerdown', h); UI.hide('scr-lose'); setScene(screenksScene()); };
    btn.addEventListener('pointerdown', h);
  }

  function useKira(k, e) {
    if (over) return;
    hp--;
    hurtT = 0.3;
    shake(12, 0.3);
    AudioMan.play('magic');
    const mx = W / 2 + rand(-60, 60), my = H * 0.4 + rand(-50, 50);
    spawnParts(mx, my, 26, { colors: [k.fx, '#fff', '#ffd700'], speed: 380, size: 10 });
    UI.tapFx(e.clientX, e.clientY, k.emoji);
    if (hp <= 0) win();
  }

  return {
    enter() {
      UI.hideAllScreens(); UI.hideHud();
      document.body.classList.add('screenks'); // キラ技バーと重ならないようハートを上げる
      AudioMan.bgm('boss', { rate: 0.75, volume: 0.55 });
      UI.show('boss-hud');
      UI.$('tech-bar').innerHTML = '';
      UI.$('boss-name').textContent = 'スクリーンクスモンスター';
      UI.updateBossHp(1);
      UI.updateHearts(hearts, PLAYER_MAX_HEARTS);
      UI.showKiraBar(ownedKiras(), useKira);
      UI.banner('スクリーンクスモンスター！！', 2200);
    },
    update(dt) {
      t += dt;
      if (hurtT > 0) hurtT -= dt;
      if (over) { if (dieT >= 0) dieT += dt; return; }
      if (telegraph > 0) {
        telegraph -= dt;
        if (telegraph <= 0) {
          lungeT = 0.4;
          hearts--;
          UI.updateHearts(hearts, PLAYER_MAX_HEARTS);
          shake(20, 0.5);
          AudioMan.play('hit', { rate: 0.6, volume: 1 });
          if (hearts <= 0) { lose(); return; }
          atkTimer = rand(5.0, 7.5);
        }
      } else {
        atkTimer -= dt;
        if (atkTimer <= 0) { telegraph = 1.1; AudioMan.play('shuriken', { rate: 0.5 }); }
      }
      if (lungeT > 0) lungeT -= dt;
    },
    draw() {
      // 深い闇
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#020007'); g.addColorStop(1, '#0c0114');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      const cx = W / 2, cy = H * 0.4;
      const R = Math.min(W, H) * 0.34;
      const dieShrink = dieT >= 0 ? Math.max(0, 1 - dieT / 2.2) : 1;

      // 影のからだ(ぶよぶよ動く多層の黒)
      for (let l = 3; l >= 0; l--) {
        ctx.fillStyle = ['#000', '#07020c', '#0d0316', '#14051f'][l];
        ctx.beginPath();
        const rr = R * (0.6 + l * 0.18) * dieShrink;
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const wob = Math.sin(a * 3 + t * (1.2 + l * 0.4)) * rr * 0.12 + Math.sin(a * 5 - t * 2) * rr * 0.06;
          const px = cx + Math.cos(a) * (rr + wob) * 1.15;
          const py = cy + Math.sin(a) * (rr + wob) * 0.82 + (lungeT > 0 ? (0.4 - lungeT) * 130 : 0);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
      }
      // 影のうで(触手)
      ctx.strokeStyle = '#07020c';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t * 0.5;
        const sx = cx + Math.cos(a) * R * 0.9 * dieShrink, sy = cy + Math.sin(a) * R * 0.65 * dieShrink;
        ctx.lineWidth = 16 * dieShrink;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(
          sx + Math.cos(a + Math.sin(t * 2 + i)) * R * 0.5,
          sy + Math.sin(a + Math.cos(t * 1.7 + i)) * R * 0.5,
          sx + Math.cos(a) * R * 0.85, sy + Math.sin(a) * R * 0.7);
        ctx.stroke();
      }

      // たくさんの目
      const allRed = telegraph > 0;
      eyes.forEach((e, i) => {
        // やられた時は端から目を閉じる
        if (dieT >= 0 && i < eyes.length * (dieT / 1.8)) return;
        let open = clamp(Math.sin(t * e.speed + e.blink) * 3 + 2.4, 0, 1);
        if (hurtT > 0) open *= 0.25;
        const ex = cx + e.ox * R * dieShrink, ey = cy + e.oy * R * dieShrink + (lungeT > 0 ? (0.4 - lungeT) * 130 : 0);
        const es = e.s * R * dieShrink;
        const col = allRed ? '#ff1744' : e.color;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.scale(1, Math.max(0.06, open));
        const eg = ctx.createRadialGradient(0, 0, es * 0.1, 0, 0, es * 2.4);
        eg.addColorStop(0, col + '66'); eg.addColorStop(1, 'transparent');
        ctx.fillStyle = eg;
        ctx.beginPath(); ctx.arc(0, 0, es * 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(0, 0, es, es * 0.75, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(0, 0, es * 0.22, es * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff9';
        ctx.beginPath(); ctx.arc(-es * 0.3, -es * 0.25, es * 0.16, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });

      // 忍者
      drawSheet(lungeT > 0 ? 'ninja-dead' : 'ninja-idle', lungeT > 0 ? 2 : Math.floor(bgTime * 8) % 10, W / 2, H * 0.85, 82);

      if (telegraph > 0) {
        ctx.fillStyle = `rgba(255,20,10,${0.15 + Math.sin(bgTime * 16) * 0.08})`;
        ctx.fillRect(0, 0, W, H);
        ctx.font = '46px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('❗', cx, cy - R - 20);
      }
      if (dieT >= 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.9, dieT / 2.4)})`;
        ctx.fillRect(0, 0, W, H);
      }
    },
  };
}

// ============================================================
// 11. エンディング
// ============================================================
function endingScene() {
  let t = 0;
  return {
    enter() {
      UI.hideAllScreens(); UI.hideHud(); UI.hideBossHud(); UI.hideKiraBar();
      AudioMan.bgm('title', { volume: 0.5 });
      UI.show('scr-ending');
      UI.$('ending-text').textContent = 'スクリーンクスモンスターを　たおして、おやしきに　へいわが　もどった！　きみは　ほんものの　にんじゃマスターだ！！';
      const owned = zukanSet();
      const n = DATA.CARDS.filter(c => owned.has(c.id)).length;
      UI.$('ending-stats').textContent = `あつめたカード：${n}／${DATA.CARDS.length}まい`;
    },
    update(dt) {
      t += dt;
      if (Math.random() < 0.06) {
        spawnParts(rand(0, W), rand(0, H * 0.5), 14, {
          colors: ['#ffd54a', '#ff7043', '#40c4ff', '#69f0ae', '#f48fb1'],
          speed: 260, grav: 160, size: 7,
        });
      }
    },
    draw() {
      drawField(H * 0.9);
      drawMansionExterior(W / 2, H * 0.9, Math.min(W, H) / 340, t);
      const seq = ['ninja-run', 'ninja-attack', 'ninja-throw'][Math.floor(t * 1.4) % 3];
      drawSheet(seq, Math.floor(t * 12) % 10, W * 0.2, H * 0.9, 96);
    },
  };
}

// ============================================================
// 12. 起動・ボタン配線
// ============================================================
function newGame() {
  save = defaultSave();
  persist();
  streak = 0;
  setScene(introScene());
}

let resetArmed = false;
UI.$('btn-start').addEventListener('pointerdown', () => {
  AudioMan.play('button');
  if (hasSave() && !resetArmed) {
    resetArmed = true;
    UI.banner('もういちど　おすと　さいしょから！', 2500);
    setTimeout(() => { resetArmed = false; }, 3000);
    return;
  }
  newGame();
});
UI.$('btn-continue').addEventListener('pointerdown', () => {
  AudioMan.play('button');
  loadSave();
  streak = 0;
  if (save.floor > 5 && !save.screenksDefeated) setScene(basementScene());
  else setScene(mansionScene({ banner: 'おかえり！' }));
});
UI.$('btn-zukan-title').addEventListener('pointerdown', () => {
  loadSave();
  UI.showZukan(zukanSet());
});
UI.$('btn-zukan').addEventListener('pointerdown', () => UI.showZukan(zukanSet()));
UI.$('btn-emote').addEventListener('pointerdown', () => {
  UI.showEmoteList(ownedKiras(), k => { if (scene && scene.playEmote) scene.playEmote(k); });
});
UI.$('btn-mute').addEventListener('pointerdown', () => {
  const m = AudioMan.toggleMute();
  UI.$('btn-mute').textContent = m ? '🔇' : '🔊';
});
UI.$('btn-ending-back').addEventListener('pointerdown', () => {
  save.floor = 6; persist();
  setScene(mansionScene({ banner: 'カードあつめの　つづきだ！' }));
});
UI.$('btn-ending-reset').addEventListener('pointerdown', () => {
  newGame();
});

// 最初のタッチで音を解禁(iOS対策)+タイトルBGM開始
document.addEventListener('pointerdown', function first() {
  AudioMan.unlock();
  if (scene && UI.$('scr-title') && !UI.$('scr-title').classList.contains('hidden')) {
    AudioMan.bgm('title', { volume: 0.45 });
  }
  document.removeEventListener('pointerdown', first);
});

loadSave();
loadImages().then(() => {
  setScene(titleScene());
});
requestAnimationFrame(loop);

})();
