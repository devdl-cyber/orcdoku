// Controleert of puzzels precies één oplossing hebben.
// Gebruik:  node tools/check.mjs                 (alle puzzels)
//           node tools/check.mjs puzzles/zaak-001.json
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { solve, findKiller } from "../js/solver.js";

const files = process.argv.length > 2
  ? process.argv.slice(2)
  : readdirSync("puzzles").filter(f => f.startsWith("zaak-")).map(f => join("puzzles", f));

let bad = 0;
for (const f of files) {
  const puzzle = JSON.parse(readFileSync(f, "utf8"));

  // elke persoon moet met een andere letter beginnen (toetsenbord kiest op beginletter)
  const letters = puzzle.people.map(p => p.name[0].toUpperCase());
  const dubbel = letters.filter((l, i) => letters.indexOf(l) !== i);
  if (dubbel.length) {
    bad++;
    console.log(`FOUT ${f}  -> zelfde beginletter: ${[...new Set(dubbel)].join(", ")}`);
    continue;
  }

  const sols = solve(puzzle, 5);
  if (sols.length === 1) {
    const killer = findKiller(puzzle, sols[0]);
    console.log(`OK   ${f}  -> moordenaar: ${killer.name}`);
  } else {
    bad++;
    console.log(`FOUT ${f}  -> ${sols.length === 0 ? "geen oplossing" : sols.length + "+ oplossingen"}`);
    for (const s of sols) console.log("     ", JSON.stringify(s));
  }
}
process.exit(bad ? 1 : 0);
