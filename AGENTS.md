# AGENTS.md — read this before touching H.A.C.D.

This file is for every AI and every person working on H.A.C.D. — Claude, Grok, Codex, Cursor, Copilot, anyone. Read it first. Follow it.

## There is one H.A.C.D.

- **One repository:** `tommyphillips95/HACD`. Do not create another repo, fork or copy for H.A.C.D. work.
- **One branch that matters:** `main`. It is the app.
- **One app:** the static console in this repo. There is no second version anywhere else.

If you think you need a new repo or a parallel rebuild, you don't. Branch, change, merge.

## How to make a change

1. Branch off `main` with a short name that says what the change is.
2. Keep the change small, and finish it.
3. Merge it back into `main` the same day. Delete the branch.
4. Never leave a branch alive longer than the work takes. Stale branches are how this repo got split three ways.

Don't rewrite the app from scratch. Extend it. If something is wrong, fix that thing.

## Reporting — #hacd

Every agent reports into the **`#hacd`** Slack channel. It is the one place to see what changed in H.A.C.D. and who changed it.

- **Pushes report themselves.** The GitHub app posts every commit and pull request on this repo into `#hacd`, so an agent with no Slack access is still covered: push to `main` and it shows up.
- **An agent that can post to Slack sends a report after merging**, in this shape:

  ```
  [agent] What changed, in one line
  Why: one line
  Commit: <sha> · Verified: <how you checked it>
  Open: anything left undone, or "nothing"
  ```

- Never report work as done unless it is on `main`.

## What the app is

H.A.C.D. — Hyperscale Auto Consultation Designer. A zero-dependency static console: a campus brief goes in; a scored feasibility verdict, a P50/P80 capex range and a ten-sheet schematic set come out. It is a planning tool, not sealed engineering.

| File | Owns |
| --- | --- |
| `js/model.js` | The Scenario: typed quantities, unit conversion, the rate book, provenance for every input |
| `js/engine.js` | All calculation — sizing, power, water, cost, schedule, carbon, risk, checks |
| `js/sheets.js` | The drawing set. Renders from the evaluated Scenario and nothing else |
| `js/walk-model.js` | The walkthrough's building model, laid out from the evaluated run. Layout conventions live in `H.WALK.CONVENTIONS`, each with tolerance and reason; new building types register in `H.WALK.TYPES` |
| `js/walk.js` | Renders that model in 3D. Draws what `walk-model.js` gives it; never sizes anything |
| `js/ui.js` | The console. Reads the Scenario; never computes |
| `vendor/three/` | three.js, vendored unmodified. The app's only third-party code; no npm, no build |
| `tokens.css` | Design tokens. Don't hand-edit — regenerate from the design system |
| `styles.css` | Components bound to tokens. No raw hex values |
| `contracts/` | The action-log schema and the allowlist of actions that may be logged |
| `docs/pilot/` | The pilot's success criteria and Excel-ready evidence trackers |

No build step, no npm, no framework. Keep it that way unless there is a real reason.

## Rules the code has to keep

1. **One source of truth.** Everything reads from the Scenario. No panel, sheet or export keeps its own copy of a number.
2. **No number without provenance.** Every figure traces to a given input, a named method or a declared assumption. If it can't, render `—`, not a guess.
3. **Assumptions are declared.** A new assumption goes in `DEMO_PROV` with a tolerance, an owner and a reason.
4. **Math is a function.** Calculations live in `engine.js` as deterministic functions. The Monte Carlo seed stays pinned, so the same inputs always give the same answer.
5. **Every sheet says it's schematic.** `NOT FOR CONSTRUCTION — NOT SEALED` stays on every sheet and every export.
6. **No client names.** H.A.C.D. is client-neutral. Don't put a real company's name or branding in it.
7. **The action log stays valid.** Every export's `action_log` must validate against `contracts/action-log.schema.json`. A new action goes into `approved-actions.schema.json` first, never as a loose string in the code.

## Running it

```
python -m http.server 8777
```

Then open http://localhost:8777. It needs a server — opening `index.html` directly won't load the scripts.

## Before you push

- Run `node --test "tests/*.test.js"`. Zero failures.
- Load the page with the console open. Zero errors.
- Click through all five views, in both themes.
- Change an input and confirm the numbers and the sheets both move.
