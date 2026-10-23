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
- Owner authentication: Replit-managed Clerk, with server-side verified-email authorization
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Frontend: React + Vite
- Browser automation: Playwright Chromium
- Build: esbuild (ESM server bundle)

## Where things live

- `artifacts/chromium-runner/` — frontend and browser controls.
- `artifacts/api-server/` — Express API, live WebSocket sessions, and Chromium network safeguards.
- `lib/db/src/schema/` — saved browser profiles, community chat, and consenting visitor activity.
- `lib/api-spec/` — OpenAPI contract; generated clients and validation live in `lib/api-client-react/` and `lib/api-zod/`.

## Browser-local features

- The tab disguise controls the tab title and favicon across all routes. Owner dashboard and sign-in pages must not override the visitor's chosen appearance. This does not disguise the URL, browser history, or recorded activity.
- Disguise presets are New Tab, Word document and Clever, using the supplied brand icons. Retired Notes/Calculator presets migrate without replacing custom titles.
- The pet companion, selected look, tucked-away state and movable bed position are saved locally in the visitor's browser; pet state is not uploaded or added to activity logs. Required site activity logging still applies independently.
- The pet avatar is smaller and can be a hedgehog, fox, bunny or frog. Visitors can drag it into its movable bed to pause roaming, or click the bed to tuck it in and let it back out.
- Keep browser back/forward/reload, chat and address controls in the top bar. The remaining workspace, disguise and session/settings controls live in the expandable right-edge tools panel.
- Visit-log text downloads are newest-first. Chat-log text downloads retain their existing chronological order.

## Architecture decisions

Keep the imported workspace structure and stack. Development traffic goes through the shared path-based proxy; do not add a separate frontend-to-backend proxy.

## Product

The browser supports website navigation, pointer and keyboard input, back/forward, reload, and encrypted saved cookies/site data. Private and reserved destinations are blocked. At most two remote browser sessions run concurrently; idle sessions expire after ten minutes.

## Owner activity and privacy

- The browser and shared chat do not require sign-in, but visitors must explicitly accept the disclosed activity logging before accessing either. Declining keeps the access screen locked; there is no dismiss-to-continue option.
- `/owner` requires Clerk sign-in using a verified address matching the shared `OWNER_EMAIL` environment variable. Do not hardcode an email or grant the first signup owner access. Development and production have separate Clerk accounts; use the configured address in each environment.
- Clerk credentials are provisioned automatically. Keep the canonical `/api/__clerk` proxy mounted before body parsing and forward `VITE_CLERK_PROXY_URL` unchanged; development intentionally has no proxy URL.
- Visitors must explicitly opt in before an activity ID is issued. The identifier is a random, signed browser-profile UUID, not an IP address, MAC address, fingerprint, or proven person/physical device. Clearing cookies or switching browsers creates a new identity.
- Consenting chat messages are linked by ID; consented main-frame page navigations record origin/path, never credentials, query strings or fragments. No keystrokes are logged.
- Withdrawing acceptance revokes the identifier server-side, ends active remote browser sessions, and blocks browser/chat access until acceptance is given again. Previously recorded entries remain. Chat messages are shared with visitors who have accepted logging.
- Enforce acceptance on the server for chat reads/writes, single-page browser runs and WebSocket upgrades; bind socket logging to the validated cookie identity, never a client-selected identity. Revoke same-instance sessions immediately and check cross-instance revocation without putting database calls in the ordered keyboard/pointer pipeline. Owner sign-in and private administration remain accessible independently of visitor acceptance.
- Chat and browsing records are stored durably in the database. Protected `/api/owner/logs/chat.txt` and `/api/owner/logs/visits.txt` stream timestamped UTF-8 downloads on demand; deployment-local files are not used as durable storage or synced into the project workspace.
- `/owner` polls for newly opted-in browser profiles every ten seconds while open. Review state is persistent; notifications are in-app, not email/push alerts.
- API startup performs additive, idempotent chat/activity table setup in each environment. Schema definitions remain in `lib/db`.

## User preferences

The import setup request is to get the existing app running on Replit, without restructuring it.

## Gotchas

- The API dev command cleans and rebuilds its output before starting. Do not run a standalone API build concurrently with its workflow startup.
- Playwright downloads Chromium on the first API build. Its Linux libraries are declared in `.replit`.
- Keep `PLAYWRIGHT_BROWSERS_PATH=0` consistent in API build and runtime commands. This installs Chromium alongside Playwright inside `node_modules`, rather than the `.cache` directory omitted from published apps.
- Both `/api` and `/api/browser/ws` must remain routed to the API service.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
