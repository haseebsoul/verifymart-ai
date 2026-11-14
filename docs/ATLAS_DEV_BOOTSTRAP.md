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
- The verifymart_dev database is not connected to the current application yet. The checked-in application still uses SQLite until the persistence cutover phase is complete.

## Required environment

Use the following names locally (never commit the values):

    MONGODB_URI=mongodb+srv://<DEV_USER>:<URL_ENCODED_PASSWORD>@verifymartcluster.2yfhbdt.mongodb.net/?retryWrites=true&w=majority&appName=VerifyMartCluster
    MONGODB_DB_NAME=verifymart_dev
    MONGODB_APP_NAME=VerifyMart-Dev
    MONGODB_AUDIT_URI=mongodb+srv://<AUDIT_USER>:<URL_ENCODED_PASSWORD>@verifymartcluster.2yfhbdt.mongodb.net/?retryWrites=true&w=majority&appName=VerifyMart-Dev-Audit

The app principal must have only the required data privileges for application collections. The audit writer principal must have find/insert on auditLog and must not have update/remove. Prefer a custom database role if Atlas administration supports it.

## Environment separation

The SRS requires separate database names: verifymart_dev, verifymart_staging and verifymart_prod. Only the development database has been provisioned and partially configuration-seeded in this session. Staging/production require separate approved resources, secrets, network allowlists, backups and release gates.
