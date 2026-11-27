// Orcdoku - speellogica in de browser
//
// Bediening:
//   linksklik kort         -> kandidaat van gekozen persoon aan/uit
//   linkermuis ingedrukt   -> gekozen persoon definitief plaatsen
//   rechtsklik             -> ✗ aan/uit, of definitieve persoon weghalen
//   touch: tik = kandidaat, lang drukken = definitief, ✗-modus: tik = ✗
import { OBJECTS, makeBoard, solve, findKiller } from "./solver.js";

const $ = (id) => document.getElementById(id);
const KIND_LABEL = { orc: "Orc", human: "Human", victim: "Slachtoffer" };
const HOLD_MS = 450;

let puzzle, B, solution, state, selected = null, xMode = false;

const emptyState = () => ({ pos: {}, cands: {}, marks: [], solved: false });
const key = (r, c) => `${r},${c}`;

// ---------- opslaan in de browser (mag mislukken) ----------
const saveKey = () => `orcdoku:v2:${puzzle.id}`;
function save() {
  try { localStorage.setItem(saveKey(), JSON.stringify(state)); } catch {}
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(saveKey()));
    return s ? { ...emptyState(), ...s } : null;
  } catch { return null; }
}

// ---------- opstarten ----------
async function start() {
  const list = await fetch("puzzles/index.json").then(r => r.json());
  const wanted = new URLSearchParams(location.search).get("zaak") ?? list[0];
  puzzle = await fetch(`puzzles/${wanted}.json`).then(r => r.json());
  B = makeBoard(puzzle);

  const sols = solve(puzzle, 2);
  if (sols.length !== 1) console.warn(`Let op: ${sols.length} oplossingen gevonden`);
  solution = sols[0];

  state = load() ?? emptyState();
  document.title = `Orcdoku - ${puzzle.title}`;
  $("title").textContent = puzzle.title;
  $("story").textContent = puzzle.story;

  buildBoard();
  buildLegend();
  $("facts").innerHTML = (puzzle.facts ?? []).map(f => `<li>${f.text}</li>`).join("") || "<li>Geen.</li>";
  render();

  $("btn-reset").onclick = () => { state = emptyState(); selected = null; save(); render(); };
  $("btn-rules").onclick = () => $("dlg-rules").showModal();
  $("btn-xmode").onclick = () => { xMode = !xMode; render(); };
}

// ---------- bord opbouwen ----------
function buildBoard() {
  const board = $("board");
  board.style.setProperty("--n", B.n);
  board.addEventListener("contextmenu", (e) => e.preventDefault());
  const labelled = new Set();
  for (let r = 0; r < B.n; r++) {
    for (let c = 0; c < B.n; c++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = `cell room-${B.room(r, c)}`;
      cell.dataset.r = r; cell.dataset.c = c;
      // dikke muur waar een andere kamer begint
      if (r === 0 || B.room(r - 1, c) !== B.room(r, c)) cell.classList.add("wall-t");
      if (c === 0 || B.room(r, c - 1) !== B.room(r, c)) cell.classList.add("wall-l");
      if (r === B.n - 1 || B.room(r + 1, c) !== B.room(r, c)) cell.classList.add("wall-b");
      if (c === B.n - 1 || B.room(r, c + 1) !== B.room(r, c)) cell.classList.add("wall-r");

      const t = B.obj(r, c);
      if (t) {
        cell.classList.add(OBJECTS[t].walkable ? "walk" : "block", `obj-${t}`);
        cell.insertAdjacentHTML("beforeend", `<span class="obj" title="${OBJECTS[t].name}">${OBJECTS[t].icon}</span>`);
      }
      if (!labelled.has(B.room(r, c))) {
        labelled.add(B.room(r, c));
        cell.insertAdjacentHTML("beforeend", `<span class="room-name">${puzzle.rooms[B.room(r, c)].name}</span>`);
      }
      cell.insertAdjacentHTML("beforeend", `<span class="slot"></span>`);
      attachPointer(cell, r, c);
      board.appendChild(cell);
    }
  }
}

// Kort drukken vs. ingedrukt houden, voor muis (links) en touch.
function attachPointer(cell, r, c) {
  let timer = null;
  const cancel = () => { clearTimeout(timer); timer = null; cell.classList.remove("holding"); };

  cell.addEventListener("pointerdown", (e) => {
    const touch = e.pointerType !== "mouse";
    if (!touch && e.button === 2) { xAction(r, c); return; }          // rechtsklik = ✗
    if (!touch && e.button !== 0) return;
    if (touch && xMode) { xAction(r, c); return; }                 // ✗-modus op gsm
    e.preventDefault();
    cell.classList.add("holding");
    timer = setTimeout(() => { timer = null; cell.classList.remove("holding"); placeFinal(r, c); }, HOLD_MS);
  });
  cell.addEventListener("pointerup", () => {
    if (timer) { cancel(); toggleCandidate(r, c); }                    // kort = kandidaat
  });
  cell.addEventListener("pointerleave", cancel);
  cell.addEventListener("pointercancel", cancel);
}

function buildLegend() {
  const used = [...new Set(puzzle.objects.map(o => o.type))];
  $("legend").innerHTML = used.map(t =>
    `<li><span class="obj">${OBJECTS[t].icon}</span> ${OBJECTS[t].name}
      <small>${OBJECTS[t].walkable ? "betreedbaar" : "geblokkeerd"}</small></li>`).join("");
}

// ---------- hulpjes ----------
const whoAt = (r, c) => Object.keys(state.pos).find(id => state.pos[id][0] === r && state.pos[id][1] === c);
const nameOf = (id) => puzzle.people.find(p => p.id === id).name;

// vakjes die automatisch ✗ zijn: zelfde rij/kolom als een definitief geplaatste persoon
function autoMarked(r, c) {
  return Object.values(state.pos).some(([pr, pc]) => (pr === r) !== (pc === c));
}
const isMarked = (r, c) => state.marks.includes(key(r, c)) || autoMarked(r, c);

function needSelection() {
  if (selected) return true;
  flash("Kies eerst een persoon in de lijst.");
  return false;
}

// ---------- acties ----------
function toggleCandidate(r, c) {
  if (state.solved || !needSelection()) return;
  if (!B.walkable(r, c)) return flash("Daar kan niemand staan.");
  if (whoAt(r, c)) return flash("Daar staat al iemand definitief.");
  if (isMarked(r, c)) return flash("Dit vakje is weggestreept (✗).");
  if (state.pos[selected]) return flash(`${nameOf(selected)} staat al definitief.`);
  const k = key(r, c);
  const list = state.cands[k] ?? [];
  state.cands[k] = list.includes(selected) ? list.filter(id => id !== selected) : [...list, selected];
  if (!state.cands[k].length) delete state.cands[k];
  save(); render();
}

function placeFinal(r, c) {
  if (state.solved || !needSelection()) return;
  if (!B.walkable(r, c)) return flash("Daar kan niemand staan.");
  const here = whoAt(r, c);
  if (here && here !== selected) delete state.pos[here];
  state.pos[selected] = [r, c];

  // kandidaten van deze persoon overal weg; alle kandidaten in rij en kolom weg
  for (const k of Object.keys(state.cands)) {
    const [kr, kc] = k.split(",").map(Number);
    if (kr === r || kc === c) delete state.cands[k];
    else {
      state.cands[k] = state.cands[k].filter(id => id !== selected);
      if (!state.cands[k].length) delete state.cands[k];
    }
  }
  state.marks = state.marks.filter(k => k !== key(r, c));
  selected = null;
  save(); render(); checkWin();
}

function xAction(r, c) {
  if (state.solved) return;
  const here = whoAt(r, c);
  if (here) {                         // definitieve persoon terug weghalen
    delete state.pos[here];
    selected = here;
    save(); render();
    return;
  }
  if (autoMarked(r, c)) return flash("Dit ✗ komt van een geplaatste persoon in dezelfde rij of kolom.");
  const k = key(r, c);
  if (state.marks.includes(k)) state.marks = state.marks.filter(x => x !== k);
  else { state.marks.push(k); delete state.cands[k]; }
  save(); render();
}

function selectPerson(id) {
  if (state.solved) return;
  selected = selected === id ? null : id;
  render();
}

// ---------- tekenen ----------
function token(p, cls = "") {
  return `<span class="token kind-${p.kind} ${cls}" title="${p.name} (${KIND_LABEL[p.kind]})">${p.name[0]}</span>`;
}

function render() {
  // conflicten: twee personen in dezelfde rij of kolom
  const rows = {}, cols = {};
  for (const [r, c] of Object.values(state.pos)) { rows[r] = (rows[r] ?? 0) + 1; cols[c] = (cols[c] ?? 0) + 1; }

  for (const cell of $("board").children) {
    const r = +cell.dataset.r, c = +cell.dataset.c;
    const id = whoAt(r, c);
    const p = id && puzzle.people.find(x => x.id === id);
    const cands = state.cands[key(r, c)] ?? [];
    let html = "";
    if (p) html = token(p);
    else if (isMarked(r, c)) html = `<span class="mark${autoMarked(r, c) ? " auto" : ""}">✗</span>`;
    else if (cands.length) html = `<span class="cands">${puzzle.people.filter(x => cands.includes(x.id)).map(x => token(x, "mini")).join("")}</span>`;
    cell.querySelector(".slot").innerHTML = html;
    cell.classList.toggle("conflict", !!p && (rows[r] > 1 || cols[c] > 1));
    cell.classList.toggle("target", !!selected && B.walkable(r, c) && !p && !isMarked(r, c));
  }

  $("people").innerHTML = "";
  for (const p of puzzle.people) {
    const li = document.createElement("li");
    li.className = `person${selected === p.id ? " selected" : ""}${state.pos[p.id] ? " placed" : ""}`;
    li.innerHTML = `${token(p)}<div><b>${p.name}</b> <small>${KIND_LABEL[p.kind]}</small><br>${p.clue}</div>`;
    li.tabIndex = 0;
    li.onclick = () => selectPerson(p.id);
    li.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectPerson(p.id); } };
    $("people").appendChild(li);
  }

  $("btn-xmode").classList.toggle("on", xMode);
  $("btn-xmode").setAttribute("aria-pressed", xMode);

  const placed = Object.keys(state.pos).length;
  $("status").textContent = state.solved
    ? "Opgelost!"
    : selected ? `${nameOf(selected)}: klik = kandidaat, ingedrukt houden = definitief.`
    : `${placed} van ${puzzle.people.length} personen definitief geplaatst.`;
}

function flash(msg) {
  $("status").textContent = msg;
}

function checkWin() {
  if (Object.keys(state.pos).length !== puzzle.people.length) return;
  const correct = puzzle.people.every(p =>
    state.pos[p.id][0] === solution[p.id][0] && state.pos[p.id][1] === solution[p.id][1]);
  if (!correct) return flash("Iedereen staat, maar iets klopt nog niet…");
  state.solved = true; save(); render();
  const killer = findKiller(puzzle, solution);
  const victim = puzzle.people.find(p => p.kind === "victim");
  $("win-text").textContent =
    `${killer.name} was als enige alleen met ${victim.name} in de ${puzzle.rooms[B.room(...solution[victim.id])].name.toLowerCase()}. ${killer.name} is de moordenaar!`;
  $("dlg-win").showModal();
}

start().catch(err => {
  console.error(err);
  $("status").textContent = "Kon de puzzel niet laden. Start je de site via een webserver (node tools/serve.mjs)?";
});
