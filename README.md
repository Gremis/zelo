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

`supabase/migrations` contains the reviewed profile, condominium and confirmation-guard migrations. `supabase/seed.sql` is intentionally empty. Create future reviewed schema changes with:

```bash
npx --no-install supabase migration new describe_change
```

Edit the new SQL migration before applying it, review it, then apply pending migrations locally with `npx --no-install supabase migration up --local`. Never edit an already applied historical migration; add a new migration instead. Keep seed data synthetic and free of credentials and personal data.

Run `npm run db:types` only after the local database is running and after schema changes. Generation captures output before writing, formats it and atomically replaces the destination; a failed generation leaves existing types untouched. No database types are fabricated before generation. Factories are currently schema-agnostic; add the generated `Database` generic when schema-backed application work starts.

`npm run db:reset` is destructive: it destroys local development data and rebuilds the database from migrations and seed. Run it only when you intentionally need a clean local database; it is not a routine validation command. Never add remote targets to this script.

### Client factories and environment boundaries

Import `createClient` from `@/lib/supabase/client` for browser code or from `@/lib/supabase/server` for server code. The server factory is asynchronous, request-scoped and protected by `server-only`. Configuration is validated when a factory is called, not during module import. The existing homepage does not call either factory.

The server factory follows the SSR `getAll`/`setAll` cookie adapter and tolerates read-only Server Component cookie writes. The proxy refreshes sessions and preserves cookie/cache headers. Private pages and APIs must also verify the identity on the server; the factory and proxy alone do not grant access. The confirmation guard uses a server-only privileged RPC request as described below; no privileged browser or admin application client exists.

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

The deployment pipeline is configured but remote execution and recovery procedures require operational verification. The general Quality job requires no database credentials. Optional local Auth integration and SQL checks are described below; hosted SMTP delivery and provider-wide enforcement remain pending.

The known full dependency audit issue is GHSA-g3hv-75wg-m249 through `@typescript-eslint/typescript-estree` to `minimatch@10.2.6`. The checked `typescript-eslint@8.72.2` still requires `^10.2.2`. The production-only audit is the blocking audit in this initial CI; it does not audit all development dependencies or establish that the complete dependency tree is free of vulnerabilities. No overrides or advisory suppression are configured.

## Signup confirmation integration (ORI-47)

The real flow calls `/api/auth/signup`, `/api/auth/confirm-signup` and
`/api/auth/resend-signup`. Supabase verifies the signup OTP and establishes the
SSR cookie session. The browser checks `/api/auth/session` before navigating to
`/fila`. After successful code verification, temporary session-check failures
can be retried without submitting the consumed code again. The verified session
must match the registration email; an inactive or mismatched session offers login
instead of granting access. Queue access also validates the confirmed identity on the server;
`/api/panel` additionally requires the account's protected `is_sindico` profile
and filters condominium counts by the current identity. Logout uses the real
Supabase session endpoint and refreshes client navigation state. The login form
uses the existing login API and returns to the protected queue. The existing
keep-connected checkbox does not yet select a distinct server session lifetime.

Panel identity and first steps use the protected API even when development mock
flags are present. Component mocks remain available as explicit test fixtures.
A simulated signup is not an authenticated session and cannot unlock `/fila`.
First-step dismissal affects only the current rendered panel; per-account
persistence belongs to ORI-48. Only the condominium step can be derived from the
existing database. Employee registration, resident-link delivery, occurrence
history and their navigation destinations remain unavailable.

The implemented confirmation policy is a six-digit, single-use code valid
for 15 minutes, five incorrect application verification attempts followed by a
15-minute block, and at least 60 seconds between sends. A resend must invalidate the previous provider code. The
local Auth configuration requires eight password characters containing an ASCII letter
and a digit. Check the same policy in the hosted project's Auth settings;
repository configuration does not automatically update hosted Auth.

The application guard calls only the `email_confirmation_guard` RPC using a
server-only service-role credential. It does not create an admin browser client
or expose privileged credentials in public variables. Its two existing migrations
must be present before real signup. This key has broader provider privileges than
the RPC needs; keep its use isolated and consider a dedicated restricted backend
credential before expanding this integration. The guard does not prevent direct
calls to Supabase Auth with the public key. Application attempt limits therefore
do not establish global provider enforcement; configure and verify provider rate
limits separately. Do not claim a global five-attempt guarantee.

### Hosted development email setup

In the intended development Supabase project, open Authentication, Email, SMTP
Settings and configure custom SMTP directly in the dashboard:

- Host: `smtp.gmail.com`.
- Port: `465` with implicit TLS, or the provider-supported STARTTLS configuration.
- Username: the full Google account address.
- Password: the Google application password, entered only in the dashboard.
- Sender address: the authorized sending account or verified alias.
- Sender name: `Sindicondo`.

Creating a Google application password does not configure SMTP. Enable email
confirmation and review OTP expiry, password policy and Auth rate limits. Set
Site URL and allowed redirect URLs for the matching application environment.
Use the versioned confirmation template with `{{ .Token }}` for the code flow;
review the recovery template independently. Local templates are not automatically
published to hosted Auth. Keep SMTP passwords out of application environment
variables and repository files.

Application environment names are `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and server-only `SUPABASE_SERVICE_ROLE_KEY`.
Use matching local or development project values. Disable
`NEXT_PUBLIC_REGISTRATION_DEMO` for real signup. Vercel public values require a
rebuild; the development project uses the Production scope in this repository's
deployment pipeline. Do not change hosted settings or deploy without explicit
authorization.

Local end-to-end tests require the CLI-managed `zelo-local` stack, the confirmation
migrations, disabled registration mocks and `ORI47_LOCAL_AUTH_TESTS=enabled`.
They use synthetic accounts and capture codes in local Mailpit. Only that local
suite is allowed to manipulate test records. Do not record credentials, codes or
tokens in screenshots, traces or logs. Captured local mail proves local Auth
integration, not delivery to an external inbox. Hosted delivery acceptance needs
an explicitly authorized test recipient, actual receipt and full confirmation;
a successful signup API response alone is insufficient.

### Validation record

On 2026-11-21, manual validation reported a successful signup using the local
Supabase stack with the temporary Gmail SMTP profile. The confirmation code
arrived in an external inbox, and entering it successfully confirmed the account
and allowed the real flow to continue. This is a manual validation record,
not an automated test result. No recipient address, password, code or token is
recorded here.

This establishes external delivery and successful signup confirmation only.
Incorrect or expired codes, code reuse, resend invalidation, attempt limits,
session persistence after reload, logout and password recovery were not reported
as tested with external SMTP. Their existing local automated coverage must not
be presented as external SMTP acceptance. Automated Auth integration tests use
Mailpit; captured local mail is a separate form of evidence. No hosted Supabase
SMTP configuration or hosted-environment acceptance was established by this test.

After restoration, read-only inspection confirmed that local Auth
routes email to Mailpit, the manual-profile marker and operation lock are absent,
the canonical config has no custom SMTP section, and published local service
ports remain on loopback. No credentials were inspected and no services were
changed during this verification.

### Temporary local Gmail profile

The standard `supabase/config.toml` continues to route Auth mail to Mailpit.
The installed Supabase CLI is pinned to 2.122.1. The helper uses its supported
`--workdir`, `--network-id` and project-scoped `stop` options; it does not use
remote linking, reset, volume deletion or user deletion.

Prepare and check the inactive files:

```bash
nvm use
npm run db:smtp:prepare
npm run db:smtp:check
```

Preparation leaves the canonical config untouched and generates separate Gmail
and Mailpit workdirs under ignored `supabase/.smtp-manual/`. Both retain the same
local project ID and service ports, so they reuse this project's existing data
volumes. The workdirs reference the existing local CLI temporary state without
copying its contents. Migration and seed execution are disabled in these temporary profiles.
Only the two email templates are copied. The private `.env.smtp.local` file is
created with owner-only permissions if absent and is never overwritten.

Open that private file in your local editor and fill `SUPABASE_AUTH_SMTP_USER`,
`SUPABASE_AUTH_SMTP_PASS` and `SUPABASE_AUTH_SMTP_ADMIN_EMAIL`. Use your full Gmail
account address as the username, the Google application password as the password,
and an authorized sender address. Do not paste credentials into shell commands,
chat, screenshots or versioned files. The helper loads only these fields at
activation time; preparation and checking do not read the private file. The Gmail
host, implicit TLS port and sender name are in `supabase/smtp-manual.toml`;
credentials there are environment references only.

When ready for a real manual delivery test, stop automated tests and run:

```bash
npm run db:smtp:start
```

This intentionally stops and starts only `zelo-local`, preserving its data. The
CLI has no supported Auth-only configuration reload, so the project's other
local services briefly restart too. Docker Desktop and other projects are not
restarted. The existing loopback network/port checks remain mandatory. Provider
output is captured and suppressed to avoid printing keys or SMTP credentials.
The operation creates an ignored marker that blocks automated Auth email tests.
Those tests also inspect only the local Auth SMTP-host field and require Mailpit,
so an isolated test checkout cannot accidentally send through the manual profile.
No email is sent merely by preparing the files; do not activate this profile
until you intend to send a real test email.

In another terminal, keep the app on local Supabase with registration mocks off:

```bash
nvm use
NEXT_PUBLIC_APP_ENV=local NEXT_PUBLIC_REGISTRATION_DEMO=disabled NEXT_PUBLIC_FIRST_STEPS_MOCK=disabled npm run dev
```

Open `http://localhost:3000/criar-conta`. Submit exactly one signup using an address
you control that is not already registered, then read the code in that external
inbox and confirm it in the app. If the address already exists, do not delete the
account or reset the database; choose another controlled test address. An API
success or an entry in Sent Mail alone is not proof of receipt. During this
profile, Auth uses external SMTP and its mail is not captured by Mailpit.

Restore Mailpit immediately after the manual test, including after interruption:

```bash
npm run db:smtp:restore
```

Restoration does not require SMTP credentials. It restarts only the same local
project using the Mailpit workdir, removes the test-blocking marker only after a
successful start, and retains all accounts and volumes. The canonical config was
never swapped, so this recovery command also works if activation was interrupted
or the shell closed. Do not run profile commands concurrently. If an operation
was killed, the next command recovers a dead process lock automatically; a live
operation is never interrupted by another helper invocation.

After successful restoration, ordinary `npm run db:start` and automated tests
continue to use the standard Mailpit configuration. No hosted Supabase SMTP,
provider settings, Vercel settings or squad environment is changed by this local
profile. The single manual test account remains in the local database.
