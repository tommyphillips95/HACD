# H.A.C.D.

Hyperscale Auto Consultation Designer. A zero-dependency static console that takes a campus brief and produces a scored feasibility verdict, a costed P50/P80 range and a ten-sheet schematic set — with every figure traceable to the input, method or assumption that produced it.

It is a planning tool. Not a survey, not calculations, not sealed engineering.

## Running it

Static files, no build step. Netlify publishes the repo root (`netlify.toml`). Locally it needs a server, because the scripts are separate files:

```
python -m http.server 8777
```

## How it is put together

| File | What |
| --- | --- |
| `tokens.css` | Design system tokens — two themes, four signal hues, the spacing and radius scales |
| `styles.css` | Components bound to those tokens |
| `js/model.js` | The Scenario spine: typed quantities, unit conversion, the rate book, provenance for every input |
| `js/engine.js` | The deterministic engine: sizing, power, water, cost, schedule, carbon, and a seeded Monte Carlo |
| `js/sheets.js` | The ten-sheet set; geometry is computed from the model, not drawn by hand |
| `js/ui.js` | The console: four views, scenario branches, command bar, provenance drawer, export |

## The rules it enforces

- **No number without provenance.** Every figure opens its chain — the inputs, the method that combined them, and whether each was given, derived or assumed.
- **Assumptions are visible.** Each carries a tolerance and an owner and appears in the register. Narrowing one narrows the P80, and the console shows which ones drive the spread.
- **Determinism over fluency.** Every calculation is a function. The Monte Carlo is seeded, so identical inputs always produce an identical answer, and the run id proves it.
- **The model is the contract.** Sheets, tables and exports all render from the Scenario. Nothing holds its own copy of a number.

## The four views

**Overview** — the verdict, the metric row, the phasing plan and all eleven checks.
**Brief** — the inputs, each showing its source, beside the open assumption register.
**Drawings** — the sheet set, `G-001` through `CD-001`. Print lays the whole set out one sheet per page.
**Commercial** — bottom-up capex against the rate book, the P10/P50/P80/P90 range, and the assumptions driving the spread.

Three scenario branches — Baseline, Accelerated, Constrained — recompute everything on identical bases. `⌘K` reaches any view, sheet, branch or model path.

## What is not built yet

Intake (document ingestion with page citations), the agent mesh, the assurance sign-off ledger, and the Forge (report and deck generation). This is the console and the engine, not the whole product.
