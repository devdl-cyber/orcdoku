// Orcdoku - solver
// Werkt zowel in de browser als in Node (tools/check.mjs).
//
// Spelregels:
//  1. In elke rij en elke kolom staat precies één persoon.
//  2. Niemand staat op een voorwerp dat niet betreedbaar is (catapult, koe, ...).
//  3. Elke aanwijzing klopt.
//  4. De moordenaar is de enige verdachte die alleen met het slachtoffer in een kamer was.

export const OBJECTS = {
  // niet betreedbaar
  kampvuur:  { name: "kampvuur",  icon: "🔥", walkable: false },
  catapult:  { name: "catapult",  icon: "🏹", walkable: false },
  rotshoop:  { name: "rotshoop",  icon: "🪨", walkable: false },
  wapenrek:  { name: "wapenrek",  icon: "⚔️", walkable: false },
  troon:     { name: "troon",     icon: "👑", walkable: false },
  barrel:    { name: "barrel",    icon: "🛢️", walkable: false },
  koe:       { name: "koe",       icon: "🐄", walkable: false },
  aambeeld:  { name: "aambeeld",  icon: "⚒️", walkable: false },
  // wel betreedbaar
  tapijt:    { name: "tapijt",    icon: "🟥", walkable: true },
  strobaal:  { name: "strobaal",  icon: "🌾", walkable: true },
  bank:      { name: "bank",      icon: "🪑", walkable: true },
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
