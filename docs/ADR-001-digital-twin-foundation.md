# ADR-001: Build H.A.C.D. as an evidence-backed digital-twin delivery system

**Status:** Proposed  
**Date:** 2026-11-15  
**Deciders:** H.A.C.D. owner; licensed engineering and construction leads for their domains

## Context

H.A.C.D. already provides a deterministic, provenance-aware planning console: a campus brief becomes a feasibility verdict, commercial range, risk view, and schematic sheet set. The next product horizon is much bigger: make physical-site evidence, configurable infrastructure design, constraints, prefabrication, and eventual field reality work from one trustworthy model.

This must not become a visualizer that presents guesses as ground truth. A drone sweep, satellite image, point cloud, equipment catalog, or cable schedule is evidence with a date, accuracy, licence, and review state. It is not automatically a sealed design, a survey, or an instruction to build.

The product must also preserve its current strengths:

- one scenario model and one provenance chain;
- deterministic calculation where a calculation is required;
- explicit assumptions and uncertainty;
- a human sign-off boundary for regulated, safety-critical, and construction decisions.

## Decision

H.A.C.D. will evolve as a **federated, evidence-backed digital twin**. It will keep distinct but linked layers for observed conditions, proposed design, verified as-built conditions, and operational telemetry. Every output identifies its source layer, capture time, coordinate reference system, precision, confidence, owner, and approval state.

The initial implementation remains an extension of the existing H.A.C.D. console and repository. It is not a rewrite and not a parallel app.

### Twin layers

| Layer | Meaning | May be used for |
| --- | --- | --- |
| Site evidence | Drone/LiDAR, survey, imagery, utility records, documents, and field observations | Context and constraints; never silently treated as exact |
| Proposed design | Parametric campus, equipment, cable, cooling, and prefab-component graph | Option comparison, clash/constraint review, schedules |
| Verified as-built | Field-validated geometry and installed-component records | Construction progress and handover |
| Operations | Approved telemetry and maintenance history | Capacity, changes, and lifecycle planning |

A “current state” display must name its last capture time and uncertainty. Proposed, verified, and observed geometry never overwrite each other.

### Evidence contract

Every imported fact or geometry feature must carry an Evidence Record:

```
id, source type, source URI or document reference, capture time,
coordinate reference system, spatial/measurement accuracy, licence,
chain of custody, confidence, reviewer, expiry/revalidation date,
and permitted uses
```

No engine result or drawing label may claim more precision than its contributing evidence. Missing metadata renders an incomplete-evidence state, not a plausible answer.

### Product architecture

```
Capture + trusted external data
        ↓
Evidence ingestion and validation ──→ immutable evidence store
        ↓                                  ↓
Geospatial and semantic context ───→ provenance graph
        ↓                                  ↓
Scenario / constraints / component graph → deterministic analysis
        ↓
Sheets, BIM-style schedules, change sets, immersive views, and exports
        ↓
Human discipline sign-off ledger
```

The component graph is the future “Revit-level and beyond” core. A component—cabinet, CRAH, busway, cable segment, connector, rack, or prefab skid—has identity, geometry, interface, capacity, lifecycle/version, manufacturer evidence, and installation status. Cable numbers, routes, redundancy paths, and change impact are first-class data, not drawing annotations.

## Options considered

### Option A: Expand the current console into the evidence-backed twin

| Dimension | Assessment |
| --- | --- |
| Complexity | High, but incremental |
| Cost | Controlled by staged data integrations |
| Scalability | Good; contracts keep providers replaceable |
| Team familiarity | Strong; preserves Scenario and provenance model |

**Pros:** Keeps the trusted calculation spine; proves value in small slices; keeps proposed versus observed truth distinct.  
**Cons:** Requires disciplined data contracts before rich 3D/VR work.

### Option B: Start with a full 3D/VR visualization platform

| Dimension | Assessment |
| --- | --- |
| Complexity | Very high |
| Cost | High before planning value is proven |
| Scalability | Unclear without an evidence model |
| Team familiarity | Lower |

**Pros:** Immediately compelling visuals.  
**Cons:** Risks a beautiful but untrustworthy viewer, with no reliable basis for engineering, quantity, or collision decisions.

### Option C: Make a separate GIS, BIM, and field app for each stage

| Dimension | Assessment |
| --- | --- |
| Complexity | Very high |
| Cost | High integration and reconciliation burden |
| Scalability | Poor unless a shared model arrives later |
| Team familiarity | Fragmented |

**Pros:** Each tool can be optimized independently.  
**Cons:** Recreates the coordination gaps H.A.C.D. is meant to remove.

## Trade-off analysis

Option A is selected. Site capture, GIS context, component-level design, field verification, and immersive review are valuable only when they share identity, time, location, and provenance. The order matters: establish trusted evidence and component contracts first; then add spatial automation; then add VR/AR as a view of the same model.

Automation may recommend, calculate, assemble, and flag conflicts. It must not silently certify compliance, approve construction, or obscure a human professional’s accountability. The interface should make handoffs faster, not make them invisible.

## Connected-workflow decision

Each connected tool gets one non-overlapping job:

| Tool | Role | Rule |
| --- | --- | --- |
| Codex | Turns approved work into small, tested implementation changes | Works on a short-lived branch; reports verification |
| Claude | Independent architecture, safety, and requirements critique | Reviews a concrete artifact; does not become a second source of code truth |
| GitHub | Canonical source, issues, pull requests, tests, releases, and decision record | `tommyphillips95/HACD` and `main` remain the only code source |
| Slack `#hacd` | Human-facing execution log and decisions that need a response | GitHub posts commits/PRs; post a four-line completion report after merge when available |
| Muse | Design-reference workspace for user journeys, spatial-review concepts, and approved experience decisions | Link decisions back to a GitHub issue or ADR; do not let visual notes become undocumented requirements |
| GitLab | No role in the initial architecture | Do not mirror, fork, or accept edits there. It can be evaluated later only for a specific non-overlapping capability, with GitHub retained as the sole source of truth |

A linked tool is useful only when it creates a traceable input, decision, implementation, verification, or alert. “Using every tool” is not a goal; eliminating lost context and duplicated work is.

## Consequences

- H.A.C.D. will be able to grow from a planning console into a site-to-lifecycle system without claiming false certainty.
- Future capture providers, manufacturer catalogs, and visualization clients remain replaceable behind the evidence and component contracts.
- 3D/VR becomes a trusted projection of the model, rather than a separate authoring surface.
- New integrations require data-rights, privacy, accuracy, retention, and access-control review.
- The system will require ongoing domain ownership: geospatial, electrical, mechanical, civil, structural, construction, and operations experts remain necessary.

## Action items

1. [ ] Add a Site Evidence Record and its provenance UI to the existing Scenario model.
2. [ ] Define the coordinate, unit, precision, and time rules used by every site datum.
3. [ ] Build a first “site dossier” import path for a bounded, non-sensitive sample site; preserve the raw source and evidence metadata.
4. [ ] Add an equipment/component contract with identity, interface, capacity, revision, and lifecycle status.
5. [ ] Deliver one useful constraint workflow: place a proposed equipment block against site evidence and explain every clearance or conflict finding.
6. [ ] Add a human sign-off ledger before any output can be represented as reviewed, approved, or ready for construction.
7. [ ] Evaluate spatial/3D and VR clients only after the evidence, component, and constraint contracts are working end to end.
