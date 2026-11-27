# Orcdoku

Een logische moordpuzzel in een fantasywereld. Orcs en humans zouden vrede sluiten,
maar de gezant is dood. Plaats alle personen op de plattegrond en ontmasker de moordenaar.

## Regels
1. In elke rij en elke kolom staat precies één persoon.
2. Niemand staat op een niet-betreedbaar voorwerp (catapult, koe, barrel...). Een tapijt, strobaal of bank mag wel.
3. Alle aanwijzingen en feiten kloppen. "Naast" = direct erboven, eronder, links of rechts.
4. De moordenaar is de enige verdachte die alleen met het slachtoffer in een kamer was.

## Lokaal spelen
```
node tools/serve.mjs
```
Open daarna http://localhost:8080

## Een puzzel controleren
```
node tools/check.mjs
```
Elke puzzel moet precies één oplossing hebben.

## Mappen
| Map | Inhoud |
|---|---|
| `index.html`, `css/`, `js/game.js` | de website |
| `js/solver.js` | regels + oplosser (browser én Node) |
| `puzzles/` | de zaken als JSON, `index.json` = lijst |
| `tools/` | hulpscripts: controle en lokale webserver |
