# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**weekwise** is a weekly planner with a habit tracker and an AI weekly review. You plan your week
by category (Mon–Sun), check off habits day by day, and at the end of the week Claude reviews how
it actually went — planned vs. done, habit completion, category balance — and gives concrete
suggestions for next week.

It is a single-page React app (Vite). All user data lives in the browser's `localStorage` (no
login, no database). One serverless function proxies Anthropic to keep the API key server-side.

## Commands

```bash
npm run dev      # Vite dev server (frontend only — see note below)
npm run build    # production build to dist/
npm run preview  # preview the production build
```

There is no test suite, linter, or formatter configured.

**Important for local dev:** `npm run dev` only serves the frontend. The `/api/*` route is a
Vercel serverless function and is NOT served by Vite. To exercise the AI weekly review locally,
run with the Vercel CLI (`vercel dev`) so the `api/` function is available.

## Architecture

### Frontend — one big component
Nearly the entire UI lives in `src/Weekwise.jsx`. It is a single stateful component with a `view`
state machine (`planner | habits | review | manage`) rather than a router. When adding UI, follow
this pattern — there is no routing library. `App.jsx` and `main.jsx` are trivial wrappers. All
styling is in `src/index.css` (plain CSS, no framework).

### State — localStorage only
All data is persisted to `localStorage` via the `useLocalStorageState` hook, keyed with a
`weekwise_` prefix:
- `weekwise_categories` — `[{ id, name, color }]`
- `weekwise_tasks` — `[{ id, weekStart, day, categoryId, title, done }]` (`day` is 0=Mon..6=Sun)
- `weekwise_habits` — `[{ id, name, categoryId }]`
- `weekwise_habitLogs` — `{ [habitId]: { [dateISO]: true } }`
- `weekwise_reviews` — `[{ id, weekStart, result, generatedAt }]` (one cached AI review per week)

Week math: `getWeekStart(date)` returns the Monday (ISO date string) of that date's week;
`weekDays(weekStart)` returns the 7 day dates. `currentWeekStart` state drives prev/next
navigation and scopes which tasks/habit logs are shown.

### The API proxy layer (`api/`)
- **`api/claude.js`** — the brain. A single handler dispatched by an `action` field in the POST
  body. The only action is `weekly_review`: it receives pre-aggregated week data (tasks done/total
  per category, habit completion counts) and **must return raw JSON** (extracted via a
  `/\{[\s\S]*\}/` regex and `JSON.parse`d). Keep the strict "respond ONLY with valid JSON, no
  markdown" instruction or parsing breaks. CORS is keyed off the `ALLOWED_ORIGIN` env var.

## Environment variables

Server-side (serverless function — never `VITE_` prefixed):
- `ANTHROPIC_API_KEY` — used by `api/claude.js`
- `ALLOWED_ORIGIN` — CORS lock; `*` for local dev, the deployed URL in prod

There are no client-side (`VITE_`) variables — all state is local to the browser.
