# Testing Strategy

- Status: Standing document
- Version: 1.0
- Last updated: 2026-08
- Companion documents: `manual-testing.md` for procedures, `accessibility-contract.md` section 4 for the pre-session smoke test, `seed-data.md` for fixtures and reset

Five layers, ordered by altitude. Each is cheapest at its own level, and severity flows downward: the manual layer catches what would end a participant session, end-to-end catches what would invalidate one, component tests catch what would waste a build day, unit tests catch what would corrupt data, and static analysis catches what should never compile.

## 1. Static analysis

**Engines:** TypeScript (`tsc`, runs inside `npm run build`), ESLint 10 with `eslint-plugin-jsx-a11y`, Prettier for formatting.

Type checking eliminates identifier and shape mistakes before execution: a `segmentId` where a `turnId` belongs, a flag value that does not exist, a domain field misspelled. The jsx-a11y rules catch static accessibility mistakes at lint time: missing alternative text, click handlers on non-interactive elements, invalid ARIA attributes.

Good for: removing whole classes of defect at zero runtime cost.
Blind to: everything dynamic. Focus, announcements, state, and layout are invisible here.

## 2. Unit tests

**Engine:** Vitest, running pure functions in Node. `npm run test`.

The domain layer (segment resolution, excerpt operations, display-state derivation), the keybinding tables and their collision guard, the seed fixture's shape requirements, and the token rules all live here.

Two tests in this layer are policy, not plumbing, and deserve protection in review:

- `keybindings.test.ts` asserts no two commands share a chord, on both platform tables.
- `tokens.test.ts` fails if any file outside `tokens.css` contains a hex color literal, which is the enforcement of the tokens-only styling rule.

Good for: correctness where it is cheapest to establish and most expensive to retrofit, and for encoding decisions as executable law rather than review checklist items.
Blind to: the DOM, the browser, and anything visual.

## 3. Component tests

**Engines:** Vitest with `jsdom` as the simulated DOM, `@testing-library/react` for rendering and queries, `@testing-library/user-event` for realistic interaction, `@testing-library/jest-dom` for assertions.

The largest layer. Testing Library's discipline matters to this project specifically: it queries by role, accessible name, and heading level, the same interface assistive technology consumes, so a component that passes these tests has a sound accessibility tree almost by construction. The code rail's absence from the accessibility tree, the codebook's heading hierarchy, counts fused into accessible names, and the D-044 state-survival round trip are all asserted here.

Good for: fast, precise behavioral assertions on one component or one interaction, hundreds running in seconds inside the one-task-one-commit loop.
Blind to: layout. jsdom computes no geometry, so reflow, 400 percent zoom, focus visibility, sticky positioning, and any two regions colliding cannot be tested at this layer, no matter how the test is phrased.

## 4. End-to-end

**Engines:** Playwright driving real Chromium against the production build (`vite preview`), with `@axe-core/playwright` riding inside it. `npm run test:e2e`.

The specs in `tests/e2e/` cover the transitions whose failure would invalidate a research session: the full coding journey, save-failure recovery with nothing lost, the context menu, capture, orientation, destinations, and a whole-app pass. The axe scan runs per route and catches WCAG violations expressible in markup: missing names, broken roles, contrast.

The configuration runs Chromium only. This is a deliberate economy rather than an oversight: Safari coverage happens manually under VoiceOver, where the pairing actually matters, and Firefox-specific risks in this project are keyboard-layer risks that no browser automation would surface anyway.

Good for: integration truth. Routing, real focus management, scrolling, and cross-component behavior are genuine here rather than simulated.
Blind to: most real accessibility problems, which are workflow rather than markup. An interface can pass every axe scan and still be unusable with a screen reader.

## 5. Manual verification

**Instruments:** VoiceOver on Safari with the caption panel, per `manual-testing.md`, for the per-task check. The participant's own screen reader and browser, JAWS or NVDA included, for the pre-session gate per D-024 and T-5. The twelve-item smoke test in the accessibility contract before every session.

This layer owns what the stack below cannot reach: whether announcements are actually spoken and queue audibly, whether the capture announcement and the turn-fallback announcement are unmistakably different by ear, whether focus is findable at 400 percent zoom, whether browse-mode keys survive a given screen reader, and whether the workflow makes sense, which is the research question itself.

## What about screen reader automation, such as Guidepup?

A correction to a claim this project's documents have made loosely: it is not true that no tool can observe screen reader output. Guidepup and similar drivers control real VoiceOver and NVDA instances programmatically, capture their spoken phrases as text, and integrate with Playwright. Assertions like "after this keystroke, NVDA said 'No selection detected'" are technically possible.

It was considered and not adopted, for reasons that are economic rather than principled, and that a successor team with different infrastructure should feel free to revisit:

- **It cannot replace the manual gate, only supplement it.** The per-session requirement is the participant's own configuration, including JAWS, which Guidepup does not drive. The manual layer stays regardless, so automation adds a layer rather than removing one.
- **Infrastructure cost is real.** VoiceOver automation needs macOS with AppleScript control enabled in VoiceOver Utility; NVDA automation needs a Windows environment. Neither runs in an ordinary CI container, execution is serial and slow, and timing flakiness is endemic. During this prototype's development there was one macOS machine and no Windows machine until session preparation.
- **Flaky tests poison the loop.** The one-task-one-commit discipline depends on red meaning broken. A speech assertion that fails intermittently on timing would erode that faster than it adds coverage.
- **The highest-value target is narrow.** If this is ever adopted, the right scope is small: the two capture announcements of excerpt-selection.md section 1.2 and the announcement queue under rapid input, on NVDA specifically, since NVDA-on-Windows is the development team's blind spot while VoiceOver is checked by hand routinely. A handful of speech assertions run before each session cut, not in every CI run, would close the largest genuine gap in this stack at tolerable cost.

Recorded here so the choice reads as a decision with a revisit path, not a gap nobody noticed.

## Running everything

```
npm run build        static layer, types and bundling
npm run lint         eslint with jsx-a11y
npm run test         unit and component layers
npm run test:e2e     Playwright and axe, against the preview build
```

Manual procedures: `manual-testing.md`. Session gate: `accessibility-contract.md` section 4, on the participant's configuration, with data reset per `seed-data.md` section 5.
