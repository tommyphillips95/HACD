# Proving H.A.C.D. works

A pilot answers one question: does H.A.C.D. produce a feasibility study faster, catch problems earlier, and land closer to the real answer than the way the work is done today? This folder holds the evidence. The CSVs open directly in Excel and version cleanly in Git.

## The value formula

```
Value = (Hours Saved × Loaded Hourly Rate) + Cost Avoided by Issues Caught Early
```

Every term comes from a tracker below. Nothing in it is estimated by the app.

## What to measure

| Measure | How | Tracker |
| --- | --- | --- |
| Hours per feasibility study | Before vs. with H.A.C.D., recorded by the person who did the work | `saved-time-log.csv` |
| Issues caught before the client | Copied from the `action_log` in each export: every flagged check, its severity, and whether it would have reached the client | `issues-caught.csv` |
| Accuracy | Capex P50 against the known answer on a closed pursuit, as a percentage error | `pilot-summary.csv` |
| Adoption | Studies completed and active users | `pilot-summary.csv` |
| Sentiment | A rating and a sentence from each user | `user-feedback.csv` |

**Baselines start blank.** Fill them from real past work, not from targets. A baseline nobody can trace back to a source is exactly the kind of number H.A.C.D. refuses to print.

## Action log to tracker

Every export from the console carries an `action_log` entry that conforms to [`contracts/action-log.schema.json`](../../contracts/action-log.schema.json).

| Action log field | Goes to |
| --- | --- |
| `timestamp`, `project`, `model` | Date, project and run id in `issues-caught.csv` |
| `issues[].issue_type` | Check |
| `issues[].severity` | Severity |
| `issues[].would_have_reached_client` | Would Have Reached Client |
| `duration_before_hours`, `duration_after_hours` | `saved-time-log.csv` — entered by hand, never by the app |

In `saved-time-log.csv`, compute Hours Saved as `=IF(E2<=D2,D2-E2,"INVALID: After > Before")` and fill down. An entry where the work took *longer* with H.A.C.D. is real evidence — record it, don't hide it.

## What success looks like

**Technical**
- The console runs every study with zero errors.
- Every figure in an export traces to a given input, a method or a declared assumption.
- Identical inputs reproduce an identical run id.

**Usage**
- Real pursuits are run through it, not just the demo campus.
- People come back to it week after week without being asked.

**Business**
- Hours per study fall measurably against the baseline.
- At least one issue is caught that a senior engineer agrees would otherwise have reached the client.
- Capex P50 lands inside the practice's own tolerance on a pursuit whose answer is already known.

That last one is the result that matters. Everything else in this folder exists to make it believable.
