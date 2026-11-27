// Orcdoku - speellogica in de browser
import { OBJECTS, makeBoard, solve, findKiller } from "./solver.js";

const $ = (id) => document.getElementById(id);
const KIND_LABEL = { orc: "Orc", human: "Human", victim: "Slachtoffer" };

let puzzle, B, solution, state, selected = null;

// ---------- opslaan in de browser (mag mislukken) ----------
const saveKey = () => `orcdoku:${puzzle.id}`;
function save() {
  try { localStorage.setItem(saveKey(), JSON.stringify(state)); } catch {}
}
function load() {
  try { return JSON.parse(localStorage.getItem(saveKey())); } catch { return null; }
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

  state = load() ?? { pos: {}, marks: [], solved: false };
  document.title = `Orcdoku - ${puzzle.title}`;
  $("title").textContent = puzzle.title;
  $("story").textContent = puzzle.story;

  buildBoard();
  buildLegend();
  $("facts").innerHTML = (puzzle.facts ?? []).map(f => `<li>${f.text}</li>`).join("") || "<li>Geen.</li>";
  render();

  $("btn-reset").onclick = () => { state = { pos: {}, marks: [], solved: false }; selected = null; save(); render(); };
  $("btn-rules").onclick = () => $("dlg-rules").showModal();
}

// ---------- bord opbouwen ----------
function buildBoard() {
  const board = $("board");
  board.style.setProperty("--n", B.n);
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
      cell.addEventListener("click", () => onCell(r, c));
      cell.addEventListener("contextmenu", (e) => { e.preventDefault(); toggleMark(r, c); });
      board.appendChild(cell);
    }
  }
}

function buildLegend() {
  const used = [...new Set(puzzle.objects.map(o => o.type))];
  $("legend").innerHTML = used.map(t =>
    `<li><span class="obj">${OBJECTS[t].icon}</span> ${OBJECTS[t].name}
      <small>${OBJECTS[t].walkable ? "betreedbaar" : "geblokkeerd"}</small></li>`).join("");
}

// ---------- interactie ----------
const whoAt = (r, c) => Object.keys(state.pos).find(id => state.pos[id][0] === r && state.pos[id][1] === c);

function onCell(r, c) {
  if (state.solved) return;
  const here = whoAt(r, c);
  if (selected) {
    if (!B.walkable(r, c)) return flash("Daar kan niemand staan.");
    if (here && here !== selected) delete state.pos[here];
    state.pos[selected] = [r, c];
    state.marks = state.marks.filter(k => k !== `${r},${c}`);
    selected = null;
  } else if (here) {
    // persoon oppakken om te verplaatsen
    delete state.pos[here];
    selected = here;
  } else {
    toggleMark(r, c);
    return;
  }
  save(); render(); checkWin();
}

function toggleMark(r, c) {
  if (state.solved || whoAt(r, c)) return;
  const k = `${r},${c}`;
  state.marks = state.marks.includes(k) ? state.marks.filter(x => x !== k) : [...state.marks, k];
  save(); render();
}

function selectPerson(id) {
  if (state.solved) return;
  selected = selected === id ? null : id;
  render();
}

// ---------- tekenen ----------
function token(p) {
  return `<span class="token kind-${p.kind}" title="${p.name} (${KIND_LABEL[p.kind]})">${p.name[0]}</span>`;
}

function render() {
  // conflicten: twee personen in dezelfde rij of kolom
  const rows = {}, cols = {};
  for (const [r, c] of Object.values(state.pos)) { rows[r] = (rows[r] ?? 0) + 1; cols[c] = (cols[c] ?? 0) + 1; }

  for (const cell of $("board").children) {
    const r = +cell.dataset.r, c = +cell.dataset.c;
    const id = whoAt(r, c);
    const p = id && puzzle.people.find(x => x.id === id);
    cell.querySelector(".slot").innerHTML = p ? token(p) : state.marks.includes(`${r},${c}`) ? `<span class="mark">✗</span>` : "";
    cell.classList.toggle("conflict", !!p && (rows[r] > 1 || cols[c] > 1));
    cell.classList.toggle("target", !!selected && B.walkable(r, c) && !p);
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

  const placed = Object.keys(state.pos).length;
  $("status").textContent = state.solved
    ? "Opgelost!"
    : selected ? `Klik op een vakje voor ${puzzle.people.find(p => p.id === selected).name}.`
    : `${placed} van ${puzzle.people.length} personen geplaatst.`;
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
