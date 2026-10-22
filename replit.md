# Chromium Browser Runner

Open public websites in server-side Chromium, interact with a live browser stream, and save encrypted browser profiles for each device.

## Run & Operate

- Install dependencies: `pnpm install --frozen-lockfile`.
- Use the existing managed workflows together: `artifacts/api-server: API Server` and `artifacts/chromium-runner: web`. The Run button starts the project; open the Chromium Browser Runner preview at `/`.
- `pnpm --filter @workspace/api-server run dev` — install Playwright Chromium, build, and run the API server (port 8080, routes under `/api`).
- `pnpm --filter @workspace/chromium-runner run dev` — run the React frontend. The managed workflow supplies `PORT=24927` and `BASE_PATH=/`.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required environment: `DATABASE_URL` (runtime-managed PostgreSQL connection) and `SESSION_SECRET` (workspace secret used to protect saved profiles). Never commit either value. Keep `SESSION_SECRET` stable to preserve access to existing profiles.
- After a fresh import, run `pnpm --filter @workspace/db run push` to apply the existing schema to the development database.
- Health check: `GET /api/healthz`. Interactive sessions use `/api/browser/ws`; single-page captures use `POST /api/browser/run`.
- The Canvas/mockup sandbox is optional and is not required to run this app.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Frontend: React + Vite
- Browser automation: Playwright Chromium
- Build: esbuild (ESM server bundle)

## Where things live

- `artifacts/chromium-runner/` — frontend and browser controls.
- `artifacts/api-server/` — Express API, live WebSocket sessions, and Chromium network safeguards.
- `lib/db/src/schema/` — saved browser-profile schema.
- `lib/api-spec/` — OpenAPI contract; generated clients and validation live in `lib/api-client-react/` and `lib/api-zod/`.

## Architecture decisions

Keep the imported workspace structure and stack. Development traffic goes through the shared path-based proxy; do not add a separate frontend-to-backend proxy.

## Product

The browser supports website navigation, pointer and keyboard input, back/forward, reload, and encrypted saved cookies/site data. Private and reserved destinations are blocked. At most two remote browser sessions run concurrently; idle sessions expire after ten minutes.

## User preferences

The import setup request is to get the existing app running on Replit, without restructuring it.

## Gotchas

- The API dev command cleans and rebuilds its output before starting. Do not run a standalone API build concurrently with its workflow startup.
- Playwright downloads Chromium on the first API build. Its Linux libraries are declared in `.replit`.
- Both `/api` and `/api/browser/ws` must remain routed to the API service.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
