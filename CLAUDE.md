# Accessible QDAS Research Prototype

This repository contains a research prototype for an accessible qualitative data analysis system, designed with the American Foundation for the Blind through the UCI MHCID program.

This is not a production QDAS. It is a research instrument. Implement only the infrastructure required to test the documented workflows.

## What the prototype evaluates

1. Project entry and navigation
2. Excerpt selection and code assignment
3. Collaborative review and reflexivity

Slice 2 is the current build target. Slices 1 and 3 are scaffolded only.

## Priorities

1. Follow the approved workflow and pattern specifications in `/docs`.
2. Preserve existing unrelated behavior.
3. Use semantic HTML. Reach for React Aria Components only where a standard complex control is genuinely required.
4. Keep domain logic separate from presentation.
5. Maintain predictable focus, ordering, and return behavior.
6. Make small, testable changes.
7. Run relevant tests after every change.
8. Surface specification conflicts. Do not resolve them silently.

Point 8 is the one that matters most. Where a specification is ambiguous, stop and say so rather than choosing. Several open questions in `/docs/project-management/unresolved-questions.md` are methodological decisions belonging to the research team, not implementation details.

## Technical rules

- TypeScript throughout.
- Prefer native HTML elements over ARIA recreation.
- Do not apply `role="application"` to the application or to the transcript.
- Do not use positive `tabindex`.
- Do not rely on color alone to convey state.
- Every keyboard command has a visible control.
- Every temporary view defines focus entry and focus return.
- Every dynamic state has both visible and programmatic feedback.
- Announcements go through the shared live region service in `src/a11y`. Components do not create their own live regions.
- Keyboard chords live only in `src/config/keybindings.ts`. Never hardcode a chord in a component.
- Feature flags live only in `src/config/flags.ts`. Never hardcode a branch that a flag governs.
- Keep seed data separate from UI components.

## Data handling

Real deidentified AFB transcripts and codebooks are used for participant sessions. They are subject to the rules in `/docs/testing/seed-data.md`.

- Real data is never committed to this repository.
- Real data lives in a gitignored local directory and is loaded at runtime.
- Committed fixtures are synthetic.
- Do not paste transcript content into commit messages, issues, test names, or code comments.

If a task appears to require reading real transcript content, stop and ask.

## Source of truth, in order

1. Approved workflow specifications
2. Accessibility contract
3. Domain model
4. Decision log
5. Prototype scope
6. Page and pattern specifications
7. Implementation notes
8. Older mockups, including the current Figma prototype

An earlier sketch never overrides a later behavioral decision. Where this repository and the Figma prototype disagree, the specifications win and the disagreement is recorded in the decision log.

## Commands

```
npm run dev          start the dev server
npm run build        typecheck and build
npm run test         unit tests
npm run test:e2e     Playwright end-to-end and accessibility smoke tests
```

## Documentation map

```
docs/
  prototype-scope.md          what is real, what is simulated
  accessibility-contract.md   global rules every pattern must satisfy
  domain-model.md             entities and relationships
  patterns/                   reusable interaction specifications
  workflows/                  end-to-end user flows
  pages/                      page assemblies
  testing/                    seed data, scenarios, smoke tests
  project-management/         decision log, unresolved questions, build sequence
```
