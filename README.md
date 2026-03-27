# Deeproot

Goal decomposition tool. Break down ambitious goals into their dependencies, constraints, and actions — then track your way through them.

## Features

- **Typed nodes** — Goal, Constraint, Consideration, Action
- **Status tracking** — Open, Active, Blocked, Done
- **Dependency tree** — Visual hierarchy with curved connection lines
- **Pannable canvas** — Click and drag to navigate
- **URL persistence** — State encoded in the URL hash, shareable and bookmarkable
- **PNG export** — Download your map as a high-res image
- **Actions panel** — Sidebar view of all action items across the map

## Getting started

```bash
bun install
bun run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start dev server |
| `bun run build` | Type-check and build for production |
| `bun run lint` | Run ESLint |
| `bun run serve` | Preview production build |

## Stack

React, TypeScript, Vite, Bun
