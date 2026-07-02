// スパイスルニンジャゲーム データ定義
// カードは「属性19種×かたち5種=ノーマル95枚」+「キラ5枚」=ちょうど100枚。
// 原案の「全部で100個くらいある」を正確に満たすための構成。
'use strict';

const DATA = (() => {

  // 属性: [よみ, 絵文字, カード地色1, 地色2, ふち色]
  const ELEMENTS = [
    ['ほのお', '🔥', '#ffe0b2', '#ffab91', '#bf360c'],
    ['みず',   '💧', '#e1f5fe', '#81d4fa', '#01579b'],
    ['かみなり','⚡', '#fffde7', '#fff176', '#f57f17'],
    ['かぜ',   '🌪️', '#e8f5e9', '#a5d6a7', '#1b5e20'],
    ['つち',   '🪨', '#efebe9', '#bcaaa4', '#4e342e'],
    ['こおり', '🧊', '#e0f7fa', '#80deea', '#006064'],
    ['ひかり', '✨', '#fffef0', '#ffe57f', '#b8860b'],
    ['かげ',   '🌑', '#d1c4e9', '#9575cd', '#311b92'],
    ['ほし',   '⭐', '#fff8e1', '#ffd54f', '#ff6f00'],
    ['つき',   '🌙', '#e8eaf6', '#9fa8da', '#1a237e'],
    ['にじ',   '🌈', '#fce4ec', '#f8bbd0', '#880e4f'],
    ['はな',   '🌸', '#fce4ec', '#f48fb1', '#ad1457'],
    ['けむり', '💨', '#eceff1', '#b0bec5', '#37474f'],
    ['かえる', '🐸', '#f1f8e9', '#aed581', '#33691e'],
    ['へび',   '🐍', '#e0f2f1', '#80cbc4', '#004d40'],
    ['たか',   '🦅', '#efebe9', '#a1887f', '#3e2723'],
    ['おに',   '👹', '#ffebee', '#ef9a9a', '#b71c1c'],
    ['りゅう', '🐉', '#e8f5e9', '#81c784', '#2e7d32'],
    ['ゆき',   '⛄', '#f5fcff', '#b3e5fc', '#0277bd'],
  ];

  // かたち: 技名のうしろ半分
  const FORMS = ['しゅりけんのじゅつ', 'ぶんしんのじゅつ', 'だまのじゅつ', 'ぎりのじゅつ', 'まきもののじゅつ'];

  // ノーマルカード95枚を生成
  const CARDS = [];
  ELEMENTS.forEach(([name, emoji, c1, c2, border], ei) => {
    FORMS.forEach((form, fi) => {
      CARDS.push({
        id: 'n' + (ei * FORMS.length + fi),
        kira: false,
        name: name + form,
        emoji,
        c1, c2, border,
      });
    });
  });

  // キラカード5枚（ボス撃破ごとに1枚）。それぞれエモート付き。
  const KIRA_CARDS = [
    { id: 'k0', kira: true, emoji: '👁️', name: 'めだまビームのじゅつ',   emote: 'めだまダンス',   emoteEmoji: '👀', fx: '#b388ff' },
    { id: 'k1', kira: true, emoji: '🌊', name: 'うずしおスペシャル',     emote: 'なみのりポーズ', emoteEmoji: '🏄', fx: '#40c4ff' },
    { id: 'k2', kira: true, emoji: '🥁', name: 'らいじんドラムのじゅつ', emote: 'かみなりダンス', emoteEmoji: '🕺', fx: '#ffea00' },
    { id: 'k3', kira: true, emoji: '👻', name: 'おにびトルネードのじゅつ', emote: 'おばけおどり', emoteEmoji: '👻', fx: '#69f0ae' },
    { id: 'k4', kira: true, emoji: '🐲', name: 'りゅうじんばくはつのじゅつ', emote: 'りゅうのポーズ', emoteEmoji: '🐉', fx: '#ff6e40' },
  ];
  KIRA_CARDS.forEach(k => CARDS.push(k));

  const cardById = id => CARDS.find(c => c.id === id);

  // ボス5体。spriteはassets/monsters/の64x64ドット絵。
  const BOSSES = [
    { name: 'ひとつめこぞう',     sprite: 'cyclope',      scale: 3.4, tint: '#7c4dff' },
    { name: 'ぬまタコにゅうどう', sprite: 'greenoctopus', scale: 3.4, tint: '#00c853' },
    { name: 'オニグマだいおう',   sprite: 'bear',         scale: 3.8, tint: '#ff6d00' },
    { name: 'ほのおおばけ',       sprite: 'flam',         scale: 3.6, tint: '#ff1744' },
    { name: 'じごくドラゴン',     sprite: 'dragon',       scale: 4.2, tint: '#d500f9' },
  ];

  // 算数クイズ生成。かい（階）が上がるほどすこしだけ難しくなる。
  // 原案の例は「4+4」「5+5」なので、たし算中心・こたえは20まで。
  function makeQuiz(floor) {
    let a, b, op = '+';
    const r = n => 1 + Math.floor(Math.random() * n);
    if (floor <= 1) {           // 1かい: 1+1〜5+5
      a = r(5); b = r(5);
    } else if (floor === 2) {   // 2かい: こたえ12まで。ぞろ目多め
      if (Math.random() < 0.4) { a = r(6); b = a; }
      else { a = r(6); b = r(6); }
    } else if (floor === 3) {   // 3かい: こたえ18まで
      a = r(9); b = r(9);
    } else if (floor === 4) {   // 4かい: かんたんなひき算もまざる
      if (Math.random() < 0.35) { op = '-'; a = 2 + r(8); b = r(a - 1); }
      else { a = r(9); b = r(9); }
    } else {                    // 5かい: 10+10まで登場
      if (Math.random() < 0.3) { op = '-'; a = 2 + r(9); b = r(a - 1); }
      else if (Math.random() < 0.35) { a = 10; b = r(10); }
      else { a = r(10); b = r(10); }
    }
    const answer = op === '+' ? a + b : a - b;

    // まちがい選択肢: 近い数字2つ（0以上・重複なし）
    const wrongs = new Set();
    const cand = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 10, Math.max(0, answer - 10)];
    for (const w of cand.sort(() => Math.random() - 0.5)) {
      if (w >= 0 && w !== answer) wrongs.add(w);
      if (wrongs.size >= 2) break;
    }
    const choices = [answer, ...wrongs].sort(() => Math.random() - 0.5);
    return { text: `${a}${op === '+' ? '＋' : '−'}${b}は　な〜んだ？`, answer, choices };
  }

  // おはなし（すべてタップ送り）
  const STORY = {
    intro: [
      'あるひ、にんじゃが　さんぽを　していると……',
      'そらから　でっかい　おやしきが　ふってきた！！',
      'なんだか　じごくみたいで、ふる〜い　おやしきだ。',
      'にんじゃは　ゆうきを　だして、なかに　はいってみることにした！',
    ],
    basement: [
      'キラカードが　5まい　そろった……そのとき！',
      'おやしきの　ちかから　ゴゴゴゴ……と　おとがする。',
      'ちかには　ふういんされた　とびらが　あった。',
      'キラカードが　ひかって、ふういんが　とけていく……！',
      'にんじゃは　うっかり　とびらを　あけてしまった！',
      '『よくも　おこしたな……！　わしは　1しゅうかん　ねるのだ！』',
      'スクリーンクスモンスターが　めを　さましてしまった！！',
      'キラのじゅつだけが　きくぞ！　キラカードで　たたかえ！！',
    ],
    ending: [
      'スクリーンクスモンスターは　ひかりに　つつまれて　きえていった……',
      '『つよい……おまえのほうが　つよかった……』',
      'おやしきに　へいわが　もどった！',
      'にんじゃマスターの　たんじょうだ！！　おめでとう！！',
    ],
  };

  return { ELEMENTS, FORMS, CARDS, KIRA_CARDS, BOSSES, cardById, makeQuiz, STORY };
})();
