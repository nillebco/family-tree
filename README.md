# Family Tree Pedigree Viewer

A web application for visualizing genealogical data as an interactive hourglass chart. Load data exported from [Gramps](https://gramps-project.org/) and explore your family tree with ancestors, descendants, and siblings.

## Features

- **Hourglass chart** — ancestors above, selected person at center, descendants below
- **Interactive SVG** — mouse wheel zoom, click-drag panning, reset view
- **Expandable siblings & children** — reveal siblings and their families on demand
- **Person detail panel** — click any node to see vital events, parents, spouse, and children
- **Adjustable ancestor depth** — choose how many generations to display (1–8)
- **Privacy controls** — toggle individuals as private; hide them unless `?private` is in the URL
- **NDJSON export** — download your modified data back to Gramps-compatible NDJSON

## Getting Started

```bash
npm install
npm run dev
```

Open the app in your browser, load a Gramps NDJSON file, select a person, and explore the chart.

## Data Format

The app reads **NDJSON** (Newline Delimited JSON) files exported from Gramps, containing persons, families, events, and places.

## Tech Stack

React, TypeScript, Vite, SVG (no chart library — custom layout algorithms), Vitest.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Type-check and build for production |
| `npm run test` | Run unit tests |
| `npm run lint` | Lint with ESLint |
