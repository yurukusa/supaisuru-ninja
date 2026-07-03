// DOMオーバーレイUI層。ゲーム進行はgame.js、ここは見た目と入力の受け渡しだけ。
'use strict';

const UI = (() => {
  const $ = id => document.getElementById(id);
  const screens = ['scr-title', 'scr-quiz', 'scr-card', 'scr-stamp', 'scr-zukan', 'scr-story', 'scr-lose', 'scr-ending', 'scr-emote'];

  function show(id) { $(id).classList.remove('hidden'); }
  function hide(id) { $(id).classList.add('hidden'); }
  function hideAllScreens() { screens.forEach(hide); }

  // ---------- バナー（画面中央のでか文字） ----------
  let bannerTimer = null;
  function banner(text, ms = 1400) {
    const el = $('banner');
    el.textContent = text;
    el.classList.remove('hidden', 'out');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.classList.add('hidden'), 320);
    }, ms);
  }

  // ---------- タップの星エフェクト ----------
  function tapFx(x, y, emoji = '✨') {
    const el = document.createElement('div');
    el.textContent = emoji;
    el.style.cssText = `position:fixed;left:${x - 16}px;top:${y - 16}px;font-size:32px;z-index:70;pointer-events:none;transition:all .6s ease-out;`;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.transform = `translateY(-70px) scale(1.6) rotate(${(Math.random() - 0.5) * 90}deg)`;
      el.style.opacity = '0';
    });
    setTimeout(() => el.remove(), 650);
  }

  // ---------- HUD ----------
  function showHud(floor, streak, need, hasEmotes) {
    show('hud');
    $('hud-floor').textContent = floor === 'basement' ? 'ちか' : `${floor}かい`;
    const s = $('hud-streak');
    s.innerHTML = '';
    for (let i = 0; i < need; i++) {
      const sp = document.createElement('span');
      sp.textContent = '🔥';
      if (i >= streak) sp.className = 'off';
      s.appendChild(sp);
    }
    $('btn-emote').classList.toggle('hidden', !hasEmotes);
  }
  function hideHud() { hide('hud'); }

  // ---------- クイズ ----------
  // onAnswer(正解したか)を呼ぶ。ボタンは連打防止のため即無効化。
  function showQuiz(quiz, onAnswer) {
    show('scr-quiz');
    hide('quiz-feedback');
    $('quiz-q').textContent = quiz.text;
    const box = $('quiz-answers');
    box.innerHTML = '';
    let answered = false;
    quiz.choices.forEach(choice => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ans-btn';
      b.textContent = choice;
      b.addEventListener('pointerdown', () => {
        if (answered) return;
        answered = true;
        const ok = choice === quiz.answer;
        b.classList.add(ok ? 'correct' : 'wrong');
        if (!ok) {
          // 正解も光らせて「こたえはこれだよ」を見せる
          [...box.children].forEach(c => { if (Number(c.textContent) === quiz.answer) c.classList.add('correct'); });
        }
        const fb = $('quiz-feedback');
        fb.textContent = ok ? '🎯 せいかい！！' : '💦 ざんねん！';
        show('quiz-feedback');
        setTimeout(() => { hide('scr-quiz'); onAnswer(ok); }, ok ? 900 : 1500);
      });
      box.appendChild(b);
    });
  }
  function hideQuiz() { hide('scr-quiz'); }

  // ---------- カード入手演出 ----------
  function showCardGet(card, onDone) {
    show('scr-card');
    $('card-get-label').textContent = card.kira ? '✨キラカードget！！✨' : 'にんじゃカードget！';
    const obj = $('card-obj');
    obj.classList.toggle('kira', !!card.kira);
    // アニメを最初から再生し直す
    obj.style.animation = 'none';
    void obj.offsetWidth;
    obj.style.animation = '';
    obj.style.setProperty('--card-c1', card.c1 || '#fff6d8');
    obj.style.setProperty('--card-c2', card.c2 || '#ffe9c0');
    obj.style.setProperty('--card-border', card.kira ? '#ffd700' : (card.border || '#8d4a12'));
    obj.querySelector('.card-emoji').textContent = card.emoji;
    obj.querySelector('.card-name').textContent = card.name;
    obj.querySelector('.card-type').textContent = card.kira ? 'キラ★エモートつき' : 'わざカード';
    const okBtn = $('card-ok');
    const handler = () => { okBtn.removeEventListener('pointerdown', handler); hide('scr-card'); onDone(); };
    okBtn.addEventListener('pointerdown', handler);
  }

  // ---------- スタンプラリー ----------
  // stamps: [bool x6]。justCleared(0始まり)の丸が青く光り、そこへスタンプをドラッグさせる。
  function showStampRally(stamps, justCleared, onDone) {
    show('scr-stamp');
    hide('stamp-ok');
    show('stamp-hint');
    const sheet = $('stamp-sheet');
    sheet.innerHTML = '';
    const circles = [];
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('div');
      c.className = 'stamp-circle';
      c.textContent = i + 1;
      c.dataset.stamp = '忍';
      if (stamps[i]) c.classList.add('done');
      if (i === justCleared) { c.classList.remove('done'); c.classList.add('ready'); }
      sheet.appendChild(c);
      circles.push(c);
    }
    const tool = $('stamp-tool');
    const target = circles[justCleared];
    let dragging = false;

    function onMove(e) {
      if (!dragging) return;
      tool.style.left = (e.clientX - 44) + 'px';
      tool.style.top = (e.clientY - 44) + 'px';
    }
    function onUp(e) {
      if (!dragging) return;
      dragging = false;
      tool.classList.remove('dragging');
      tool.style.left = tool.style.top = '';
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const r = target.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const d = Math.hypot(e.clientX - cx, e.clientY - cy);
      if (d < r.width * 0.9) {
        // 命中：スタンプを押す
        tool.removeEventListener('pointerdown', onDown);
        target.classList.remove('ready');
        target.classList.add('done', 'pressed-now');
        AudioMan.play('impact', { volume: 0.9 });
        banner('できましたね！', 1600);
        hide('stamp-hint');
        for (let i = 0; i < 10; i++) {
          setTimeout(() => tapFx(cx + (Math.random() - 0.5) * 120, cy + (Math.random() - 0.5) * 120, ['🎉', '⭐', '✨'][i % 3]), i * 70);
        }
        const okBtn = $('stamp-ok');
        show('stamp-ok');
        const h = () => { okBtn.removeEventListener('pointerdown', h); hide('scr-stamp'); onDone(); };
        okBtn.addEventListener('pointerdown', h);
      }
    }
    function onDown(e) {
      dragging = true;
      tool.classList.add('dragging');
      onMove(e);
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    }
    tool.addEventListener('pointerdown', onDown);
  }

  // ---------- 図鑑 ----------
  function showZukan(ownedSet, onClose) {
    show('scr-zukan');
    const total = DATA.CARDS.length;
    const owned = DATA.CARDS.filter(c => ownedSet.has(c.id)).length;
    $('zukan-count').textContent = `あつめたカード ${owned}／${total}`;
    const grid = $('zukan-grid');
    grid.innerHTML = '';
    // キラを先頭に
    const sorted = [...DATA.CARDS].sort((a, b) => (b.kira ? 1 : 0) - (a.kira ? 1 : 0));
    sorted.forEach(card => {
      const has = ownedSet.has(card.id);
      const d = document.createElement('div');
      d.className = 'zukan-card' + (card.kira ? ' kira' : '') + (has ? '' : ' locked');
      d.innerHTML = `<div class="ze">${has ? card.emoji : '❓'}</div><div class="zn">${has ? card.name : '？？？'}</div>`;
      grid.appendChild(d);
    });
    const btn = $('zukan-close');
    const h = () => { btn.removeEventListener('pointerdown', h); hide('scr-zukan'); onClose && onClose(); };
    btn.addEventListener('pointerdown', h);
  }

  // ---------- おはなし ----------
  function showStory(lines, onDone) {
    show('scr-story');
    let i = 0;
    const textEl = $('story-text');
    const box = $('story-box');
    textEl.textContent = lines[0];
    function next() {
      i++;
      AudioMan.play('button', { volume: 0.5 });
      if (i >= lines.length) {
        box.removeEventListener('pointerdown', next);
        hide('scr-story');
        onDone();
      } else {
        textEl.textContent = lines[i];
      }
    }
    box.addEventListener('pointerdown', next);
  }

  // ---------- ボス戦HUD ----------
  // techs: [{id, emoji, name, kira, hammer}]。onSelect(tech)で武器切替。
  function showBossHud(bossName, techs, onSelect) {
    show('boss-hud');
    $('boss-name').textContent = bossName;
    const bar = $('tech-bar');
    bar.innerHTML = '';
    techs.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tech-btn' + (t.kira ? ' kira' : '');
      b.dataset.tid = t.uid;
      b.innerHTML = `<div class="te">${t.emoji}</div><div class="tn">${t.name}</div>`;
      b.addEventListener('pointerdown', e => { e.stopPropagation(); onSelect(t); });
      bar.appendChild(b);
    });
  }
  function setActiveTech(uid) {
    document.querySelectorAll('.tech-btn').forEach(b => b.classList.toggle('active', b.dataset.tid === uid));
  }
  function removeTech(uid) {
    const b = document.querySelector(`.tech-btn[data-tid="${uid}"]`);
    if (b) b.remove();
  }
  function hideBossHud() { hide('boss-hud'); hideTechTimer(); }

  function showTechTimer(label) { show('tech-timer'); $('tech-timer-label').textContent = label; }
  function updateTechTimer(ratio) { $('tech-timer-fill').style.width = Math.max(0, ratio * 100) + '%'; }
  function hideTechTimer() { hide('tech-timer'); }

  function updateBossHp(ratio) { $('boss-hp-fill').style.width = Math.max(0, ratio * 100) + '%'; }

  function updateHearts(left, max) {
    const el = $('hearts');
    if (el.childElementCount !== max) {
      el.innerHTML = '';
      for (let i = 0; i < max; i++) { const s = document.createElement('span'); s.textContent = '❤️'; el.appendChild(s); }
    }
    [...el.children].forEach((s, i) => {
      const lost = i >= left;
      if (lost && !s.classList.contains('lost')) { s.classList.add('lost'); s.classList.add('just-lost'); setTimeout(() => s.classList.remove('just-lost'), 550); }
      if (!lost) s.classList.remove('lost');
    });
  }

  // ---------- スクリーンクス戦のキラ技バー ----------
  function showKiraBar(kiras, onUse) {
    show('kira-bar');
    const bar = $('kira-bar');
    bar.innerHTML = '';
    kiras.forEach(k => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'kira-tech';
      b.innerHTML = `<div class="ke">${k.emoji}</div><div class="kn">${k.name}</div><div class="cd" style="transform:scaleY(0)"></div>`;
      let coolUntil = 0;
      b.addEventListener('pointerdown', e => {
        const now = performance.now();
        if (now < coolUntil) return;
        coolUntil = now + 1100;
        const cd = b.querySelector('.cd');
        cd.style.transition = 'none';
        cd.style.transform = 'scaleY(1)';
        requestAnimationFrame(() => {
          cd.style.transition = 'transform 1.1s linear';
          cd.style.transform = 'scaleY(0)';
        });
        onUse(k, e);
      });
      bar.appendChild(b);
    });
  }
  function hideKiraBar() { hide('kira-bar'); }

  // ---------- ボス戦コーチ(初回のみ) ----------
  function showCoach(hasCards, onDone) {
    show('scr-coach');
    document.body.classList.add('coaching');
    $('coach-cards').style.display = hasCards ? '' : 'none';
    $('coach-hand').style.display = hasCards ? '' : 'none';
    const btn = $('coach-ok');
    const h = () => {
      btn.removeEventListener('pointerdown', h);
      hide('scr-coach');
      document.body.classList.remove('coaching');
      onDone();
    };
    btn.addEventListener('pointerdown', h);
  }

  // ---------- エモート選択 ----------
  function showEmoteList(kiras, onPick, onClose) {
    show('scr-emote');
    const list = $('emote-list');
    list.innerHTML = '';
    kiras.forEach(k => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emote-btn';
      b.textContent = `${k.emoteEmoji} ${k.emote}`;
      b.addEventListener('pointerdown', () => { hide('scr-emote'); onPick(k); });
      list.appendChild(b);
    });
    const btn = $('emote-close');
    const h = () => { btn.removeEventListener('pointerdown', h); hide('scr-emote'); onClose && onClose(); };
    btn.addEventListener('pointerdown', h);
  }

  return {
    $, show, hide, hideAllScreens, banner, tapFx,
    showHud, hideHud,
    showQuiz, hideQuiz,
    showCardGet, showStampRally, showZukan, showStory,
    showBossHud, hideBossHud, setActiveTech, removeTech, showCoach,
    showTechTimer, updateTechTimer, hideTechTimer,
    updateBossHp, updateHearts,
    showKiraBar, hideKiraBar,
    showEmoteList,
  };
})();
