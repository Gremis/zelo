# Zelo

Condominium occurrence management built with Next.js, React, TypeScript, Tailwind CSS and Supabase.

## Local setup

Use Node.js 24 (version pinned in `.nvmrc`), npm and Docker Desktop. Before starting Supabase, configure Docker Desktop port binding to **Localhost by default** and check that the project ports (54320–54324) are available.

```bash
nvm install
nvm use
npm ci
cp .env.example .env.local
npm run db:start
npm run db:status
```

Fill `.env.local` with the local Supabase keys reported by `db:status`. Keep the service-role key server-only; only the API URL and anon key belong in public Supabase variables. Never commit credentials or share status output.

Verify that this project's published Docker ports bind only to `127.0.0.1` or `[::1]` before continuing.

```bash
npm run dev
```

Open http://localhost:3000. Set `PUBLIC_APP_ORIGIN` in `.env.local` to the origin used by the application.

## Essential commands

| Command            | Purpose                                            |
| ------------------ | -------------------------------------------------- |
| `npm run dev`      | Start development.                                 |
| `npm run build`    | Build for production.                              |
| `npm start`        | Serve the production build.                        |
| `npm run db:stop`  | Stop the local database stack, preserving data.    |
| `npm run db:types` | Regenerate types from the running local database.  |
| `npm run db:reset` | Delete local data and reapply migrations and seed. |

Keep schema changes in new files under `supabase/migrations`; never edit applied migrations. Database scripts target the local stack.

## Validation

```bash
npm run format
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
npx playwright install chromium
npm run test:e2e
```

Unit tests live in `tests/unit`; browser tests live in `tests/e2e`. Playwright builds production code and requires port 3100 to be free. Tests that require local services use explicit opt-ins defined in their test files. A fresh build requires access to Google Fonts.

## Delivery

Open pull requests to `develop`; promote releases through reviewed pull requests from `develop` to `main`. GitHub Actions validates changes and deploys successful pushes to those branches to their respective environments. Repository conventions are in `AGENTS.md`.
