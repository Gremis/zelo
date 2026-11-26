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

## Canonical migration coordination

This branch preserves the sixteen migrations already recorded in development and production, through `20261122152000`, exactly as in develop commit `b591c8af0a781994ddda74dac06b6d005e57b33f`. Missing baseline files are synchronized without changing the published definitions.

Canonical dependency identities are `20261124120000_create_funcionarios`, `20261124120500_employee_role_seed_backfill`, `20261124121000_public_registration_attempts` and `20261124130000_create_funcionario_rpc`. The employee base is the unchanged ORI-49 definition; the additive seed migration preserves ORI-50 backfill and role-activation behavior. Each branch includes only its applicable dependencies. Do not reintroduce the old employee versions `20261120120000`/`20261120130000` or registration attempts at the employee version.

Uploads retain `20261124160000`. Resident lookup uses `20261126130000`; the original detail migration remains `20261124170000`, with `20261126140000` restoring tracking and workflow fields after workflow migrations. ORI-71 uses `20261126170000` and a separate AI registration RPC, preserving the existing nine-argument rules registration contract and callers.

Coordination order: #32 → #33; #35 → #36 → #37 and #39 → #40 → #41 → #42 follow #33; #43 follows those chains and #38; #44 follows #43; #49 carries the workflow schema prerequisites and final detail compatibility. The #45 → #46 → #47 → #48 AI stack carries the immutable develop baseline. ORI-104 code and migrations `26150000`/`26160000` are deliberately excluded from these publications.

Existing local databases with legacy migration identities must not be reset, repaired or pushed to automatically. Disposable database validation covers fresh installation and upgrade from the sixteen-migration baseline. Actual development/production schema inspection in read-only mode and a separate dry-run for each destination remain necessary before any future remote application. These branch updates do not merge PRs or deploy.

## Employee task access (ORI-104)

Delegating to an employee creates a cryptographically random task code distinct from resident tracking. The server appends the absolute task URL to the existing editable WhatsApp message and persists code, URL and message in the command receipt. `PUBLIC_APP_ORIGIN` is trusted server configuration; browser-supplied origins are rejected. A confirmed receipt is returned unchanged after a lost response even if the configured origin later changes or becomes invalid. WhatsApp opening does not prove delivery.

The own migrations are `20261126150000_employee_task_access.sql` and `20261126160000_trusted_task_origin.sql`. They follow the inherited tracking/detail compatibility migrations. The public task lookup returns only the task's condominium, occurrence number, report, location, reporter name/unit, registration date and task start/completion state. It excludes reporter phone, internal history and resident tracking code. Invalid and unknown codes receive the same generic 404. Completed task codes remain completed after reopening; this feature does not add invalidation on reassignment/deactivation or employee actions.

The `/t/[code]` page will be delivered in the next task. To inspect the backend locally with a database containing this chain and synthetic data, set `PUBLIC_APP_ORIGIN=http://127.0.0.1:3000`, start `npm run dev`, delegate to an employee and use the code from the saved WhatsApp link:

```bash
curl -i http://127.0.0.1:3000/api/public/tasks/REPLACE_WITH_TASK_CODE
curl -i http://127.0.0.1:3000/api/public/tasks/invalid
```

The first returns the restricted JSON for a valid code; the second returns a generic 404. Task routes disable caching and indexing. Do not log or publish real task codes.

Validation covers task-code isolation, private-field exclusion, immutable delegation receipts, completion after reopening and recovery after a lost response. Run database validation only against a disposable stack containing the branch migration chain; preserve the existing local database.
