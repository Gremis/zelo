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
uses the existing login API and returns to the protected queue. ORI-87 adds
the cookie persistence choice and the separate recovery flow described below.

Panel identity and first steps use the protected API even when development mock
flags are present. Component mocks remain available as explicit test fixtures.
A simulated signup is not an authenticated session and cannot unlock `/fila`.
First steps are shown only in the current post-signup flow. Login, logout and
a fresh page load do not show this card. First-step dismissal affects only the
current rendered panel; per-account
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
as tested with external SMTP during that signup-only check. The subsequent
ORI-87 recovery acceptance is recorded below. Their existing local automated coverage must not
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

Both activation and restoration now wait for Auth template readiness before
printing success. The helper verifies the current container identity/start,
the audited Auth version (`v2.197.0`), both configured internal template URLs,
and an exact match with the prepared OTP template files. It also requires
structured Auth reload events for both `confirmation` and `recovery` from the
current startup, strictly later than any recorded load error for that purpose.
The first reload following an initial load error is discarded even if its
timestamp is later, and reloads sharing an error timestamp are never accepted.
Events from stdout and stderr are ordered conservatively before evaluation:
[this Auth version can emit a reload event after caching its default template](https://github.com/supabase/auth/blob/v2.197.0/internal/mailer/templatemailer/template.go).

The readiness check polls for up to 45 seconds, with bounded local Docker probes.
It does not call signup/recovery endpoints or send any email. An unreadable log,
missing reload evidence, mismatched content, changed container, or unsupported
Auth version prevents a success message. Failure exits nonzero and retains the
active marker, including on an unverified restoration; use `npm run db:smtp:restore`
and resolve the readiness failure before running automated Auth tests. Provider
output remains suppressed. Do not request manual emails while the helper is
starting or after a readiness failure. This startup check is not proof of Gmail
receipt and does not add an application-wide mail or authorization gate.

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

## Login and password recovery integration (ORI-87)

Login, recovery request and recovery code/password screens use the existing light
signup presentation. Recovery has its own memory-only context, separate from
signup confirmation. Email and OTP never enter URL parameters, browser storage
or application logs. Leaving a recovery screen clears the code and password,
including when Next.js hides the route in an Activity. Reloading loses the flow.
Login passwords are also cleared when the login route is hidden.

The request and resend both call `POST /api/auth/forgot-password` with `{ email }`.
An accepted request uses a generic response without confirming account existence;
provider or connection failures are reported instead of simulating delivery.
The intermediate Continue button checks only the six-digit format. Its text
explicitly says that actual verification occurs when saving the new password.
`POST /api/auth/reset-password` retains `{ email, code, password }`. The server
validates the project password rules before consuming the OTP, verifies with
`type: "recovery"`, and requires a confirmed identity matching the requested email.
Signup verification continues to use `type: "signup"` and its existing guard.

Recovery uses a separate request-scoped Supabase client with persistence and
auto-refresh disabled. It never writes the temporary recovery session to browser
cookies. A local sign-out is attempted in `finally` after verification/update;
the isolated client is discarded even if provider revocation fails. Existing
browser sessions are not used to authorize the password update. Successful
updates return to login with an in-memory confirmation and the email prefilled.

If verification consumes an OTP but the password update fails, `update_failed`
requires a fresh code. The UI clears the password and OTP and disables Continue
until a new send succeeds. An uncertain network or server result follows the same
policy: it never claims success or retries the consumed code. Incorrect, expired
and reused codes share a generic invalid-code response; rate limits and provider
outages remain distinct. A changed password and email delivery are not atomic:
a lost response may mean the password changed, so another recovery request is
the safe restart. No durable recovery ticket or schema migration is introduced.

The keep-connected checkbox selects cookie persistence, not a new authentication
lifetime. Checked retains the existing Supabase SSR cookie lifetime. Unchecked
removes `Max-Age` and `Expires` from live auth cookies, including chunked cookies.
An HttpOnly same-site preference cookie preserves this choice in Route Handlers
and SSR proxy renewals. Cookie deletion remains immediate; logout also clears
the preference. Browser session restoration can restore session cookies, so
closing a browser is not a guaranteed logout. Provider session policy remains
unchanged. The unused browser Supabase factory is not part of this flow.

Selective reuse was reviewed against [PR #14](https://github.com/Gremis/zelo/pull/14)
(commits `a7d0e26`, `c6d18ca`, `c63a494`, `31bc1a7`) for code-flow navigation,
request errors, field focus and test expectations, and
[PR #18](https://github.com/Gremis/zelo/pull/18) (`3845c22`) for separate invalid-code,
rate-limit and provider-error outcomes. These behaviors were adapted to the
ORI-47 real signup/SSR implementation. No whole-branch integration or replacement
of the real login with a stub was performed; the original branches and commit
history remain intact.

### Local validation and Gmail acceptance

Use Node.js from `.nvmrc`. Run `npm run format`, `npm run format:check`,
`npm run lint`, `npm run typecheck`, `npm run build`, `npm audit --omit=dev`,
`npm test`, `npx playwright install chromium` and `npm run test:e2e`.
The existing `ORI47_LOCAL_AUTH_TESTS=enabled` opt-in also enables the expanded
real Auth browser test in `tests/e2e/registration-local.spec.ts`; use the existing
local environment loading procedure. The suite refuses external Auth URLs and
requires the existing Auth container to point to local Mailpit. Inspect containers,
port bindings and SMTP routing before running it. Do not reset the database.

The local browser scenario covers signup confirmation regression, real recovery
mail, invalid/expired/replaced/reused codes, resend, old-password rejection,
new-password login, logout and both cookie persistence options. To exercise
expiry and resend without sleeps, it adjusts timestamps only on its synthetic
account, which is removed by test cleanup. Using the current password as the
replacement exercises a real provider rejection after OTP consumption; the test
asserts no browser recovery session, requires a new code, and completes recovery
with that new code. Component/service tests cover duplicate requests, rate limits,
identity matching, update exceptions and isolated-session cleanup. Separate browser
fixtures inject network failures and inspect keyboard/focus and layout at 360px
and 1280px. These injected fixtures are not evidence of email delivery.

On 2026-11-21, the operator reported successful end-to-end recovery using the
local Supabase stack and the existing private Gmail SMTP profile. The operator
confirmed that the screens were correct, the recovery flow completed, and login
opened the occurrence queue without the first-steps card. This is reported manual
acceptance, distinct from automated Mailpit evidence. The validated flow is
recovery request, receipt of the recovery code in Gmail, format-only Continue,
new password submission, login confirmation, login with the new password, queue
access and logout. No address, password, OTP, recovery URL or token is retained.
Old-password rejection and fault cases are independently covered by local tests;
the manual report does not establish external-SMTP acceptance of every fault case.

During preparation, an initial Auth template load failure produced the provider's
default recovery link email. The SMTP helper now requires current-startup evidence
of custom confirmation and recovery template loading before declaring readiness,
including rejection of the initial fallback reload event. The successful manual
report followed this investigation. No link-based recovery flow was added.

After manual acceptance, `npm run db:smtp:restore` restored Mailpit without
resetting the database or deleting volumes. The helper confirmed both custom OTP
templates were loaded by Auth before completing restoration. Read-only checks
confirmed Mailpit routing, absent transition marker/lock and localhost-only
published service ports. The existing private SMTP file remains ignored and was
not included in this delivery. Automated final Auth tests run only after this
restoration and use synthetic local accounts and Mailpit.

External SMTP is not enabled for automated tests. A future manual retest must use
the existing preparation/activation/restoration procedure with an authorized
recipient, without storing private values. This acceptance does not validate a
hosted Supabase project, deploy templates to hosted Auth, or change provider-wide
settings. Browser keyboard-space checks simulate a reduced viewport; physical
mobile keyboard behavior has not been independently verified on a device.

Final local validation used Node.js `24.22.3`: formatting, ESLint, Next.js route
types/TypeScript, production build and the production dependency audit passed
with zero reported vulnerabilities. All 258 unit tests passed. The full browser
run with local Auth enabled passed 45 tests; the single skipped case requires
explicit registration-demo mode and is unrelated to real recovery. This includes
post-signup first steps and their absence after login/reload. Remote CI results
must be checked on the ORI-87 PR and are not implied by this local record.

### Integration dependencies and scope

As checked on 2026-11-21, [PR #15](https://github.com/Gremis/zelo/pull/15)
(first steps/panel navigation) and [PR #19](https://github.com/Gremis/zelo/pull/19)
(real signup confirmation and SSR session) are both open against `develop`.
ORI-87 starts at the published ORI-47 commit `13e96ce`; `origin/develop` does not
contain it. The ORI-45 head `cd3cea0` is an ancestor of that base, so its work is
already inherited by both ORI-47 and ORI-87. History and content were compared. Both PRs currently have successful Quality
checks and are reported mergeable, while GitHub reports their merge state as
`BLOCKED`; this delivery does not change their reviews or branch requirements.

The recommended review/integration order is #15, then #19, then ORI-87. Merging
#19 with its existing ancestry also brings in #15's commits; maintainers must
coordinate how #15 is resolved in that case rather than applying duplicate
squashed changes. No other PR is modified or merged as part of this delivery.
If the dependency PRs are squash-merged, reconcile the ORI-87 comparison before
integration so inherited work is not reviewed or applied twice.

The inherited scope includes the signup/confirmation endpoints and guard,
protected queue/panel, profile/condominium integration, original first-steps
components, database migrations/types, and private SMTP profile tooling. These
changes appear in the aggregate PR diff against `develop` until the dependency
PRs are integrated. ORI-87 adds real recovery UI integration and error handling,
isolated recovery sessions, persistent/session-cookie selection across SSR
renewals, shared light auth layouts with safe vertical centering, post-signup-only
first steps, SMTP template-readiness verification, and the associated tests and
validation record. No new migration, broad authorization layer, remote environment
change or deployment is introduced by ORI-87 itself. Per-account first-step
dismissal remains outside this change; the post-signup display state is in memory.

## Route and resource authorization (ORI-88)

ORI-88 starts from the published ORI-87 branch at `8eafe3e`, preserving the
PR #20 login/recovery, signup, confirmation, queue and first-steps flows. Its
working branch is `feature/ori-88-auth-route-authorization`.

### Inventory and authorization boundaries

| Surface                                                                                                                                               | Existing operations                                         | Boundary                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `/`                                                                                                                                                   | Redirect to login                                           | Public                                                                                                  |
| `/login`, `/criar-conta`, `/confirmar-codigo`, `/recuperar-senha`, `/confirmar-codigo/recuperacao`                                                    | Authentication screens                                      | Public                                                                                                  |
| `/fila`                                                                                                                                               | Queue shell and existing first steps; no occurrence records | Server-verified confirmed active session and own `profiles.is_sindico`                                  |
| `/api/panel`                                                                                                                                          | GET own profile and owned condominium count                 | 401 for missing/invalid/pending/revoked session; 403 for non-manager; 503 for provider/database failure |
| `/api/auth/session`                                                                                                                                   | GET confirmed identity                                      | Server identity validation and active-session check; 401 on rejected identity                           |
| `/api/auth/logout`                                                                                                                                    | POST global logout                                          | Confirmed active session; existing same-origin protection                                               |
| `/api/auth/signup`, `/api/auth/confirm-signup`, `/api/auth/resend-signup`, `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password` | POST authentication operations                              | Public entry points with existing input, confirmation, recovery and origin validation                   |
| `public.profiles`                                                                                                                                     | Direct user API: own SELECT; UPDATE full_name/phone         | Own user ID, confirmed active session; role columns remain protected                                    |
| `public.condominiums`                                                                                                                                 | Direct user API: own SELECT, INSERT, UPDATE name/address    | Own manager_id, manager profile, confirmed active session; immutable owner/slug; no user DELETE         |
| `private.email_confirmation_challenges` and `public.email_confirmation_guard`                                                                         | Internal confirmation attempt budget/leases                 | Existing server-only privileged RPC; no domain data access                                              |

There are no Server Actions, occurrence tables/endpoints, condominium application
CRUD routes, membership tables or additional role mappings in this tree. The
current relationship is `condominiums.manager_id -> profiles.id -> auth.users.id`.
Profiles expose manager/resident booleans; public signup already permits choosing
the manager account type. This change does not introduce an approval process or
change that product decision. User metadata is not consulted for authorization.
Future domain operations must validate the caller and resource relationship at
every operation, retain RLS, and define their own inaccessible-resource response.
The panel accepts no resource selector: injected query IDs do not change scope.
No missing business endpoint was added to satisfy an ID-manipulation test.

The inherited implementation already used `getUser()`, per-user queries,
manager RLS, restricted profile column grants, SSR renewal, session/persistent
cookies and isolated recovery clients. The gaps were a confirmed non-manager
being able to render the queue, policies accepting unconfirmed or revoked
sessions, and lack of evidence about replaying pre-logout credentials.

### Active-session enforcement and logout guarantees

The new migration adds `public.has_active_session()`. This narrow boolean RPC
uses the JWT session claim and authenticated subject to check the matching
`auth.sessions` row, confirmed email and `not_after`. It has no caller-selected
arguments, uses an empty search path, and grants execution only to authenticated
users. Its security-definer access reads Auth session state; it never grants
callers direct access to Auth tables. Restrictive policies add this condition to
both public tables without replacing their ownership or role policies. Missing,
malformed, expired, pending and deleted sessions fail closed.

Private server identity checks still call Supabase `getUser()` before the RPC.
Session lookup errors never grant access. The queue renders an access-denied
screen for non-managers without rendering its private shell; its streamed page
can have HTTP 200, while the panel API returns 403. Private pages and API
responses use private/no-store headers. SSR cookie refresh and persistence
selection remain unchanged; no return URL or new redirect input was introduced.
The service worker continues to cache only the public offline document.

[Supabase documents](https://supabase.com/docs/guides/auth/sessions) that logout
removes affected session rows, but an issued JWT can remain valid until expiry.
Consequently, clearing cookies or validating a JWT alone is insufficient. The
local test restores the complete pre-logout browser cookies and requires 401
from panel/session plus a login redirect from the queue. It also reuses a
previously issued user JWT directly against PostgREST: the RPC request is still
accepted as an authenticated JWT but returns false; reads expose no rows, updates
change no rows, inserts fail, and refresh fails. Global logout covers the other
session issued for that same synthetic user too. No JWT revocation guarantee is
claimed for unrelated Supabase services, future tables without these policies,
or a request already in flight when logout occurs. A database migration is
required before exercising these checks in an environment; no remote migration
or deployment was performed here.

### Local evidence and remaining dependencies

`tests/e2e/authorization-local.spec.ts` uses two synthetic manager accounts with
separate condominiums, a non-manager and an account whose confirmation is removed
only within that synthetic fixture. User clients use the public key and their
own issued credentials for isolation checks. Privileged credentials are used
only for fixture creation/deletion; local SQL modifies only synthetic session
state and removes synthetic condominiums during cleanup. The test disables
traces, screenshots and videos and never prints credentials. It checks both
ownership directions, foreign-ID reads/updates, forged ownership in inserts,
owner/role mutation denial, own permitted writes, public screens, anonymous and
invalid sessions, explicit session expiry, browser/API denial and logout replay.

The existing real Mailpit suite covers signup, confirmation, recovery, login,
logout, first steps, valid SSR refresh and both cookie persistence choices.
The transactional database suites also verify active, pending, expired, missing,
malformed and revoked session claims, restricted RPC privileges, and ownership
policies. Existing condominium SQL fixtures now include confirmed Auth sessions
so their original positive authorization checks remain meaningful.

Validation uses Node.js 24.22.3 and the already-running local CLI-managed stack,
with localhost-only service bindings and Mailpit. Local validation performs no reset, shared-environment change or external SMTP delivery. The local migration
is recorded through `supabase migration up --local`; database types were generated
from the running stack, including the previously existing confirmation RPC.
Remote CI and hosted-provider behavior remain unverified by these local checks.

Final ORI-88 local validation on 2026-11-21 passed formatting, formatting check,
ESLint, route type generation/TypeScript, production build, Chromium installation
and production audit (zero vulnerabilities). All 262 unit tests, 114 transactional
database assertions and 46 browser tests passed. One existing registration-demo
case was intentionally skipped because real Auth mode was enabled. Acceptance
criteria 1–8 are covered for the existing surfaces: anonymous redirects/401,
role denial, two-manager isolation, invalid/expired sessions, valid renewal,
logout replay rejection, public Auth entry points and interface/direct-API
regression. Condominium mutations are verified through the existing PostgREST
API with user credentials; no application CRUD UI exists to exercise. Shared
or hosted execution and unrelated provider services are outside this evidence.

### Logout button follow-up (ORI-88)

The real logout operation already revoked the backend session, cleared cookies
and signup context, removed the private shell, and replaced/refreshed the login
route on success. It retained context and displayed an error on failure. The
remaining gap was that the button required loaded panel user data, preventing
logout during loading or after a panel request failure. The button now depends
only on its own pending state, and a synchronous request guard prevents duplicate
submissions. Panel loading and logout use separate error states so one request
cannot erase the other request's error or offer the wrong retry action.

The authorization browser test now performs logout through the menu while panel
loading returns a controlled 503. A first controlled logout failure preserves the
private route and a valid backend session, displays the error, and permits retry.
The retry is held in flight to verify the disabled button and absence of duplicate
requests, then forwarded to the real existing endpoint. Success clears cookies,
returns to login, and prevents private access after reload, back navigation to an
actual earlier private history entry, direct queue navigation and replaying saved
cookies against both protected GET endpoints. Existing direct-JWT revocation and
user-credential RLS checks remain in the same scenario. Component tests verify
logout during indefinitely pending panel loading, failed-result and exception
retry, and clearing all signup context fields only after success. Local validation
passed 262 unit tests, 114 database assertions and 46 browser tests, with the same
single demonstration-mode skip; formatting, lint, types, build and production
audit also passed. No additional migration or backend logout replacement was
needed for this follow-up.

### Delivery dependencies (ORI-88)

On 2026-11-21, GitHub reports #15, #19 and #20 open against `develop`, each with
successful Quality checks and Deploy skipped. Their current published heads are
`cd3cea0`, `13e96ce` and `8eafe3e`, respectively. Git ancestry confirms that #19
contains #15, #20 contains #19, and ORI-88 starts from the unchanged #20 head.
Review and integration must follow [#15](https://github.com/Gremis/zelo/pull/15)
→ [#19](https://github.com/Gremis/zelo/pull/19)
→ [#20](https://github.com/Gremis/zelo/pull/20) → ORI-88. Because these PRs share
ancestry, maintainers must coordinate squash merges and reconcile comparisons
to avoid applying inherited work twice. No dependency PR is changed here.

The aggregate diff against `develop` includes inherited first steps/navigation
(#15), signup/confirmation, SSR session and local SMTP tooling (#19), and login,
recovery, cookie persistence and template-readiness work (#20). ORI-88 itself
adds active-session enforcement and restrictive RLS policies, queue role denial,
private response headers, logout availability independent of panel loading,
and their tests/types/documentation. Review its own changes against `8eafe3e`
until those dependencies are integrated. The target environment needs the new
`20261121120000_require_active_sessions.sql` migration, after the inherited
migrations, before serving the updated private operations. No shared database
migration is performed as part of publishing this branch or opening its PR.
