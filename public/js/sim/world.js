// Temple layout, in meters.
// Plan view: x grows to the east, y grows to the south. In 3D, plan (x, y) maps to (x, z).
// The temple faces south. Visitors arrive from the street (bottom), enter through the
// Dragon Gate (visitor's right), walk one loop, and leave through the Tiger Gate (left).
//
//   y=0   ┌──────────── rear hall 後殿 (flow: east → west) ────────────┐
//         │ [光明燈]            [觀音]                     [光明燈]     │
//   y=6.2 └─west opening ↓──── divider wall ──────── east opening ↑────┘
//         │  [月老]             [媽祖]               [文昌]            │  main hall 正殿
//   y=15.4├─────────────────────────────────────────────────────────────┤
//         │ [求籤]             (天公爐)                                │  courtyard 中庭
//         │ [金爐]                                                      │
//   y=27.4└──[虎門 ↓]─────────[中門 closed]──────────[龍門 ↑]──────────┘  front hall 三川殿
//                              plaza 廟埕            [服務台]
//   y=41  street: arrive bottom-right, leave bottom-left

export const WORLD = { w: 32, h: 41 };
export const AGENT_RADIUS = 0.26;

export const NORTH = -Math.PI / 2;
export const SOUTH = Math.PI / 2;
export const EAST = 0;
export const WEST = Math.PI;

const box = (id, x0, y0, x1, y1, h, kind, extra = {}) => ({ id, x0, y0, x1, y1, h, kind, ...extra });
const disc = (id, x, y, r, h, kind, extra = {}) => ({ id, x, y, r, h, kind, ...extra });

// Axis-aligned solid boxes (block movement).
export const SOLIDS = [
  // Temple shell.
  box('wallNorth', 3.5, 0.0, 28.5, 0.6, 5.6, 'wall'),
  box('wallWest', 3.5, 0.6, 4.0, 27.4, 4.2, 'wall'),
  box('wallEast', 28.0, 0.6, 28.5, 27.4, 4.2, 'wall'),
  box('divider', 7.2, 6.2, 24.8, 6.7, 4.6, 'wall'),
  // Front hall (三川殿): three blocks; the gaps between them are the gates.
  box('frontWest', 3.5, 27.4, 6.8, 30.4, 4.0, 'front'),
  box('frontCenter', 9.8, 27.4, 22.2, 30.4, 4.0, 'front'),
  box('frontEast', 25.2, 27.4, 28.5, 30.4, 4.0, 'front'),
  // Plaza boundary.
  box('plazaWallWest', 0.6, 30.0, 1.0, 40.2, 0.9, 'lowWall'),
  box('plazaWallEast', 31.0, 30.0, 31.4, 40.2, 0.9, 'lowWall'),
  box('plazaLinkWest', 1.0, 30.0, 3.5, 30.4, 1.2, 'lowWall'),
  box('plazaLinkEast', 28.5, 30.0, 31.0, 30.4, 1.2, 'lowWall'),
  // Furniture.
  box('altarRear', 14.0, 0.6, 18.0, 1.7, 1.0, 'altar', { deity: 'guanyin' }),
  box('altarMain', 14.0, 6.7, 18.0, 7.9, 1.0, 'altar', { deity: 'mazu' }),
  box('altarDragon', 20.6, 6.7, 23.2, 7.7, 1.0, 'altar', { deity: 'wenchang' }),
  box('altarTiger', 8.8, 6.7, 11.4, 7.7, 1.0, 'altar', { deity: 'yuelao' }),
  box('lampWallWest', 5.0, 0.6, 12.2, 1.1, 3.0, 'lampWall'),
  box('lampWallEast', 19.8, 0.6, 27.0, 1.1, 3.0, 'lampWall'),
  box('lotsTable', 4.3, 16.9, 5.7, 18.5, 0.9, 'lotsTable'),
  box('furnace', 5.2, 21.1, 7.0, 22.9, 3.2, 'furnace'),
  box('desk', 27.6, 32.4, 29.2, 35.4, 1.05, 'desk'),
];

// Round solids.
export const CIRCLES = [
  disc('tiangong', 16.0, 20.4, 1.05, 1.9, 'tiangong'),
  // Main hall front: lacquered outer pillars carry the couplet, the inner pair are carved dragon pillars.
  disc('pillarW2', 4.9, 15.0, 0.32, 6.0, 'pillar', { couplet: 1 }),
  // Collision radius covers the coiled dragon, not just the column.
  disc('pillarW1', 10.6, 15.1, 0.42, 6.0, 'pillar', { dragon: true }),
  disc('pillarE1', 21.4, 15.1, 0.42, 6.0, 'pillar', { dragon: true }),
  disc('pillarE2', 27.1, 15.0, 0.32, 6.0, 'pillar', { couplet: 0 }),
  // Front porch of the 三川殿: dragon pillars flank the closed centre door.
  disc('porchW', 11.2, 31.05, 0.26, 4.0, 'porchPillar'),
  disc('porchDW', 14.2, 31.05, 0.4, 4.0, 'porchPillar', { dragon: true }),
  disc('porchDE', 17.8, 31.05, 0.4, 4.0, 'porchPillar', { dragon: true }),
  disc('porchE', 20.8, 31.05, 0.26, 4.0, 'porchPillar'),
  // Drum stones (抱鼓石) on both sides of each open gate.
  disc('drumStoneTW', 6.55, 30.62, 0.22, 0.8, 'drumStone'),
  disc('drumStoneTE', 10.05, 30.62, 0.22, 0.8, 'drumStone'),
  disc('drumStoneDW', 21.95, 30.62, 0.22, 0.8, 'drumStone'),
  disc('drumStoneDE', 25.45, 30.62, 0.22, 0.8, 'drumStone'),
  // Posts of the small canopy over the service desk.
  disc('deskPostNW', 27.35, 32.2, 0.09, 2.6, 'post'),
  disc('deskPostNE', 29.45, 32.2, 0.09, 2.6, 'post'),
  disc('deskPostSW', 27.35, 35.6, 0.09, 2.6, 'post'),
  disc('deskPostSE', 29.45, 35.6, 0.09, 2.6, 'post'),
  // Potted plants along the courtyard walls, away from the walking lines.
  disc('potE1', 27.35, 18.2, 0.36, 1.4, 'pot'),
  disc('potE2', 27.35, 21.0, 0.36, 1.4, 'pot'),
  disc('potE3', 27.35, 23.8, 0.36, 1.4, 'pot'),
  disc('potW1', 4.65, 25.6, 0.36, 1.4, 'pot'),
  disc('bell', 27.0, 13.6, 0.55, 2.3, 'bell'),
  disc('drum', 5.0, 13.6, 0.55, 1.7, 'drum'),
  disc('lionWest', 12.4, 31.8, 0.55, 1.3, 'lion'),
  disc('lionEast', 19.6, 31.8, 0.55, 1.3, 'lion'),
  disc('banyan', 3.0, 35.6, 0.55, 6.5, 'tree'),
  disc('plantWest', 1.9, 31.2, 0.4, 1.0, 'plant'),
  disc('plantEast', 30.1, 31.2, 0.4, 1.0, 'plant'),
];

// Named regions, used for floors, ceilings (camera) and labels.
export const AREAS = {
  rearHall: { x0: 4.0, y0: 0.6, x1: 28.0, y1: 6.2, ceiling: 5.4 },
  mainHall: { x0: 4.0, y0: 6.7, x1: 28.0, y1: 15.4, ceiling: 6.2 },
  courtyard: { x0: 4.0, y0: 15.4, x1: 28.0, y1: 27.4, ceiling: 30 },
  gates: { x0: 3.5, y0: 27.4, x1: 28.5, y1: 30.4, ceiling: 3.3 },
  plaza: { x0: 1.0, y0: 30.4, x1: 31.0, y1: 41.0, ceiling: 30 },
};

export const GATES = {
  tiger: { x0: 6.8, x1: 9.8, y0: 27.4, y1: 30.4, label: '虎門' },
  center: { x0: 14.5, x1: 17.5, y0: 27.4, y1: 30.4, label: '中門' },
  dragon: { x0: 22.2, x1: 25.2, y0: 27.4, y1: 30.4, label: '龍門' },
};

// One-way circulation. Moving against `dir` inside a zone costs `k` extra per meter.
export const ZONES = [
  { id: 'dragonGate', x0: 22.2, y0: 27.0, x1: 25.2, y1: 30.8, dx: 0, dy: -1, k: 14, strict: true },
  { id: 'tigerGate', x0: 6.8, y0: 27.0, x1: 9.8, y1: 30.8, dx: 0, dy: 1, k: 14, strict: true },
  { id: 'eastOpening', x0: 24.8, y0: 5.6, x1: 28.0, y1: 7.3, dx: 0, dy: -1, k: 14, strict: true },
  { id: 'westOpening', x0: 4.0, y0: 5.6, x1: 7.2, y1: 7.3, dx: 0, dy: 1, k: 14, strict: true },
  { id: 'rearHall', x0: 4.0, y0: 0.6, x1: 28.0, y1: 5.6, dx: -1, dy: 0, k: 5, strict: false },
  { id: 'courtEast', x0: 21.0, y0: 15.4, x1: 28.0, y1: 27.0, dx: 0, dy: -1, k: 1.5, strict: false },
  { id: 'courtWest', x0: 4.0, y0: 15.4, x1: 11.0, y1: 27.0, dx: 0, dy: 1, k: 1.5, strict: false },
  { id: 'plazaEast', x0: 17.0, y0: 30.8, x1: 31.0, y1: 41.0, dx: 0, dy: -1, k: 1.5, strict: false },
  { id: 'plazaWest', x0: 1.0, y0: 30.8, x1: 15.0, y1: 41.0, dx: 0, dy: 1, k: 1.5, strict: false },
];

// Areas in front of altars that people should not walk through (between deity and worshippers).
export const SACRED = [
  { x0: 14.0, y0: 7.9, x1: 18.0, y1: 8.75 },
  { x0: 20.6, y0: 7.7, x1: 23.2, y1: 8.55 },
  { x0: 8.8, y0: 7.7, x1: 11.4, y1: 8.55 },
  { x0: 14.0, y0: 1.7, x1: 18.0, y1: 2.45 },
  { x0: 5.0, y0: 1.1, x1: 12.2, y1: 1.85 },
];

// Points that keep the loop direction when someone skips a station.
export const REAR_LANE = { x: 16.0, y: 5.15 };

export const SPAWN = { x0: 25.6, x1: 28.4, y: 40.35 };
export const EXIT = { x: 5.4, y: 40.5, r: 1.4 };
export const PLAYER_SPAWN = { x: 22.6, y: 38.6, face: NORTH };

// ---------------------------------------------------------------------------
// Stations: where people stop. Each has worship slots (one person each) and a
// queue (a line of standing spots). People step into a slot from behind
// (approach point) and step out on the downstream side (exit point), so the
// flow through a row of cushions is always one-directional.

function rowSlots(xs, y, face, backY, flow) {
  return xs.map((x) => ({ x, y, face, ax: x - 0.5 * flow, ay: backY, ex: x + 0.5 * flow, ey: backY }));
}

function colSlots(ys, x, face, backX, flow) {
  return ys.map((y) => ({ x, y, face, ax: backX, ay: y - 0.5 * flow, ex: backX, ey: y + 0.5 * flow }));
}

function line(x, y, dx, dy, count, gap = 0.85) {
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const pts = [];
  for (let i = 0; i < count; i++) pts.push({ x: x + ux * gap * i, y: y + uy * gap * i });
  return pts;
}

// Give every queue spot a facing: toward the spot in front, the head toward the focus.
function faceQueue(points, focus) {
  return points.map((p, i) => {
    const ahead = i === 0 ? focus : points[i - 1];
    return { x: p.x, y: p.y, face: Math.atan2(ahead.y - p.y, ahead.x - p.x) };
  });
}

function station(def) {
  return { ...def, queue: faceQueue(def.queue, def.queueFocus ?? def.focus) };
}

export const STATIONS = [
  station({
    id: 'desk', kind: 'desk', name: '服務台', title: '服務台・請香',
    focus: { x: 28.4, y: 33.9 },
    slots: colSlots([33.0, 33.9, 34.8], 26.7, EAST, 25.6, -1),
    queue: line(25.3, 36.0, 0, 1, 5),
    queueFocus: { x: 26.0, y: 34.6 },
    hotspot: { x0: 25.8, y0: 32.0, x1: 29.6, y1: 35.8 },
  }),
  station({
    id: 'tiangong', kind: 'burner', name: '天公爐', title: '天公爐・拜天公',
    focus: { x: 16.0, y: 20.4 },
    slots: rowSlots([14.6, 15.55, 16.45, 17.4], 22.2, NORTH, 23.4, -1),
    queue: line(18.7, 23.6, 1, 0, 8),
    queueFocus: { x: 17.6, y: 23.2 },
    hotspot: { x0: 14.4, y0: 18.8, x1: 17.6, y1: 22.6 },
  }),
  station({
    id: 'main', kind: 'altar', name: '天上聖母', title: '正殿・天上聖母', deity: 'mazu',
    focus: { x: 16.0, y: 7.3 },
    slots: rowSlots([14.5, 15.5, 16.5, 17.5], 9.2, NORTH, 10.4, 1),
    queue: line(13.3, 10.9, 0, 1, 10),
    queueFocus: { x: 14.0, y: 10.3 },
    hotspot: { x0: 13.6, y0: 6.2, x1: 18.4, y1: 8.6 },
  }),
  station({
    id: 'dragon', kind: 'altar', name: '文昌帝君', title: '龍邊・文昌帝君', deity: 'wenchang',
    focus: { x: 21.9, y: 7.2 },
    slots: rowSlots([21.0, 21.9, 22.8], 9.0, NORTH, 10.2, 1),
    queue: line(20.0, 11.2, 0, 1, 5),
    queueFocus: { x: 20.6, y: 10.2 },
    hotspot: { x0: 20.2, y0: 6.2, x1: 23.6, y1: 8.4 },
  }),
  station({
    id: 'rear', kind: 'altar', name: '觀世音菩薩', title: '後殿・觀世音菩薩', deity: 'guanyin',
    focus: { x: 16.0, y: 1.2 },
    slots: rowSlots([14.5, 15.5, 16.5, 17.5], 2.9, NORTH, 4.1, -1),
    queue: line(18.8, 4.3, 1, 0, 7),
    queueFocus: { x: 18.0, y: 4.1 },
    hotspot: { x0: 13.6, y0: 0.6, x1: 18.4, y1: 2.2 },
  }),
  station({
    id: 'lamps', kind: 'lamps', name: '光明燈', title: '後殿・點光明燈',
    focus: { x: 8.6, y: 0.85 },
    slots: rowSlots([6.6, 8.2, 9.8], 2.3, NORTH, 3.5, -1),
    queue: line(11.2, 3.7, 1, 0, 3),
    queueFocus: { x: 10.3, y: 3.5 },
    hotspot: { x0: 5.0, y0: 0.6, x1: 12.2, y1: 1.8 },
  }),
  station({
    id: 'tiger', kind: 'altar', name: '月下老人', title: '虎邊・月下老人', deity: 'yuelao',
    focus: { x: 10.1, y: 7.2 },
    slots: rowSlots([9.2, 10.1, 11.0], 9.0, NORTH, 10.2, 1),
    queue: [
      { x: 7.9, y: 10.3 }, { x: 7.41, y: 9.6 }, { x: 6.93, y: 8.9 }, { x: 6.44, y: 8.21 }, { x: 5.96, y: 7.51 },
    ],
    queueFocus: { x: 8.75, y: 10.2 },
    hotspot: { x0: 8.4, y0: 6.2, x1: 11.8, y1: 8.4 },
  }),
  station({
    id: 'lots', kind: 'lots', name: '求籤處', title: '求籤處・擲筊求籤',
    focus: { x: 5.0, y: 17.7 },
    slots: colSlots([17.25, 18.15], 6.6, WEST, 7.8, 1),
    queue: line(8.2, 16.1, 0, -1, 4),
    queueFocus: { x: 7.8, y: 16.75 },
    hotspot: { x0: 4.0, y0: 16.5, x1: 6.2, y1: 18.9 },
  }),
  station({
    id: 'furnace', kind: 'furnace', name: '金爐', title: '金爐・化金紙',
    focus: { x: 6.1, y: 22.0 },
    slots: colSlots([21.55, 22.45], 7.9, WEST, 9.1, 1),
    queue: line(9.5, 20.4, 0, -1, 4),
    queueFocus: { x: 9.1, y: 21.05 },
    hotspot: { x0: 4.8, y0: 20.7, x1: 7.4, y1: 23.3 },
  }),
];

export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]));

// The traditional order of the loop (exit is a pseudo-station at the street).
export const ROUTE = ['desk', 'tiangong', 'main', 'dragon', 'rear', 'lamps', 'tiger', 'lots', 'furnace', 'exit'];

export function routeIndex(id) {
  return ROUTE.indexOf(id);
}

// Extra waypoints so a visitor who skips the rear hall still walks the loop
// instead of cutting across the main hall against the flow.
export function viaPoints(fromId, toId) {
  const from = routeIndex(fromId);
  const to = routeIndex(toId);
  const rear = routeIndex('rear');
  const dragon = routeIndex('dragon');
  if (from >= routeIndex('main') && from <= dragon && to > rear) return [REAR_LANE];
  return [];
}

export function pointInRect(x, y, r) {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

export function areaAt(x, y) {
  for (const [name, r] of Object.entries(AREAS)) if (pointInRect(x, y, r)) return name;
  return 'plaza';
}

export function stationAtPoint(x, y) {
  for (const s of STATIONS) if (pointInRect(x, y, s.hotspot)) return s;
  return null;
}
