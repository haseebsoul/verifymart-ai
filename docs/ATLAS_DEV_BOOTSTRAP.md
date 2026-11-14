# VerifyMart AI — Atlas Development Database Bootstrap

**Inspected:** 2026-11-14  
**Atlas project:** VerifyMart AI  
**Cluster:** VerifyMartCluster (AWS / AP_SOUTH_1, M0, MongoDB 8.0.37)  
**Database:** verifymart_dev

## What was created

A separate development database was created on the existing cluster with the exact eleven collection names in SRS Section 20.2:

users, merchants, products, hubs, tariffRules, orders, threats, inventoryAdjustments, auditLog, settings, and trustLedger.

The collections were created empty through the authorized Atlas management connection. The legacy verifymart_v14 database was not changed. It remains a separate database containing the existing 31-collection application dataset.

## Important limitations

- The cluster is an M0/free deployment. It is a development resource, not evidence of a production-ready HA, backup or point-in-time-recovery posture.
- The only listed Atlas database user at inspection time was verifymart_app, with readWrite on verifymart_v14. It does not authorize the app to use verifymart_dev.
- No application MONGODB_URI or secret-manager URI was available to this coding session. No database password was committed or written into repository files.
- A separate least-privilege application principal for verifymart_dev and a separate audit principal with insert/find only on auditLog are still required. The existing DB user must not be broadened as a shortcut.
- Unique indexes and the remaining declared query indexes must be created and verified by the MongoDB driver bootstrap/index migration once the application integration is committed. Collection creation alone does not prove those indexes exist.
- The verifymart_dev database is not connected to the current application yet. The checked-in application still uses SQLite until the persistence cutover phase is complete.

## Required environment

Use the following names locally (never commit the values):

    MONGODB_URI=mongodb+srv://<DEV_USER>:<URL_ENCODED_PASSWORD>@verifymartcluster.2yfhbdt.mongodb.net/?retryWrites=true&w=majority&appName=VerifyMartCluster
    MONGODB_DB_NAME=verifymart_dev
    MONGODB_APP_NAME=VerifyMart-Dev
    MONGODB_AUDIT_URI=mongodb+srv://<AUDIT_USER>:<URL_ENCODED_PASSWORD>@verifymartcluster.2yfhbdt.mongodb.net/?retryWrites=true&w=majority&appName=VerifyMart-Dev-Audit

The app principal must have only the required data privileges for application collections. The audit writer principal must have find/insert on auditLog and must not have update/remove. Prefer a custom database role if Atlas administration supports it.

## Environment separation

The SRS requires separate database names: verifymart_dev, verifymart_staging and verifymart_prod. Only the development database collection shells have been provisioned in this session. Staging/production require separate approved resources, secrets, network allowlists, backups and release gates.
