<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project conventions

- Use npm and preserve package-lock.json. Keep the existing Next.js, React and Tailwind versions.
- Use Node.js 24; the exact local version is recorded in .nvmrc.
- Write source code, repository documentation and configuration in English. Write user-facing interface text in Brazilian Portuguese.
- Do not add emojis, source-code comments, AI attribution or signatures. Never add credentials or real personal data.
- Use README.md and AGENTS.md as the only Markdown files, with .github/pull_request_template.md as an intentional exception.
- Preserve application behavior. Do not add empty architectural layers, placeholder business code or business features during foundation setup.
- Use Prettier for formatting and ESLint for code quality. Keep eslint-config-prettier after the Next.js presets.
- Run npm run format, npm run format:check, npm run lint, npm run typecheck, npm run build and npm audit --omit=dev before handing off changes. Typecheck generates Next.js route types before running TypeScript.
- Permanent branches will be main and develop. Create feature branches from develop. Branch setup is pending; do not initialize Git or create branches or commits during foundation setup.
- Remote database environments and deployment setup are pending. CI is configured; remote execution remains unverified until publication.

## Testing conventions

- Put unit/component tests in tests/unit using *.test.ts or *.test.tsx; put Playwright tests in tests/e2e using *.spec.ts. Discovery is intentionally separate.
- Use Vitest, jsdom, React Testing Library and jest-dom for synchronous components. The @/ alias resolves to src. Use browser tests for async Server Components.
- Prefer accessible roles and observable behavior. Avoid extensive Next.js mocks, fixed sleeps and arbitrary coverage thresholds.
- Run npm test for a non-interactive unit run and npm run test:watch for watch mode.
- Install Chromium with npx playwright install chromium before browser tests. Run npm run test:e2e or npm run test:e2e:ui; both build production code first.
- Playwright manages the production server at 127.0.0.1:3100 and must fail if that port is occupied. Never reuse an unrelated server.
- Retain failure traces and ignore generated reports. Reject test.only when CI is set.
- Run unit and browser tests alongside the existing quality commands. Database integration tests are not configured.

## Database conventions

- Use the exact-version project-local Supabase CLI and CLI-managed Docker stack. Inspect containers and ports first; never stop, reset or modify another project's stack.
- Start the stack through npm run db:start with Docker Desktop configured for Localhost by default (a machine-wide prerequisite); the dedicated bridge alone is insufficient on the verified host. Never bypass network checks or expose local Studio publicly. Verify actual port bindings on the Docker host.
- Keep database operations local. Never link remote projects or run destructive remote commands during foundation work. db:reset must explicitly use --local and destroys local data before reapplying migrations and seed.
- Make schema changes through reviewed migrations. Never edit historical applied migrations; add a new migration. Keep seed.sql empty until synthetic development data is needed.
- Generate database types with npm run db:types only after the local database is running. Preserve existing generated output on failure; do not fabricate database types.
- Keep local environment files, CLI state and database artifacts ignored. Track config, migrations, seed and .env.example. Never commit credentials, personal data or status output.
- Only the API URL and public anon key belong in NEXT_PUBLIC variables. Never create privileged browser or admin clients.
- Validate environment configuration inside factories, not at import time. Use server-only for server clients and the async Next.js cookies API with getAll/setAll.
- Authentication, cookie refresh proxy integration, domain tables, permissions and database integration tests remain outside this setup. Add session refresh and response cache handling when implementing authentication.

## CI conventions

- Keep the Quality job name stable. Use pull_request for main/develop PRs, pushes to main/develop and manual dispatch; there is no stage branch.
- Pin official actions to verified full commit SHAs, use read-only contents permissions and disable persisted checkout credentials.
- CI requires no database or Supabase credentials. Run test:e2e for the production build and browser tests without a separate build step.
- The blocking audit covers production dependencies only. Do not suppress the known full-tree development advisory or hide required check failures.
- Upload only Playwright reports and test results on failure, excluding environment files, with short retention. CI does not deploy or configure branch protection.
