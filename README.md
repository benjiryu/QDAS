# Accessible QDAS Research Prototype

Research prototype developed with the American Foundation for the Blind through the UCI MHCID program. Not a production system. The full project context — final report, research documents, competitive analysis, design system — lives in the shared Drive folder you already have access to. Read its handoff guide first if you are new to the project. See `CLAUDE.md` for agent instructions and `docs/prototype-scope.md` for what is real and what is simulated.

## For the engineering team

The prototype is a research instrument built to validate the workflow, not a codebase to extend. The target product is native software. Build from the specifications in `docs/`; run the prototype when prose is ambiguous and you need to see the intended behavior.

### What transfers and what does not

**Platform-independent, build from these directly:** the domain model (`docs/domain-model.md`), the workflow state machines (`docs/workflows/`), the acceptance criteria and regression priorities (`docs/testing/`), and the behavioral rules in the accessibility contract (`docs/accessibility-contract.md`) — focus return targets, preserved state on interruption, status feedback, single-panel magnification operation.

**Needs translation:** the accessibility contract's web mechanics. Rules like "no role=application on the page" and "use ARIA live regions for status" are web idioms. Each rule states its platform-agnostic intent; map that intent to your platform's accessibility API (NSAccessibility, UI Automation) rather than discarding the rule as web-specific.

**Does not transfer:** the React/TypeScript/Vite stack, component implementations, and DOM-specific focus management. Do not spend time evaluating these dependencies.

### Documentation map

- `docs/domain-model.md` — entities and their fields. Excerpts store segment IDs and offsets, never only copied text.
- `docs/accessibility-contract.md` — the behavioral floor for focus, announcements, and magnification.
- `docs/prototype-scope.md` — what is real and what is simulated, and the non-goals.
- `docs/pages/` — one specification per screen. Page specs compose patterns; they do not redefine them.
- `docs/patterns/` — the reusable interaction contracts (excerpt selection, code selection, pending assignment, coder comparison). When a page spec and a pattern spec disagree about an interaction, the pattern spec governs.
- `docs/workflows/` — step-by-step flows with their state machines. The coding workflow distinguishes five states that must remain programmatically distinct: current source position, active segment, selected excerpt, pending code assignment, saved code assignment.
- `docs/testing/` — testing strategy, manual testing procedure, and seed data. The regression priorities name the transitions that would invalidate research sessions if broken; treat them as the floor for your test suite.
- `docs/project-management/` — `decision-log.md` (what is settled and why), `unresolved-questions.md` (open decisions by owner), and `build-sequence.md` (the ordered task list the prototype was built against).

### Precedence when specifications conflict

Approved workflow spec, then accessibility contract, then domain model, then recorded design decisions, then prototype scope, then page and pattern specs, then implementation notes. Older workshop concepts and archived wireframes rank below everything. Do not let a mockup override a behavioral decision; the transcript workspace mockup has known inconsistencies, documented in the handoff document in the Drive folder.

### Findings you cannot design around

Three findings are research results, not preferences. Changing them requires new participant sessions:

1. **Backward excerpt selection** — expand backward, expand forward, contract either boundary, as discrete operations, with the range preserved while focus moves into the codebook.
2. **Stable ordering** — no frequency-based reordering of codes, no moving controls. Recent and suggested codes go in separate labeled sections.
3. **Native selection as capture** — participants used native text selection first, and custom transcript structures broke it. Keep transcript text semantically plain so system selection works; the application records the selection into a stable excerpt (segment IDs plus offsets) for persistence and cross-coder comparison. Custom boundary controls are the refinement path, and matter most for users who could only select whole speaker turns natively.

### Where you have latitude

`docs/project-management/unresolved-questions.md` lists open decisions by owner. Questions marked for engineering — architecture, storage of overlapping excerpts, supportable screen reader and browser combinations, codebook change propagation — are yours to answer, recorded in the decision log. Questions marked joint need a conversation before implementation. Anything in the decision log marked approved is settled.

## Setup

Requires Node 20 or later. The Vite baseline is already generated; these are the remaining installs.

```bash
npm install react-aria-components
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
npm install -D @playwright/test @axe-core/playwright
npm install -D eslint-plugin-jsx-a11y
npx playwright install
```

Then verify:

```bash
npm run build
npm run dev
```

## Scripts

```
npm run dev          start the dev server
npm run build        typecheck and build
npm run lint         eslint
npm run test         unit tests
npm run test:e2e     Playwright end-to-end and accessibility smoke tests
```

Use the role switcher in the running prototype to simulate multiple coders; seeded data stands in for AI suggestions and collaborative output. Authentication, sync, file import, and live AI are simulated by design. Before demoing to participants, run the accessibility smoke tests.

## Data

Real deidentified AFB material is never committed. It loads from `./data-local/`, which is gitignored. Committed fixtures are synthetic. See `docs/testing/seed-data.md`.

## Layout

```
docs/            specifications, the source of truth for behavior
src/config/      feature flags and keyboard bindings, single source each
src/domain/      entities and workflow logic, no presentation imports
src/a11y/        shared announcement service
src/data/seed/   synthetic fixtures
scripts/         offline transcript conversion
tests/e2e/       Playwright and axe smoke tests
data-local/      real data, gitignored, never committed
```

## Where to start

`docs/project-management/build-sequence.md` gives the ordered task list.

## Contact

Benji Ryujin — benjiryujin@gmail.com. Design questions and any proposed change to an approved behavior go through the design team while the handoff period is active.
