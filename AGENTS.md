# Agents Guide

## Project Overview

Family Tree Pedigree Viewer — a React + TypeScript SPA for visualizing Gramps genealogy data as an interactive hourglass chart.

## Build & Test Commands

```bash
npm run build    # Type-check (tsc) + production build (vite)
npm test         # Run unit tests (vitest)
npm run lint     # Lint with ESLint
npm run dev      # Start dev server
```

## Rules

### Always run tests

Run `npm test` after every code change. All tests must pass before considering work complete. Do not skip or disable tests to make them pass.

### Always type-check

Run `npm run build` (which runs `tsc -b` then `vite build`) to verify there are no type errors. Fix any type errors you introduce.

### Write tests for new logic

When adding or modifying utility functions (anything in `src/utils/`), add or update corresponding tests. Test files live next to their source files with a `.test.ts` suffix (e.g. `treeBuilder.ts` → `treeBuilder.test.ts`).

### Check linter and tests for every increment

Run `npm run lint` and `npm test` after every code change, no matter how small. Do not batch multiple changes before checking — verify after each increment.

### Keep tests green

Never commit code that breaks existing tests. If a change requires updating tests, update them to reflect the new correct behavior — do not delete tests to make the suite pass.

## Project Structure

```
src/
  components/       # React components (PedigreeChart, PersonDetailPanel)
  types/            # TypeScript types (gramps.ts)
  utils/            # Pure logic — parsers, tree builders, layout algorithms
    *.test.ts       # Unit tests (vitest)
```

## Tech Stack

- React 19, TypeScript 5.9, Vite 7
- Vitest for unit tests
- SVG-based chart rendering (no chart library)
- Deployed to Cloudflare Workers (wrangler)
