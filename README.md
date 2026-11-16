# Zelo

Development foundation using Next.js 16.4.6 (App Router), React 19.3.0, TypeScript and Tailwind CSS 4.3.3. The generated application remains unchanged; no business features are implemented.

## Local setup

Use Node.js 24 and npm. `.nvmrc` pins Node.js 24.22.3. With nvm installed:

```bash
nvm install
nvm use
npm ci
npm run dev
```

Open http://localhost:3000. Application files are in `src/app`, and static assets are in `public`. The current homepage runs without environment configuration; Supabase factories require the local values described below when called. Local `.env*` files are ignored; `.env.example` is allowed for future documented sample values. Never commit credentials or real personal data.

## Commands

| Command                | Purpose                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`          | Start the development server.                                                        |
| `npm run format`       | Format supported repository files with Prettier.                                     |
| `npm run format:check` | Check formatting without writing changes.                                            |
| `npm run lint`         | Run ESLint across the project and reject warnings.                                   |
| `npm run typecheck`    | Generate Next.js route types, then run `tsc --noEmit`; works before the first build. |
| `npm run build`        | Create the production build.                                                         |
| `npm start`            | Serve an existing production build locally.                                          |
| `npm audit --omit=dev` | Audit production dependencies.                                                       |

Run formatting and all quality commands before handing off changes. The current layout uses `next/font/google`; a fresh build requires access to Google Fonts.

## Local Supabase

Install and start Docker Desktop or another Docker-compatible runtime. Run all commands from this repository. The exact-version CLI is a development dependency (`supabase@2.122.1`); npm scripts use it locally. Do not install a global CLI or create a separate Docker Compose stack. No Supabase account, login or linked remote project is needed.

On a fresh clone:

```bash
nvm use
npm ci
docker ps --format '{{.Names}}\t{{.Ports}}'
npm run db:start
npm run db:status
cp .env.example .env.local
```

Inspect existing containers and port usage before starting. The project identifier is `zelo-local`. API uses port 54321, PostgreSQL 54322, Studio 54323 and the email testing UI 54324; shadow database operations use 54320. If any required port is occupied, change this project's configuration rather than stopping another stack. The first start downloads Docker images. Do not bypass startup health checks.

On Docker Desktop, select **Settings → Network → Port binding behavior → Localhost by default** before starting the stack. This is a machine-wide Docker Desktop setting that affects default port publishing for other containers too; it is not a project-only setting. Local startup has been verified on the development host with this prerequisite. The dedicated bridge option alone did not restrict publishing on that host.

`db:start` creates or verifies the dedicated `zelo-local-loopback` Docker bridge and passes it to the CLI. It refuses unrecognized networks, existing Zelo containers on other networks and non-loopback host port bindings. If startup or post-start verification fails, it gracefully stops only running containers with the exact `com.supabase.cli.project=zelo-local` label, preserving volumes and networks. Cleanup failures are reported separately from the original error. Pre-start failures do not stop containers.

After startup, verify actual Docker host port bindings:

```bash
docker ps --filter "name=zelo-local" --format '{{.Names}}\t{{.Ports}}'
```

Every published port must bind exclusively to `127.0.0.1` or `[::1]`. Do not proceed if any binding uses `0.0.0.0` or `[::]`; stop only this project's containers and investigate the Docker Desktop prerequisite. The Supabase CLI may still print its general wildcard-binding warning. That warning alone does not verify actual host exposure; use the Docker port output and the startup safety check. Container-internal listeners and loopback service URLs do not establish host binding safety. Do not expose local Studio or forward these ports to a public network.

After a successful start, inspect `npm run db:status` privately. Copy the API URL into `NEXT_PUBLIC_SUPABASE_URL` and the local **anon** key into `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. This setup uses the CLI's legacy anon key. Never copy a service-role key, secret key, access token, database password or connection string into a `NEXT_PUBLIC_` variable or repository file. Status output includes sensitive values; do not paste it into reports or commits. Restart Next.js after changing environment values.

| Command             | Purpose                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm run db:start`  | Start this project's CLI-managed Docker stack and wait for health checks.                               |
| `npm run db:stop`   | Stop this project's stack, preserving local data for the next start.                                    |
| `npm run db:status` | Inspect local service status and connection settings privately.                                         |
| `npm run db:reset`  | Destroy local development data and reapply migrations and seed, explicitly using `--local`.             |
| `npm run db:types`  | Generate public-schema types from the running local database into `src/lib/supabase/database.types.ts`. |

PostgreSQL, the Data API, Auth, Storage, Studio and local email testing are enabled. Realtime, Edge Functions, analytics, the pooler, S3 protocol and vector storage are disabled. Open Studio at http://127.0.0.1:54323 and captured emails at http://127.0.0.1:54324 after startup. Check that `db:start` completes its health checks and that `db:status` shows the enabled services running. Local test emails stay in the local email service.

### Migrations and types

`supabase/migrations` starts empty, and `supabase/seed.sql` is intentionally empty. No domain schema or synthetic migration is included. Create future reviewed schema changes with:

```bash
npx --no-install supabase migration new describe_change
```

Edit the new SQL migration before applying it, review it, then apply pending migrations locally with `npx --no-install supabase migration up --local`. Never edit an already applied historical migration; add a new migration instead. Keep seed data synthetic and free of credentials and personal data.

Run `npm run db:types` only after the local database is running and after schema changes. Generation captures output before writing, formats it and atomically replaces the destination; a failed generation leaves existing types untouched. No database types are fabricated before generation. Factories are currently schema-agnostic; add the generated `Database` generic when schema-backed application work starts.

`npm run db:reset` is destructive: it destroys local development data and rebuilds the database from migrations and seed. Run it only when you intentionally need a clean local database; it is not a routine validation command. Never add remote targets to this script.

### Client factories and environment boundaries

Import `createClient` from `@/lib/supabase/client` for browser code or from `@/lib/supabase/server` for server code. The server factory is asynchronous, request-scoped and protected by `server-only`. Configuration is validated when a factory is called, not during module import. The existing homepage does not call either factory.

The server factory follows the SSR `getAll`/`setAll` cookie adapter and tolerates read-only Server Component cookie writes. No proxy, login flow, authorization or session-refresh integration is implemented. Do not rely on these factories alone for authenticated sessions; implement refresh handling and response cache headers with authentication later. No privileged admin client exists.

Local Docker volumes and credentials are independent from any future hosted environments. Local commands do not link remote projects. Only the reviewed deployment job described below may connect to an environment-specific Session pooler and apply versioned migrations. Never use remote reset, remote seed or automatic migration repair.

References: [Supabase local development](https://supabase.com/docs/guides/local-development/cli/getting-started), [CLI configuration](https://supabase.com/docs/guides/local-development/cli/config), and [SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## Testing

Vitest uses jsdom, React Testing Library and jest-dom. Unit/component tests live in `tests/unit/**/*.test.{ts,tsx}` and support the `@/` alias. The homepage smoke test renders the existing synchronous component without Next.js mocks and checks its main heading by accessible role. Async Server Components belong in browser tests.

```bash
npm test
npm run test:watch
```

Install Playwright's Chromium browser once after installing dependencies (and again when the required browser version changes):

```bash
npx playwright install chromium
```

On Linux, browser system dependencies may also be required: `npx playwright install --with-deps chromium`.

```bash
npm run test:e2e
npm run test:e2e:ui
```

Both browser commands build the application first. Playwright discovers only `tests/e2e/**/*.spec.ts`, uses Chromium, and starts and stops the production server at `http://127.0.0.1:3100`. Port 3100 must be free; an existing server is rejected. The tests verify the homepage heading and an unknown route's HTTP 404 response and heading. No external application services or credentials are required.

Failure traces are retained in `test-results`; the HTML report is in `playwright-report`. Both are ignored by Git and Prettier. Open the report with `npx playwright show-report`. Exclusive tests are rejected when `CI` is set. No coverage threshold is configured.

## Continuous integration

`.github/workflows/ci.yml` runs the stable `Quality` job on pull requests targeting `main` or `develop`, pushes to those branches and manual dispatch. It installs dependencies with `npm ci`, then checks formatting, lint, types, unit tests and the production dependency audit (`npm audit --omit=dev --audit-level=moderate`), installs Chromium and runs `test:e2e`, which builds production code before browser tests. No database or Supabase credentials are required.

Failed runs upload only existing Playwright reports and test results, excluding environment files, for three days. Superseded Quality jobs for the same PR or branch are cancelled. PRs and manual dispatch run validations only, without deployment credentials or remote migrations. Pushes to the permanent branches can deploy only after Quality succeeds. Branch protection must be configured separately; remote pipeline execution remains unverified until exercised on GitHub. Use `.github/pull_request_template.md` to describe changes and validation.

## Deployment pipeline

The deployment job in `.github/workflows/ci.yml` runs only for successful `push` validations on the permanent branches:

| Branch    | GitHub Environment | Vercel project | Vercel target |
| --------- | ------------------ | -------------- | ------------- |
| `develop` | `development`      | `zelo-dev`     | Production    |
| `main`    | `production`       | `zelo-prod`    | Production    |

There is no `stage` branch. Keep the existing GitHub Environment branch restrictions: `development` allows only `develop`; `production` allows only `main`. Each environment must have its own configuration and credentials:

| Kind      | Names                                                                           | Purpose                                                                                        |
| --------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Variables | `SUPABASE_PROJECT_ID`, `SUPABASE_DB_HOST`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Select the matching Supabase project, Session pooler hostname and Vercel organization/project. |
| Secrets   | `SUPABASE_DB_PASSWORD`                                                          | Authenticate migrations against only that environment's Session pooler.                        |
| Secret    | `VERCEL_TOKEN`                                                                  | Pull settings, build and publish only that environment's Vercel project.                       |

The workflow uses the exact locked `vercel@65.16.0` CLI (Node >=20, compatible with Node 24) and `supabase@2.122.1`. It checks out the validated commit and installs with `npm ci`. Vercel settings and environment variables are pulled with `vercel pull --environment=production`, then `vercel build --prod` prepares `.vercel/output` before any remote database operation. Both Vercel projects use Production internally; GitHub's `development` does not mean Vercel Preview.

Because the build runs before migrations, build-time code (including prerendering and static generation) must not query tables or columns created only by those pending migrations. Defer such queries to request time or introduce the schema in an earlier backward-compatible release; do not move migrations ahead of the build to bypass this constraint.

After a successful build, the helper `scripts/deploy-migrations.mjs` uses an explicit `--db-url` for the environment's shared Session pooler: hostname from `SUPABASE_DB_HOST`, port `5432`, database `postgres` and username `postgres.<SUPABASE_PROJECT_ID>`. Set the hostname only, such as the Session pooler host shown in the Supabase Connect panel, without a scheme, credentials, port or path. The helper validates the project reference and `*.pooler.supabase.com` hostname, percent-encodes the raw password exactly once and requires TLS with `sslmode=require`. This mode enforces encryption but does not add CA/hostname verification; certificate-pinned verification would require separate CA configuration.

Both calls use `--dns-resolver https`: the pinned CLI queries Cloudflare DNS-over-HTTPS (default record type A) for IPv4 addresses, avoiding the direct database's IPv6-only endpoint. This adds a dependency on outbound HTTPS access to `1.1.1.1`. The workflow no longer calls `supabase link`, uses `--linked` or needs `SUPABASE_ACCESS_TOKEN`; an existing environment access-token secret can remain unused or be removed after confirming no other workflow needs it.

The helper first invokes `db push --db-url ... --dry-run --skip-vault --yes`, then a separate step invokes the same target without `--dry-run`. It applies only pending versioned migrations: no seed, custom roles, vault updates, reset, automatic history repair or example migrations. It registers GitHub masks for the raw password, encoded password and full URL before starting the CLI. The helper invokes the public `node_modules/.bin/supabase` executable and captures stdout/stderr before logging sanitized connection diagnostics, pending migration listings and success/failure messages. Raw and encoded passwords and PostgreSQL connection URLs are redacted; terminal escape sequences and workflow-command markers are neutralized. Raw subprocess errors are never printed. A failed CLI command preserves its exit code; startup errors or signals fail with code 1. Investigate remaining connection settings privately without enabling credential-bearing logs.

A failure blocks publication. Only after both migration steps succeed does `vercel deploy --prebuilt --prod` publish the prepared output. The deployment job uploads no artifacts and removes `.vercel` and CLI temporary state on exit. These directories and environment files remain ignored.

Vercel Production application settings must match the corresponding Supabase environment, including `NEXT_PUBLIC_SUPABASE_URL` and the public `NEXT_PUBLIC_SUPABASE_ANON_KEY` when clients are used. Do not put the database password or an access token or privileged keys in public variables, Vercel build settings or versioned files. Public Next.js values are embedded at build time; build separately for each project. Never print environment values or enable shell tracing around credentialed commands. Secrets are scoped to the steps that need them, rather than job-wide environment variables.

### Ordering and recovery

A separate concurrency group serializes deployments for each environment with `cancel-in-progress: false`. New pushes do not cancel active migrations or publications. GitHub may replace pending jobs and does not guarantee queue order, so the job verifies that its commit is still the branch HEAD before build, before migrations and before publication. Obsolete or unverifiable runs fail closed, including old reruns. A newer push after the final check may arrive while publication is in flight; its deployment waits for the current job, so this pipeline cannot publish an older run over its already completed newer run. Manual deployments or other workflows do not share this guarantee and must not bypass the pipeline.

There is no transaction spanning Supabase and Vercel. If migrations succeed but publication fails or the commit becomes obsolete, the database may be ahead of the live application. Use backward-compatible expand/contract migrations so the existing app keeps working. Inspect migration history and deployment state privately; fix forward through reviewed migrations and deploy the current branch HEAD. A Vercel rollback does not roll back the database. Do not automatically reverse migrations, reset the remote database, repair history or reapply seed data. Manual cancellation, runner loss and timeouts can also leave partial progress; inspect both systems before retrying. Database backup/restore procedures and post-deploy application health checks remain separate operational work.

### Activation and proof

1. Review the workflow and environment mappings without revealing credentials. Confirm Node 24, the Next.js preset and Production application variables in both Vercel projects. Keep privileged deployment credentials only in their matching GitHub Environment and restrict who can modify protected branches, workflows and environment approvals.
2. Coordinate a transition window before merging this pipeline to `develop`. Pause/disconnect automatic Git deployments for both Vercel projects through their Git integration settings and inspect any already queued Git-triggered deployments. This prevents older branches without the new configuration from publishing during the transition; existing live deployments stay available.
3. `vercel.json` sets `git.deploymentEnabled` to `false` for all branches. It takes effect for Git events whose commit contains the file; it does not change dashboard settings from this working tree or cancel already queued deployments. Carry this configuration through `develop` and `main` before considering the transition complete. Leave automatic Git deployments disabled afterward; CLI deployments remain the publication path.
4. After the reviewed changes reach `develop`, confirm the PR ran Quality only, then confirm its push ran Quality followed by Deploy in `development`, targeting `zelo-dev`. Inspect the build-before-migrations sequence, dry-run, migration history and deployed commit, then open the application's URL and check its heading. Do not invent a migration to exercise the pipeline; an empty pending migration set is valid.
5. Promote through a reviewed PR to `main` and repeat the checks for `production` and `zelo-prod`. Confirm no parallel Git-integration deployment appeared. Check that obsolete reruns are blocked and new pushes do not cancel an active deployment. No remote checks are claimed by local validation.

Renew tokens before expiration and whenever access changes or exposure is suspected. Create replacement credentials with the minimum provider-supported access, update only the matching GitHub Environment secret, verify through an authorized current-HEAD deployment, then revoke the old token. The migration connection uses only the database password; SUPABASE_ACCESS_TOKEN is not consumed by this pipeline. Rotate the remote database password in Supabase and its matching `SUPABASE_DB_PASSWORD` secret in a coordinated window. Do not copy development tokens into production, rotate credentials in repository files or paste values into logs/issues. Provider outages, credential expiry and service authorization failures stop the pipeline and require operator intervention.

References: [Vercel build](https://vercel.com/docs/cli/build), [prebuilt deployments](https://vercel.com/docs/cli/deploy), [Git deployment configuration](https://vercel.com/docs/project-configuration/git-configuration), and [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

## Conventions

Use English for code, configuration and repository documentation, and Brazilian Portuguese for user-facing interface text. The generated starter text is retained for this foundation step. See AGENTS.md for project and installed Next.js documentation instructions.

The permanent branches `main` and `develop` already exist. Start new task branches from `develop` and submit changes through a PR to `develop`. Promote releases from `develop` to `main` through a reviewed PR.

## Pending setup and known limitations

The deployment pipeline is configured but remote execution and recovery procedures require operational verification. Database integration tests are not configured. Authentication and other business features are outside this foundation.

The known full dependency audit issue is GHSA-g3hv-75wg-m249 through `@typescript-eslint/typescript-estree` to `minimatch@10.2.6`. The checked `typescript-eslint@8.72.2` still requires `^10.2.2`. The production-only audit is the blocking audit in this initial CI; it does not audit all development dependencies or establish that the complete dependency tree is free of vulnerabilities. No overrides or advisory suppression are configured.
