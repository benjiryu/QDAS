# Accessible QDAS Research Prototype

Research prototype developed with the American Foundation for the Blind through the UCI MHCID program. Not a production system. See `CLAUDE.md` for agent instructions and `docs/prototype-scope.md` for what is real and what is simulated.

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
