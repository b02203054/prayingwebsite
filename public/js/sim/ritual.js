// Ritual data shared by the simulation and the UI.

export const ANIM = {
  idle: 0, walk: 1, pray: 2, kneel: 3, insert: 4, offer: 5,
  throw: 6, draw: 7, burn: 8, lamp: 9, amulet: 10, wave: 11,
};

export const ANIM_NAMES = Object.fromEntries(Object.entries(ANIM).map(([k, v]) => [v, k]));

// Burners that take incense (one stick each).
export const BURNERS = ['tiangong', 'main', 'dragon', 'rear', 'tiger'];
export const INCENSE_PER_VISIT = BURNERS.length;

// What can be done at each kind of station. `needs` is an item the visitor must hold.
export const ACTIONS = {
  desk: [
    { id: 'incense', label: '請香', hint: '每爐一炷，共五炷，附數位金紙', anim: 'offer', dur: 1.6 },
    { id: 'amulet', label: '求平安符', hint: '可帶到天公爐「過爐」', anim: 'offer', dur: 1.6 },
    { id: 'donate', label: '添香油錢', hint: '象徵心意，不會收取任何費用', anim: 'offer', dur: 1.4 },
  ],
  burner: [
    { id: 'pray', label: '拜天公', hint: '稟告姓名、住址與心願（只留在你的裝置）', anim: 'pray', dur: 4.6 },
    { id: 'insert', label: '插香', hint: '插一炷香入爐', anim: 'insert', dur: 1.4, needs: 'incense' },
    { id: 'amuletPass', label: '平安符過爐', hint: '在爐上順時針繞三圈', anim: 'amulet', dur: 3.2, needs: 'amulet' },
  ],
  altar: [
    { id: 'pray', label: '合掌參拜', hint: '三拜，向神明稟告', anim: 'pray', dur: 4.6 },
    { id: 'kneel', label: '跪拜', hint: '跪在拜墊上叩首', anim: 'kneel', dur: 5.4 },
    { id: 'insert', label: '插香', hint: '插一炷香入爐', anim: 'insert', dur: 1.4, needs: 'incense' },
  ],
  lamps: [{ id: 'lamp', label: '點光明燈', hint: '為自己或家人點一盞燈（不記名）', anim: 'lamp', dur: 2.6 }],
  lots: [
    { id: 'throw', label: '擲筊問事', hint: '問一個是非題', anim: 'throw', dur: 1.7 },
    { id: 'draw', label: '求籤', hint: '先擲筊請示，再抽籤、再擲筊確認', anim: 'draw', dur: 2.2 },
  ],
  furnace: [{ id: 'burn', label: '化金紙', hint: '數位金紙，不冒煙也不汙染', anim: 'burn', dur: 3.2, needs: 'paper' }],
};

export function actionDef(kind, actionId) {
  return (ACTIONS[kind] || []).find((a) => a.id === actionId) || null;
}

// Moon blocks (筊杯): one flat + one round side up is 聖筊 (yes).
export const JIAO = { holy: 0, laugh: 1, yin: 2 };
export function throwJiao(rng) {
  const a = rng.next() < 0.5;
  const b = rng.next() < 0.5;
  if (a !== b) return JIAO.holy;
  return a ? JIAO.laugh : JIAO.yin;
}

export const FORTUNE_COUNT = 30;

// NPC behaviour at each station kind: list of [anim, minSeconds, maxSeconds, effect].
export const NPC_SCRIPTS = {
  desk: [['offer', 1.6, 2.6, 'incense']],
  burner: [['pray', 4.0, 6.0], ['insert', 1.2, 1.5, 'insert']],
  altar: [['pray', 3.6, 6.5], ['insert', 1.2, 1.5, 'insert']],
  altarKneel: [['pray', 2.5, 4.0], ['kneel', 4.5, 5.5], ['insert', 1.2, 1.5, 'insert']],
  lamps: [['lamp', 2.2, 3.0, 'lamp']],
  lots: [['pray', 1.4, 2.2], ['throw', 1.6, 1.8, 'jiao'], ['draw', 2.0, 2.6, 'lot'], ['throw', 1.6, 1.8, 'jiao']],
  furnace: [['burn', 3.0, 4.2, 'burn']],
};

// Which stations a simulated visitor includes (the main loop is always walked).
export function npcRoute(rng) {
  const route = [];
  if (rng.chance(0.8)) route.push('desk');
  route.push('tiangong', 'main');
  if (rng.chance(0.75)) route.push('dragon');
  if (rng.chance(0.65)) route.push('rear');
  if (rng.chance(0.25)) route.push('lamps');
  if (rng.chance(0.75)) route.push('tiger');
  if (rng.chance(0.3)) route.push('lots');
  if (rng.chance(0.55)) route.push('furnace');
  route.push('exit');
  return route;
}

// Appearance as small integers; the renderer owns the actual colors.
export const LOOK_SIZES = { skin: 4, hair: 6, style: 6, top: 12, bottom: 6, acc: 5 };
export function randomLook(rng, ageHint) {
  const age = ageHint ?? (rng.chance(0.12) ? 0 : rng.chance(0.25) ? 2 : 1);
  return {
    age,
    skin: rng.int(0, LOOK_SIZES.skin - 1),
    hair: age === 2 ? 5 : rng.int(0, LOOK_SIZES.hair - 2),
    style: rng.int(0, LOOK_SIZES.style - 1),
    top: rng.int(0, LOOK_SIZES.top - 1),
    bottom: rng.int(0, LOOK_SIZES.bottom - 1),
    acc: rng.chance(0.55) ? 0 : rng.int(1, LOOK_SIZES.acc - 1),
  };
}

export function encodeLook(l) {
  return [l.age, l.skin, l.hair, l.style, l.top, l.bottom, l.acc];
}

export function decodeLook(a) {
  return { age: a[0], skin: a[1], hair: a[2], style: a[3], top: a[4], bottom: a[5], acc: a[6] };
}

export function sanitizeLook(a) {
  if (!Array.isArray(a) || a.length !== 7) return null;
  const max = [2, LOOK_SIZES.skin - 1, LOOK_SIZES.hair - 1, LOOK_SIZES.style - 1, LOOK_SIZES.top - 1, LOOK_SIZES.bottom - 1, LOOK_SIZES.acc - 1];
  const out = a.map((v, i) => Math.max(0, Math.min(max[i], Math.floor(Number(v) || 0))));
  return decodeLook(out);
}

export const EMOTES = ['🙏', '❤️', '😊', '🌸', '✨'];
