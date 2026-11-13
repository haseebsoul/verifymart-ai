# VerifyMart AI — MongoDB Atlas Provisioning Record

Provisioned through the authorized MongoDB Atlas connection on 2026-11-13.

## Atlas resources

| Resource | Value |
|---|---|
| Organization | Muhammad's Org - 2026-11-13 |
| Organization ID | 6af679f184fcce76c472b1d4 |
| Project | VerifyMart AI |
| Project ID | 6af67a36ad03a179d6c57bf8 |
| Cluster | VerifyMartCluster |
| Cluster type | Free M0 |
| Provider / region | AWS / AP_SOUTH_1 (Mumbai) |
| MongoDB version | 8.0.37 |
| Database | verifymart_v14 |
| Application database user | verifymart_app |
| Application database role | readWrite on verifymart_v14 |

The Atlas cluster reached state IDLE, and an authenticated Atlas connection was established successfully by the Atlas management integration.

**Important:** This is an infrastructure and database provisioning record. The currently checked-in application source still contains SQLite persistence in its existing backend. The V14 engineering agent must complete the code migration to MongoDB Atlas before declaring the application runtime connected to this database.

## Database collections

The database currently contains 31 collections:

```text
users
sessions
registrationApplications
merchantProfiles
products
categories
productReviews
hubs
warehouses
inventoryItems
inventoryMovements
shipments
provenanceEvents
verificationReviews
verificationCertificates
carts
orders
escrows
idempotencyKeys
threats
auditLogs
settings
notifications
messages
supportRequests
trustLedgers
rewardOffers
simulationRuns
telemetryEvents
systemMetrics
tariffRules
```

## Initial seed data

Verified counts at provisioning:

| Collection | Documents |
|---|---:|
| users | 5 |
| products | 24 |
| categories | 4 |
| hubs | 5 |
| warehouses | 5 |
| inventoryItems | 24 |
| provenanceEvents | 96 |
| verificationCertificates | 24 |
| verificationReviews | 1 |
| orders | 12 |
| escrows | 12 |
| threats | 4 |
| tariffRules | 24 |
| auditLogs | 5 |
| notifications | 5 |
| messages | 3 |
| inventoryMovements | 3 |
| settings | 4 |
| simulationRuns | 1 |
| telemetryEvents | 5 |
| supportRequests | 2 |
| trustLedgers | 3 |
| rewardOffers | 3 |
| systemMetrics | 6 |
| productReviews | 3 |
| registrationApplications | 1 |

The database contains 285 documents overall and 76 indexes at the time of this record, including MongoDB's default `_id` indexes and application query indexes.

Seed documents use explicit IDs and `dataOrigin: "seed"`; simulator-style demo records also use `isSimulated: true`. Tariff values are illustrative only. Orders and escrow are simulation records; no money is moved.

Five development accounts exist:

| Role | Email |
|---|---|
| Shopper | shopper@verifymart.ai |
| Merchant | merchant@verifymart.ai |
| Inventory Manager | inventory@verifymart.ai |
| Operator | auditor@verifymart.ai |
| Administrator | admin@verifymart.ai |

The development demo password is configured separately and must not be enabled in production. The database stores bcrypt password hashes, not plaintext passwords.

## Application environment

The backend must read:

```env
MONGODB_URI=mongodb+srv://<DB_USER>:<URL_ENCODED_PASSWORD>@verifymartcluster.2yfhbdt.mongodb.net/?retryWrites=true&w=majority&appName=VerifyMartCluster
MONGODB_DATABASE=verifymart_v14
```

The connection string in the local private environment file is not committed here. Never commit `.env`, Atlas passwords, JWT secrets or production credentials.

## Network access and local development

No broad IP range has been added to Atlas Network Access. In particular, `0.0.0.0/0` was not enabled.

For a local VS Code/Cloud agent running from a developer workstation, add that workstation's actual outbound IPv4 address to the project's Atlas Network Access list. For deployment, allow only the fixed outbound IP address or private network of the application host.

The Atlas management integration can connect to the provisioned cluster through its managed connection. That does not automatically authorize the developer's laptop or a separate deployment host.

## Required V14 engineering follow-up

The V14 agent must:

1. Migrate the existing SQLite repositories and services to the official MongoDB Node.js driver.
2. Keep Atlas as the sole application persistence source; do not silently fall back to SQLite.
3. Add schema validation and migration/bootstrap scripts.
4. Create database-enforced unique indexes for user email, user ID, SKU, batch hash, order ID, escrow ID, certificate ID and idempotency scope after duplicate checks.
5. Add transaction-safe checkout, stock transfer and escrow transitions.
6. Add idempotent seed/upsert scripts so rerunning seed does not duplicate demo data.
7. Hash all seeded passwords with bcrypt cost 12 in the application seed script.
8. Use a dedicated least-privilege database user.
9. Add database health/readiness checks.
10. Verify all five role dashboards against Atlas-backed records.
11. Never run destructive seed/reset logic against production.
12. Test transactions on a replica-set capable Atlas deployment.

The Atlas database is provisioned and pre-seeded; application code migration and workstation network allowlisting remain separate tasks.
