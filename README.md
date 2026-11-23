# H.A.C.D.

Hyperscale Auto Consultation Designer. A zero-dependency static console that takes a campus brief and produces a scored feasibility verdict, a costed P50/P80 range and a ten-sheet schematic set — with every figure traceable to the input, method or assumption that produced it.

It is a planning tool. Not a survey, not calculations, not sealed engineering.

**This is the only H.A.C.D. repository, and `main` is the only version of the app.** Anyone — person or AI — working on it reads [AGENTS.md](AGENTS.md) first.

## Running it

Static files, no build step. Netlify publishes the repo root (`netlify.toml`). Locally it needs a server, because the scripts are separate files:

```
python -m http.server 8777
```

## Testing it

Zero dependencies — Node 22 or later and nothing else:

```
node --test "tests/*.test.js"
```

The tests load `model.js`, `engine.js` and `sheets.js` exactly as the page does and check the two promises above: identical inputs give an identical run id and output, and every figure traces to an input, a method or a declared assumption. Known gaps run as `TODO` until they are fixed. GitHub Actions runs the same command on every push and pull request.

## How it is put together

| File | What |
| --- | --- |
| `tokens.css` | Design system tokens — two themes, four signal hues, the spacing and radius scales |
| `styles.css` | Components bound to those tokens |
| `js/model.js` | The Scenario spine: typed quantities, unit conversion, the rate book, provenance for every input |
| `js/engine.js` | The deterministic engine: sizing, power, water, cost, schedule, carbon, and a seeded Monte Carlo |
| `js/sheets.js` | The ten-sheet set; geometry is computed from the model, not drawn by hand |
| `js/walk-model.js` | The walkthrough's building model: halls, rack rows, electrical rooms, yards and substation, laid out from the evaluated run as plain boxes, with counts that cite their inputs |
| `js/walk-detail.js` | Dresses that model as real equipment (handles, nameplates, ladder tray and cable, containment framing, contact shadows) without changing a count or a collider; also the render quality presets and the frame-rate governor |
| `js/walk.js` | The first-person 3D view of that model (three.js): PBR materials, daylight with soft shadows, fixture light and hall haze, ambient occlusion and bloom, quality presets, collision, HUD |
| `js/ui.js` | The console: five views, scenario branches, command bar, provenance drawer, export |
| `vendor/three/` | three.js r160, its Sky and RoomEnvironment, and the post-processing addons (composer, GTAO, bloom, output) under `addons/`, vendored unmodified with their MIT licence. Loaded only when the Walkthrough opens |
| `contracts/` | The action-log schema every export conforms to, and the allowlist of actions that may be logged |
| `docs/pilot/` | How a pilot proves H.A.C.D. works — the value formula, the success criteria, and Excel-ready trackers |

## The rules it enforces

- **No number without provenance.** Every figure opens its chain — the inputs, the method that combined them, and whether each was given, derived or assumed.
- **Assumptions are visible.** Each carries a tolerance and an owner and appears in the register. Narrowing one narrows the P80, and the console shows which ones drive the spread.
- **Determinism over fluency.** Every calculation is a function. The Monte Carlo is seeded, so identical inputs always produce an identical answer, and the run id proves it.
- **The model is the contract.** Sheets, tables and exports all render from the Scenario. Nothing holds its own copy of a number.

## The five views

**Overview** — the verdict, the metric row, the phasing plan and all eleven checks.
**Brief** — the inputs, each showing its source, beside the open assumption register.
**Drawings** — the sheet set, `G-001` through `CD-001`. Print lays the whole set out one sheet per page.
**Walkthrough** — a first-person 3D walk through the campus the run describes: in through the front door, down the corridor, into the data halls (contained rack rows, busway, cable tray, CDUs at liquid densities), the electrical rooms (MV and LV switchgear, UPS, batteries), the mechanical gallery, the generator yard and the substation. WASD and mouse, or touch. Every layout dimension it assumes is declared in `H.WALK.CONVENTIONS` with a tolerance; every count in the HUD opens its inputs. Quality runs Low, Medium, High or Ultra; Auto picks one for the device (phones start Low) and steps down if the frame rate holds under 28 fps, and the HUD shows the live rate. Schematic massing, not a model of record.
**Commercial** — bottom-up capex against the rate book, the P10/P50/P80/P90 range, and the assumptions driving the spread.

Three scenario branches — Baseline, Accelerated, Constrained — recompute everything on identical bases. `⌘K` reaches any view, sheet, branch or model path.

## What is not built yet

Intake (document ingestion with page citations), the agent mesh, the assurance sign-off ledger, and the Forge (report and deck generation). This is the console and the engine, not the whole product.

Automated checking of design models — Revit, pyRevit, VIKTOR — belongs in the Assurance module when it's built. An earlier prototype sketched those integrations, but every one of them was a stub, so none of that code came across; the action-log contract it defined did, and now runs in every export.
