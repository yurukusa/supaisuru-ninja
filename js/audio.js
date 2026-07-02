// 音管理。SFXはWebAudio（低遅延・多重再生）、BGMはHTMLAudio（ループ・m4aでiOS対応）。
// iOSは最初のタッチまで音が出せないので、unlock()を最初の操作で必ず呼ぶ。
'use strict';

const AudioMan = (() => {
  let ctx = null;
  const buffers = {};
  let muted = false;
  let bgmEl = null;
  let bgmName = null;
  let unlocked = false;

  const SFX = ['hit', 'impact', 'shuriken', 'slash', 'victory', 'wrong', 'button', 'chest-open', 'bonus', 'magic', 'whoosh', 'menu'];

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    SFX.forEach(name => {
      fetch(`assets/sfx/${name}.wav`)
        .then(r => r.arrayBuffer())
        .then(ab => ctx.decodeAudioData(ab))
        .then(buf => { buffers[name] = buf; })
        .catch(() => {}); // 音が読めなくてもゲームは止めない
    });
  }

  function play(name, { volume = 1, rate = 1 } = {}) {
    if (muted || !ctx || !buffers[name]) return;
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buffers[name];
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  function bgm(name, { rate = 1, volume = 0.5 } = {}) {
    if (bgmName === name && bgmEl && !bgmEl.paused) return;
    stopBgm();
    bgmName = name;
    if (muted) return; // ミュート解除時にbgmNameから再開する
    bgmEl = new Audio(`assets/bgm/${name}.m4a`);
    bgmEl.loop = true;
    bgmEl.volume = volume;
    bgmEl.playbackRate = rate;
    bgmEl.play().catch(() => {});
  }

  function stopBgm() {
    if (bgmEl) { bgmEl.pause(); bgmEl.src = ''; bgmEl = null; }
    bgmName = null;
  }

  function toggleMute() {
    muted = !muted;
    if (muted) {
      if (bgmEl) bgmEl.pause();
    } else {
      if (bgmEl) bgmEl.play().catch(() => {});
      else if (bgmName) { const n = bgmName; bgmName = null; bgm(n); }
    }
    return muted;
  }

  return { unlock, play, bgm, stopBgm, toggleMute, get muted() { return muted; } };
})();
