# VerifyMart AI — Project Implementation Audit

**Audit date:** 2026-11-14  
**Repository:** `haseebsoul/verifymart-ai`  
**Audited base:** `main` at `872b14c4f9bd58ac8ed9d714ab59684872434952`  
**Specification:** VerifyMart AI — SRS and SRE Plan, 46 pages; Sections 18–23 supersede conflicting assumptions in Sections 1–17.

## Executive finding

The repository is a working-looking React/Express prototype, but it is not yet the product described by the current specification. Its application persistence path is SQLite, its authenticated role model is `user/operator/admin`, and the existing API does not implement merchant onboarding or merchant-owned resources. A provisioned Atlas project and M0 cluster are present, but the checked-in runtime does not connect to Atlas.

The audit was performed against the tracked repository tree and the actual route, service, middleware, seed, shared-schema, and frontend page implementations. A UI page or button is not counted as implemented unless the path reaches a protected API and persistence operation.

## Findings by specification area

| Area | Observed implementation | Gap / risk | Priority |
|---|---|---|---|
| Architecture and persistence | Express routes and domain services call synchronous `better-sqlite3` directly through `backend/src/db.ts`. | The app has no MongoDB Node driver dependency or Atlas connection path. SQL coupling is spread through routes, services, seed and telemetry, so the required per-entity repository boundary is absent. | P0 |
| Atlas resources | Live project `VerifyMart AI` and cluster `VerifyMartCluster` exist (AWS `AP_SOUTH_1`, M0, MongoDB 8.0.37). The live `verifymart_v14` database has 31 collections. | Existing collection names include legacy/plural variants (`merchantProfiles`, `trustLedgers`, `auditLogs`, etc.), not the exact 11-collection Section 20.2 model. The only listed Atlas DB user is `verifymart_app`, with `readWrite` on `verifymart_v14`; it is not scoped to the new environment database names and is not least-privilege for append-only audit. | P0 |
| Data model and money | SQLite schema stores money as integer cents; product and order timestamps are ISO strings. | MongoDB BSON Date / Int64 or Decimal128 semantics, unique indexes, capped provenance history, and a DB-enforced append-only audit credential are not implemented in app code. | P0 |
| Authentication | bcrypt cost 12; short-lived access JWT; refresh token is httpOnly, SameSite=Strict, rotated and stored hashed; failed-login counter locks after five failures for five minutes. | Shared schemas allow 8-character passwords, below the SRS minimum of 10. Role values are still the old three-role model. The token role is trusted until expiry rather than reloaded for every authorization decision. | P1 |
| Server-side authorization | `authenticate` and `requireRole` exist. Admin self-role-change and self-delete are rejected server-side. | RBAC recognizes only `user/operator/admin`. There are no merchant resource-ownership checks or inventory-manager-specific permissions. Operations routes are broadly operator/admin protected; there is no same-middleware `merchantId` ownership predicate. | P0 |
| Merchant lifecycle | No merchant registration, approval/rejection workflow, merchant profile route, or merchant-owned listing service was found in the backend. | Section 19.4 pending-to-approved onboarding, hidden pending listings, reasoned approval/rejection audit events, and Merchant/InventoryAdjustment records are missing. | P0 |
| Catalog | Seed defines 24 products across the four required categories; public listing supports category, search, verified-only and sort. | Products have no merchant ownership or `managedBy` model. Public catalogue approval filtering is absent. The current seed runs only against SQLite. | P1 |
| Verification and provenance | Public SKU/batch/order lookup exists; seed creates four provenance events per product; API marks results simulated. | Provenance is stored in separate SQLite tables and does not use the new Atlas product document sub-array capped at 50. The displayed factory-partner certificate text is derived from brand metadata and should not be read as independent manufacturer certification. | P1 |
| Landed-cost calculator | Destination constants include US, UK, EU, UAE (`AE`), Pakistan and Singapore; service uses integer-cent calculations and returns `seed-tariff-v1`. | Tariffs remain seeded estimates (correctly disclosed); service depends on SQLite. Need a dedicated `tariffRules` repository and tests against the exact Section 9.4 formula after migration. | P1 |
| Checkout and idempotency | Authenticated checkout recomputes the quote server-side, checks stock, writes order/items, decrements stock, and stores a replay response inside one SQLite transaction. Insufficient stock maps to 409. | Idempotency is in a separate SQLite table rather than a unique `orders.idempotencyKey` index. Duplicate product IDs in one request are checked line-by-line instead of aggregating total requested quantity, creating an oversell edge case. Required MongoDB multi-document transaction is absent. | P0 |
| Escrow | Database state supports held, released, refunded and on_hold. Release/hold endpoints audit and publish events. | No refund transition endpoint or complete guarded state-transition service was found. These remain simulated states; no funds move, as required by the honesty clause. | P1 |
| Operations console | The frontend contains nine dashboard routes: overview, topology, threats, activity, manage, rewards, reports, account and admin. Threat resolution/restock, settings, CSV audit export and user role/delete endpoints exist. | The console is an operator/admin console, not a five-role console. Inventory manager workflows and merchant listing/purchase views are absent. Some metrics/reports are hard-coded or generated from trigonometric/sample values rather than persisted measurements (for example velocity and report percentages); they must be labeled illustrative or replaced by measured data. | P1 |
| WebSocket / telemetry | Operator/admin connection requires a valid JWT; public channel only receives a small allowlisted event set. Simulator ticks every two seconds and frames are marked simulated. | Auth roles are old; inventory-manager/merchant channel policies are missing. Hub snapshots read SQLite. Token is in the query string, which can be exposed in proxy/access logs unless those logs redact query strings. | P1 |
| Reliability and observability | `/api/health`, `/api/ready`, request IDs, Pino HTTP logging, Helmet, CORS and API rate limiting exist. | Readiness probes SQLite, not Atlas. Prometheus `/metrics/prom`, Atlas connectivity/readiness and the complete SRE alert/runbook/restore suite are not present in code/docs. | P1 |
| Frontend design and accessibility | React 18, Vite, TypeScript, Tailwind and Framer Motion are present; product image fallback exists. | Full axe journey coverage and WCAG 2.2 AA acceptance evidence were not found. Role navigation still assumes only shopper/user, operator and admin. README references `assets/dashboard-preview.png`, which is absent from the tracked tree. | P2 |
| Testing | Three backend domain tests cover deterministic duty, seeded verification and SQLite idempotent checkout; frontend has unit tests and a small Playwright smoke test. CI workflow requests typecheck/build/test/lint/color lint. | No broad Supertest endpoint/negative-RBAC suite, no five-role cross-access tests, no specified end-to-end merchant/operator/admin journeys, no axe scan, and no demonstrated 80% coverage on core domain services. Test and workflow results must be obtained from actual execution, not inferred from configuration. | P0 |
| Standalone documentation | `docs/SRE_PLAN.md`, `docs/MONGODB_ATLAS_PROVISIONING.md` and requirements traceability exist. | Missing required `PROJECT_AUDIT.md` (this file), full `ROLE_PERMISSION_MATRIX.md`, `INCIDENT_RUNBOOKS.md`, `BACKUP_RESTORE.md` and `SECURITY_MODEL.md`. Existing SRE content must be reconciled to Atlas and five roles. Section 21.4 checkout sequence diagram is explicitly still open in Section 23. | P1 |

## Verified Atlas boundary

The Atlas management connection successfully inspected the project and cluster. The cluster is an M0 deployment in Mumbai and is not evidence of a production HA/backup configuration. The existing database is `verifymart_v14` and contains legacy data; it must not be dropped, reset or renamed during this work. The currently listed app DB user has `readWrite` on that legacy database only. No app runtime secret or secret-manager URI was supplied by the repository, and this audit does not place credentials in Git.

A separate `verifymart_dev` database and database principal are required for isolated development. Staging and production require their own approved environments, backup/PITR configuration and app credentials. Do not route the app to `verifymart_v14` by default.

## Implementation order and acceptance gates

1. Add the native MongoDB driver, explicit environment configuration, connection/readiness lifecycle, 11 collection repositories and declared indexes. Keep SQLite/JSON migration adapters isolated behind repository interfaces; never silently fall back to SQLite.
2. Add a one-time, dry-run-first migration that preserves source IDs and marks imported documents `migratedFrom: "sqlite-v1"`; compare per-collection source/document counts before cutover.
3. Implement the five-role enum and middleware contract, including merchant ownership in the same authorization middleware and admin approval workflow.
4. Refactor checkout to a transaction over stock and order writes, a unique order idempotency key, duplicate-key replay handling and aggregated product quantities.
5. Complete role-aware routes/UI, refund transition, reports, WebSocket filtering and demo/simulation labels.
6. Extract/update the standalone security, SRE, runbook, backup/restore and permission documents from the authoritative SRS; add the Section 21.4 checkout sequence diagram.
7. Run the specified build, color lint, unit/API/E2E/accessibility/security gates and record actual CI output. No production cutover until staging acceptance and data counts match.

## Audit limitations

This audit reads source and repository metadata on GitHub and inspects Atlas project/cluster/database metadata. A network attempt to clone GitHub into the execution container failed because the container could not resolve `github.com`; consequently no local npm build, test, or browser run is claimed here. The branch/PR CI workflow is the appropriate executable verification path once changes are pushed. Atlas collection names and database user scope were inspected live; this audit did not mutate the legacy `verifymart_v14` database.


---

## Implementation progress update — 2026-11-14

This update supersedes implementation-state statements in the original baseline audit above. The original findings are retained as a dated description of the code before the Atlas migration.

### Implemented on `feat/atlas-five-role-migration`

- The normal root and backend `dev`, `start`, and `seed` commands now target the Atlas runtime. SQLite compatibility commands are explicitly named `*:sqlite`; the legacy SQLite database module refuses to run with `NODE_ENV=production`.
- The Atlas runtime checks configured database names and rejects `verifymart_v14` as an application target. Startup validates the JWT secret and production CORS configuration. Readiness checks the application and separate audit connections.
- Shared API contracts expose the five SRS roles. Atlas middleware reloads the persisted account role/status for every request and resolves merchant ownership server-side.
- Atlas routes and repositories now cover authentication/session refresh, public catalogue and verification, landed-cost estimates, merchant onboarding/listings, shopper checkout and order history, inventory operations, threat signals, simulated escrow transitions, administrative user/merchant/listing governance, settings, audit and reports.
- Shopper order history and merchant onboarding, merchant/admin workspaces, and account profile/password settings are connected to Atlas APIs. The storefront cart sends product IDs and quantities; the server computes the quote and the order repository applies the stock/order transaction with an idempotency key.
- Checkout aggregates duplicate product IDs, uses integer cents/BSON Long, checks stock conditionally, validates the subtotal against the transaction's product-price snapshots and validates total arithmetic. Public listings and checkout are filtered to published platform products or active, approved merchant-owned products.
- Duty rounding uses integer/BigInt half-up calculations and explicit safe-integer checks.
- The Atlas seed fills missing deterministic catalogue records without overwriting existing records. Demo accounts require an explicitly configured `DEMO_PASSWORD`; no default demo password is committed.
- Migration defaults to dry-run, is restricted to dev/staging, uses read-only SQLite source access, aborts on malformed JSON or existing target IDs, uses insert-only writes and includes in-memory SQLite fixture tests.
- README and Atlas bootstrap instructions describe Atlas-first commands, credential isolation, simulated capabilities and safe migration requirements.

### Latest executable verification

GitHub Actions run **43654588715** completed successfully for exact branch head **`7c0c276e2ba2232bfb465da5f2568d2dd8745089`**:

- npm install — passed
- shared/backend/frontend type-check — passed
- shared/backend/frontend build — passed
- backend Vitest — 4 test files passed
- frontend Vitest — 1 test file passed
- ESLint — passed
- color lint — passed

The backend V8 report showed **15.48% statements/lines, 52.19% branches and 36.11% functions**. This is far below the SRS 80% core-service coverage requirement. The existing 4 backend files contain 16 tests; frontend has 2 unit tests. The workflow does not demonstrate complete endpoint/permission coverage, all five Playwright journeys, cross-owner negative flows, or axe/WCAG acceptance. A passing configured CI run is not a full SRS acceptance result.

### External verification and operational blockers

- The current `verifymart_dev` database was inspected read-only. All 11 required collections and the expected declared indexes (including listing visibility indexes) were present.
- The application and audit database users/URIs are not provisioned for `verifymart_dev`, and the network allowlist is not confirmed for the application host. The existing `verifymart_app` account is scoped to legacy `verifymart_v14` and must not be broadened or reused as a shortcut.
- The dev product collection was empty at last count; the 24-product seed was not run because application credentials are unavailable. Hubs (5), tariff rules (78) and settings (3) are already present.
- No application startup, readiness check using real app/audit credentials, live checkout transaction, or live WebSocket session has been exercised against Atlas.
- No local SQLite source file or migration credentials were available. No migration or seed was executed.
- Atlas cluster is M0 and is not a production HA/backup/PITR configuration.

### Remaining release gates

1. Provision a least-privilege `verifymart_dev` application principal and a separate custom audit principal with database-enforced `find`/`insert` only on `auditLog`; configure the restricted network allowlist and store URIs/secrets in the approved environment mechanism.
2. Run Atlas startup/readiness and seed using those development credentials; verify the 24-product catalogue and seed idempotency. Do not target `verifymart_v14`.
3. Expand backend tests to cover the actual routes and service/repository behavior: registration/login/lockout/refresh/logout, account disable/session revocation, merchant approval/rejection, listing moderation, cross-owner IDOR denials, inventory adjustment limits, threat transitions, escrow state transitions, and checkout transaction/replay/race failures.
4. Raise core-service coverage to the SRS 80% target. Add five Playwright role journeys, denied cross-role/cross-owner attempts, and axe accessibility checks for key pages/flows; record results.
5. Exercise the app with the provisioned Atlas principals and a real staging environment. Review SRE/backup/restore and production-tier prerequisites before any cutover.
6. Review the complete PR diff and the outstanding product workflow/permission matrix against the SRS before changing the PR from draft.

The PR remains draft/open. No merge, deployment, production configuration change, production database operation, seed execution, or migration was performed as part of this update.


---

## Final integration checkpoint — 2026-11-14

The current feature-branch head at this checkpoint is `97e8af5d1cdd68f267ea36e7e9832965f93a1d1c`. This supersedes the earlier progress-checkpoint SHA and its test figures.

### Added since the previous checkpoint

- Merchant listing update and soft-archive APIs enforce ownership and current merchant/listing state in the authorization middleware. Pending merchants can edit/archive drafts only; approved merchants can edit/archive drafts and published listings.
- Rejected merchant applications can be resubmitted with a new business profile and a new audit entry.
- Merchant dashboard exposes edit/archive/resubmit flows and uses the Atlas DTO fields.
- Admin read APIs for pending/all merchant applications and merchant-owned product listings are now registered; admin listing moderation is server-audited and only allows publication for an approved merchant whose user is active and still has the merchant role.
- Shopper checkout UI clears any previous quote when cart/destination changes and blocks checkout until the server quote matches the current cart signature.

### Exact-head CI evidence

GitHub Actions **run 43655171302** completed successfully for exact head **`97e8af5d1cdd68f267ea36e7e9832965f93a1d1c`**:

- `npm install --no-audit --no-fund` — pass
- shared/backend/frontend TypeScript type-check — pass
- shared/backend/frontend production build — pass
- backend unit tests — 4 test files passed
- frontend unit tests — 1 test file passed
- ESLint — pass
- color lint — pass

The backend V8 coverage report for this exact run was **14.81% statements/lines, 51.33% branches and 36.11% functions**. It is below the SRS 80% core-service gate and lower than the earlier checkpoint because new feature code was added without equivalent test coverage. The green CI result covers only the configured checks above; the workflow does not establish full SRS acceptance.

### Explicitly incomplete SRS requirements

- Admin hub CRUD and tariff-rule CRUD routes and management UI are not yet integrated. Public hub reads and tariff-based calculations exist, but that is not admin governance.
- There is no comprehensive Supertest suite for the complete Atlas API and negative role/ownership matrix. Current Atlas tests cover a limited set of auth middleware cases, core calculations/aggregation and migration fixture behavior only.
- The five separate Playwright role journeys and denied cross-role/cross-owner browser paths are not demonstrated as passing.
- No axe accessibility result or WCAG 2.2 AA journey acceptance is recorded.
- No verified 80% core-service coverage result, full security/secret scan or measured SRE SLO evidence is present.
- The code has not been started against the actual `verifymart_dev` database using dedicated application and audit credentials. The Atlas management connection verified collections and indexes only.
- The dev products collection remains empty; the idempotent seed has not run. There is no local SQLite source / approved migration credential in this work session; migration remains dry-run tooling only and has not been executed.
- The existing M0 cluster is not a production availability/backup posture. Production credentials, network access, backup/PITR and staging acceptance remain separate release gates.

PR #1 remains **open and draft**. No merge, deployment, main-branch write, seed execution, migration, or production/legacy database operation was performed.
