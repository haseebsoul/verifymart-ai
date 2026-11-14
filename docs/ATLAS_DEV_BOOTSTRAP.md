# VerifyMart AI — Atlas Development Database Bootstrap

**Inspected:** 2026-11-14  
**Atlas project:** VerifyMart AI  
**Cluster:** VerifyMartCluster (AWS / AP_SOUTH_1, M0, MongoDB 8.0.37)  
**Database:** verifymart_dev

## What was created

A separate development database was created on the existing cluster with the exact eleven collection names in SRS Section 20.2:

users, merchants, products, hubs, tariffRules, orders, threats, inventoryAdjustments, auditLog, settings, and trustLedger.

The 11 collections were created through the authorized Atlas management connection. A limited configuration seed matching the existing repository seed was inserted into `hubs` (5 records), `tariffRules` (78 records, six destination codes) and `settings` (3 records). The product collection is currently empty; the 24-product and provenance seed is intentionally not published to Atlas until the checked-in SHA-256 seed utility is executable with application credentials. An initial development-only placeholder product batch was removed in full, along with its dependent threat rows, because its hashes did not match the repository algorithm. No placeholder product or provenance hashes remain. The legacy `verifymart_v14` database was not changed; it remains a separate database containing the existing 31-collection application dataset.

**Latest verified document counts:**

| Collection | Documents |
|---|---:|
| users | 0 |
| merchants | 0 |
| products | 0 |
| hubs | 5 |
| tariffRules | 78 |
| orders | 0 |
| threats | 0 |
| inventoryAdjustments | 0 |
| auditLog | 0 |
| settings | 3 |
| trustLedger | 0 |

## Important limitations

- The cluster is an M0/free deployment. It is a development resource, not evidence of a production-ready HA, backup or point-in-time-recovery posture.
- The only listed Atlas database user at inspection time was verifymart_app, with readWrite on verifymart_v14. It does not authorize the app to use verifymart_dev.
- No application MONGODB_URI or secret-manager URI was available to this coding session. No database password was committed or written into repository files.
- A separate least-privilege application principal for verifymart_dev and a separate audit principal with insert/find only on auditLog are still required. The existing DB user must not be broadened as a shortcut.
- The Section 20.2 unique and query indexes were created and read back from Atlas: users.email (unique), users.role; merchants.userId (unique); products.sku and batchHash (unique), name+brand text, category, merchantId, status; hubs.code (unique); tariffRules (hsPrefix,country) (unique); orders.idempotencyKey (unique), userId, state, createdAt; threats severity, resolvedAt, productId; inventoryAdjustments productId, actorId, at; auditLog actorId, at; settings.key (unique); trustLedger merchantId, at. Additional products.listingStatus and products(merchantId,listingStatus) indexes support approved public catalog filtering. Runtime bootstrap code declares these indexes except auditLog indexes, which are managed by a separate deployment credential because the app credential must not administer immutable audit history.
- The branch's normal development/runtime commands now select the Atlas-backed application. The code path is not yet live-verified because the separate application/audit credentials and host network allowlist are not provisioned. The legacy SQLite server is available only through explicitly named compatibility commands and refuses production startup.

## Required environment

Use the following names locally (never commit the values):

    MONGODB_URI=mongodb+srv://<DEV_USER>:<URL_ENCODED_PASSWORD>@verifymartcluster.2yfhbdt.mongodb.net/?retryWrites=true&w=majority&appName=VerifyMartCluster
    MONGODB_DB_NAME=verifymart_dev
    MONGODB_APP_NAME=VerifyMart-Dev
    MONGODB_AUDIT_URI=mongodb+srv://<AUDIT_USER>:<URL_ENCODED_PASSWORD>@verifymartcluster.2yfhbdt.mongodb.net/?retryWrites=true&w=majority&appName=VerifyMart-Dev-Audit

The app principal must have only the required data privileges for application collections. The audit writer principal must have find/insert on auditLog and must not have update/remove. Prefer a custom database role if Atlas administration supports it.

## Environment separation

The SRS requires separate database names: verifymart_dev, verifymart_staging and verifymart_prod. Only the development database has been provisioned and partially configuration-seeded in this session. Staging/production require separate approved resources, secrets, network allowlists, backups and release gates.


## Current implementation verification — 2026-11-14

The branch `feat/atlas-five-role-migration` makes Atlas the default development/runtime path. The root README documents the setup and the legacy SQLite compatibility commands. The application startup validates the database name against `verifymart_dev`, `verifymart_staging`, or `verifymart_prod` and explicitly rejects `verifymart_v14`.

A read-only Atlas check on 2026-11-14 inspected all 11 collections in `verifymart_dev`. The expected index names and key patterns in the branch's index registry were present, including the public listing and merchant/listing indexes. No collection/index creation or data mutation was done by that check.

The normal branch CI run 43654588715 passed on commit `7c0c276e2ba2232bfb465da5f2568d2dd8745089`. This verifies install, type-check, build, configured unit tests, ESLint and color lint; it does **not** verify an application connection with the missing app/audit credentials or an actual application startup.

At the time of the check, document counts remained: users 0, merchants 0, products 0, hubs 5, tariffRules 78, orders 0, threats 0, inventoryAdjustments 0, auditLog 0, trustLedger 0, settings 3. The seed utility was not run. No SQLite-to-Atlas migration was run.

The backend test suite had 4 files/16 tests and 15.48% statement/line coverage (52.19% branch, 36.11% function) in that CI run. The 80% SRS core-service coverage gate, complete endpoint/RBAC suites, all five Playwright role journeys and axe accessibility acceptance remain open. The dev cluster is M0 and must not be used as evidence of production readiness.


## Final code/CI checkpoint — 2026-11-14

Exact feature-branch head `97e8af5d1cdd68f267ea36e7e9832965f93a1d1c` passed GitHub Actions run 43655171302: npm install, shared/backend/frontend type-check, build, backend and frontend Vitest suites, ESLint and color lint. Backend coverage was 14.81% statements/lines, 51.33% branches, 36.11% functions, below the SRS 80% core-service acceptance target.

The latest code adds shopper order history and merchant application UI, merchant listing edit/archive/resubmission, admin merchant/listing reads and moderation, and server quote freshness checks. This is not a live Atlas integration test: there are still no dedicated application and audit credentials or confirmed app-host network allowlist. No app startup against this database, seed or migration was run.

Admin hub and tariff-rule CRUD integration remains missing. Full Supertest permission/negative-case coverage, five-role Playwright journeys, axe checks and the SRS coverage threshold also remain outstanding. Keep PR #1 in draft until those requirements are evidenced.


## Administrator reference data and latest verification — 2026-11-14

The Atlas-backed admin API and dashboard now support hub create/edit/retire and tariff-rule create/update/delete, with audit entries. Hub records are retired rather than deleted. Destination base tariff rules cannot be deleted. The merchant approval transaction verifies that the applicant account is active and retains the merchant role before it publishes drafts. Duty quotes apply the same public-product visibility gate as the catalog.

GitHub Actions run **43655633531** passed on implementation commit `b8869fdc7d5ddff028c8618907a05c6da4ba3e75`: install, type-check, build, backend tests (4 files), frontend tests (1 file), ESLint and color lint. Backend coverage was 15.02% statements/lines, 51.61% branches and 31.70% functions, below the SRS 80% target.

External Atlas startup with app/audit principals is still blocked because those credentials and app-host network access are not provisioned. No seed or migration was run. The collection/index inspection was read-only. Full API authorization tests, five-role Playwright, axe/WCAG acceptance and secret scanning remain open release gates.
