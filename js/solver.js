// Orcdoku - solver
// Werkt zowel in de browser als in Node (tools/check.mjs).
//
// Spelregels:
//  1. In elke rij en elke kolom staat precies één persoon.
//  2. Niemand staat op een voorwerp dat niet betreedbaar is (catapult, koe, ...).
//  3. Elke aanwijzing klopt.
//  4. De moordenaar is de enige verdachte die alleen met het slachtoffer in een kamer was.

// Elk voorwerp heeft een afbeelding assets/objects/<naam>.png (uitgesneden met tools/slice-objects.ps1).
// De emoji (icon) is reserve, als de afbeelding niet laadt.
export const OBJECTS = {
  // ---- niet betreedbaar ----
  catapult:     { name: "catapult",       icon: "🏹", walkable: false },
  koe:          { name: "koe",            icon: "🐄", walkable: false },
  wapenrek:     { name: "wapenrek",       icon: "⚔️", walkable: false },
  smidsoven:    { name: "smidsoven",      icon: "🔥", walkable: false },
  aambeeld:     { name: "aambeeld",       icon: "⚒️", walkable: false },
  barrel:       { name: "barrel",         icon: "🛢️", walkable: false },
  hooikar:      { name: "hooikar",        icon: "🛒", walkable: false },
  orcbanier:    { name: "orcbanier",      icon: "🚩", walkable: false },
  humanbanier:  { name: "humanbanier",    icon: "🏳️", walkable: false },
  tent:         { name: "tent",           icon: "⛺", walkable: false },
  kampvuur:     { name: "kampvuur",       icon: "🔥", walkable: false },
  waterput:     { name: "waterput",       icon: "🪣", walkable: false },
  kist:         { name: "kist",           icon: "🧰", walkable: false },
  krat:         { name: "krat",           icon: "📦", walkable: false },
  palissade:    { name: "palissade",      icon: "🪵", walkable: false },
  muur:         { name: "muur",           icon: "🧱", walkable: false },
  wachttoren:   { name: "wachttoren",     icon: "🗼", walkable: false },
  orchut:       { name: "orchut",         icon: "🛖", walkable: false },
  huisje:       { name: "huisje",         icon: "🏠", walkable: false },
  droogrek:     { name: "droogrek",       icon: "🪜", walkable: false },
  zuil:         { name: "zuil",           icon: "🏛️", walkable: false },
  totem:        { name: "totem",          icon: "🗿", walkable: false },
  schatkist:    { name: "schatkist",      icon: "💰", walkable: false },
  houtstapel:   { name: "houtstapel",     icon: "🪵", walkable: false },
  graanzak:     { name: "graanzak",       icon: "💰", walkable: false },
  emmer:        { name: "emmer",          icon: "🪣", walkable: false },
  voerbak:      { name: "voerbak",        icon: "🌾", walkable: false },
  ketel:        { name: "ketel",          icon: "🍲", walkable: false },
  bakoven:      { name: "bakoven",        icon: "🔥", walkable: false },
  hakblok:      { name: "hakblok",        icon: "🪓", walkable: false },
  kookvuur:     { name: "kookvuur",       icon: "🍲", walkable: false },
  haard:        { name: "haard",          icon: "🔥", walkable: false },
  deur:         { name: "deur",           icon: "🚪", walkable: false },
  hek:          { name: "hek",            icon: "🚧", walkable: false },
  // ---- wel betreedbaar ----
  strobaal:     { name: "strobaal",       icon: "🌾", walkable: true },
  tapijt:       { name: "tapijt",         icon: "🟥", walkable: true },
  bank:         { name: "tafel met bank", icon: "🪑", walkable: true },
  bed:          { name: "bed",            icon: "🛏️", walkable: true },
  orcbed:       { name: "orcbed",         icon: "🛏️", walkable: true },
  ladder:       { name: "ladder",         icon: "🪜", walkable: true },
};

const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]]; // "naast" = boven, onder, links, rechts

export function makeBoard(puzzle) {
  const n = puzzle.size;
  const obj = {};
  for (const o of puzzle.objects) obj[`${o.r},${o.c}`] = o.type;
  return {
    n,
    room: (r, c) => puzzle.layout[r][c],
    obj: (r, c) => obj[`${r},${c}`] ?? null,
    walkable: (r, c) => {
      const t = obj[`${r},${c}`];
      return !t || OBJECTS[t].walkable;
    },
    neighbours(r, c) {
      return DIRS.map(([dr, dc]) => [r + dr, c + dc])
        .filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n);
    },
  };
}

// Regels die alleen over de persoon zelf gaan (snel te filteren).
function unaryOk(rule, r, c, B) {
  switch (rule.type) {
    case "inRoom":     return B.room(r, c) === rule.room;
    case "notInRoom":  return B.room(r, c) !== rule.room;
    case "on":         return B.obj(r, c) === rule.object;
    case "notOn":      return B.obj(r, c) !== rule.object;
    case "nextTo":     return B.neighbours(r, c).some(([a, b]) => B.obj(a, b) === rule.object);
    case "notNextTo":  return !B.neighbours(r, c).some(([a, b]) => B.obj(a, b) === rule.object);
    case "row":        return r === rule.row;
    case "col":        return c === rule.col;
    default:           return null; // geen unaire regel
  }
}

// Regels die andere personen nodig hebben (gecontroleerd als iedereen staat).
function fullOk(rule, me, pos, puzzle, B) {
  const [r, c] = pos[me];
  const roomOf = (id) => B.room(...pos[id]);
  switch (rule.type) {
    case "sameRoom":    return roomOf(me) === roomOf(rule.other);
    case "notSameRoom": return roomOf(me) !== roomOf(rule.other);
    case "alone":       return puzzle.people.every(p => p.id === me || roomOf(p.id) !== B.room(r, c));
    case "notAlone":    return puzzle.people.some(p => p.id !== me && roomOf(p.id) === B.room(r, c));
    case "above":       return r < pos[rule.other][0];
    case "below":       return r > pos[rule.other][0];
    case "leftOf":      return c < pos[rule.other][1];
    case "rightOf":     return c > pos[rule.other][1];
    default:            throw new Error(`Onbekende regel: ${rule.type}`);
  }
}

// Algemene feiten over de hele plaats delict.
function factOk(fact, pos, puzzle, B) {
  const inRoom = (room) => puzzle.people.filter(p => B.room(...pos[p.id]) === room);
  switch (fact.type) {
    case "roomEmpty":     return inRoom(fact.room).length === 0;
    case "noKindInRoom":  return !inRoom(fact.room).some(p => p.kind === fact.kind);
    case "roomCount":     return inRoom(fact.room).length === fact.count;
    default:              throw new Error(`Onbekend feit: ${fact.type}`);
  }
}

export function findKiller(puzzle, pos, B = makeBoard(puzzle)) {
  const victim = puzzle.people.find(p => p.kind === "victim");
  const vRoom = B.room(...pos[victim.id]);
  const withVictim = puzzle.people.filter(p => p !== victim && B.room(...pos[p.id]) === vRoom);
  return withVictim.length === 1 ? withVictim[0] : null;
}

// Geeft alle oplossingen (tot max) terug als { personId: [r, c] }.
export function solve(puzzle, max = 2) {
  const B = makeBoard(puzzle);
  const people = puzzle.people;
  const facts = puzzle.facts ?? [];

  // kandidaten per persoon
  const cand = people.map(p => {
    const list = [];
    for (let r = 0; r < B.n; r++)
      for (let c = 0; c < B.n; c++) {
        if (!B.walkable(r, c)) continue;
        if ((p.rules ?? []).every(rule => unaryOk(rule, r, c, B) !== false)) list.push([r, c]);
      }
    return list;
  });

  // personen met de minste kandidaten eerst = sneller
  const order = people.map((p, i) => i).sort((a, b) => cand[a].length - cand[b].length);
  const usedR = new Set(), usedC = new Set();
  const pos = {};
  const out = [];

  (function bt(k) {
    if (out.length >= max) return;
    if (k === order.length) {
      const ok =
        people.every(p => (p.rules ?? []).every(rule =>
          unaryOk(rule, ...pos[p.id], B) !== null || fullOk(rule, p.id, pos, puzzle, B))) &&
        facts.every(f => factOk(f, pos, puzzle, B)) &&
        findKiller(puzzle, pos, B) !== null;
      if (ok) out.push(structuredClone(pos));
      return;
    }
    const i = order[k];
    for (const [r, c] of cand[i]) {
      if (usedR.has(r) || usedC.has(c)) continue;
      usedR.add(r); usedC.add(c); pos[people[i].id] = [r, c];
      bt(k + 1);
      usedR.delete(r); usedC.delete(c); delete pos[people[i].id];
    }
  })(0);

  return out;
}
