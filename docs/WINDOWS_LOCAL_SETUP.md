# VerifyMart AI — Windows Local Development Setup

This document gets the Atlas-backed feature branch running on a developer's Windows PC. It is for the isolated `verifymart_dev` database only. It does not authorize a staging or production deployment.

## 1. Keep the environments separate

Use the existing Atlas project **VerifyMart AI** and cluster **VerifyMartCluster**. The development database is **verifymart_dev**. Never use the legacy `verifymart_app` database user or `verifymart_v14` database.

The cluster is an M0/free development resource. It is not the production hosting, availability, or backup plan.

## 2. Add the development PC to the Atlas network allowlist

Run the launcher once from the repository root. If credentials are not set, it prints the public IPv4 address of the PC running PowerShell. In Atlas, open **Security → Network Access → Add IP Address** and add that exact address as a single IP entry. Do not use `0.0.0.0/0`. If the ISP changes the address, repeat this step with the new address.

The launcher never changes Atlas Network Access automatically.

## 3. Create least-privilege custom database roles

In Atlas, open **Security → Database Access → Custom Roles**. Define these custom roles in the project before creating the users.

### Application role: `verifymart_dev_app`

Scope all privileges to database `verifymart_dev`. Grant the runtime only the collection actions it needs:

| Collection | Actions |
|---|---|
| users | find, insert, update |
| merchants | find, insert, update |
| products | find, insert, update |
| hubs | find, insert, update |
| tariffRules | find, insert, update, remove |
| orders | find, insert, update |
| threats | find, insert, update |
| inventoryAdjustments | find, insert |
| settings | find, insert, update |
| trustLedger | find, insert |

Also grant `listCollections` on the `verifymart_dev` database and `listIndexes` on each of the ten application collections above. Do **not** grant any action on `auditLog`. Do not grant database/cluster administration or index-creation actions to the runtime app user; indexes are deployment-managed.

### Audit writer role: `verifymart_dev_audit_insert`

Grant exactly:
- Resource: database `verifymart_dev`, collection `auditLog`
- Action: `insert` only

Do not grant `find`, update, remove, drop, or index-management actions.

### Audit reader role: `verifymart_dev_audit_read`

Grant exactly:
- Resource: database `verifymart_dev`, collection `auditLog`
- Action: `find` only

This credential is used only by Operator/Admin audit review and export routes. Do not grant insert, update, remove, drop, or index-management actions.

### Admin/migration principal

A separate full-administration identity is reserved for reviewed, one-off provisioning/migration CLI work. Never configure it in the running API, seed process, or ordinary local runtime. Do not create or use it as a shortcut for missing app/audit credentials.

## 4. Create three runtime database users

Create separate SCRAM database users:
- App user: assigned only the `verifymart_dev_app` custom role.
- Audit writer: assigned only the `verifymart_dev_audit_insert` custom role.
- Audit reader: assigned only the `verifymart_dev_audit_read` custom role.

Generate separate strong passwords in Atlas and store them in your local password manager. Use the Atlas-generated connection strings and URL-encode any special characters in passwords. Do not send passwords or full connection strings in chat, GitHub issues, commits, or screenshots.

## 5. Configure the local backend environment

From the repository root, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\Start-VerifyMart-Windows.ps1
```

On first run the launcher creates `backend/.env`, generates a local development-only `JWT_ACCESS_SECRET`, prints the PC's public IPv4, and stops until all three runtime URIs are filled in. Open `backend/.env` locally and set:

```dotenv
NODE_ENV=development
PORT=5000
JWT_ACCESS_SECRET=<generated locally by the launcher; keep it>
COOKIE_SECURE=false
CORS_ORIGIN=http://localhost:5173
MONGODB_DB_NAME=verifymart_dev
MONGODB_APP_NAME=VerifyMart-Dev
MONGODB_URI=<app user's Atlas connection URI>
MONGODB_AUDIT_URI=<insert-only audit writer URI>
MONGODB_AUDIT_READ_URI=<find-only audit reader URI>
DEMO_PASSWORD=
```

Leave `MONGODB_DB_NAME=verifymart_dev`. Never put secrets in the tracked root `.env.example`.

To create the optional five local demo role accounts, set `DEMO_PASSWORD` to a private development password of at least 10 characters before running the launcher. All five demo accounts use that password. Without it, the public demo catalogue is seeded and users can register as shoppers, but the seeded admin, operator, inventory-manager, and merchant logins are not created.

## 6. Seed, build, and start

Run the launcher again. It performs, in order:

1. `npm install` (SQLite migration dependency is optional for the Atlas app path)
2. `npm run seed` against `verifymart_dev` only
3. `npm run build`
4. `npm run dev`

Open:
- Web UI: http://localhost:5173
- API liveness: http://localhost:5000/api/health
- API readiness: http://localhost:8000/api/ready

The readiness endpoint must report `ready` before considering the app connected. A working Atlas administration connector is not a substitute for this application-level check.

## 7. Demo-data boundaries

Seeded products, prices, stock levels, provenance events, hub telemetry, threat signals, and tariff rules are development fixtures. Provenance events are marked simulated. They are not supplier attestations, actual warehouse stock, independent authenticity certifications, live threat intelligence, official customs quotations, or payment transactions. Karachi / HUB-KHI remains a proposed demo hub, not a verified warehouse.

Do not import customer records or a SQLite source until the source has been located, the dry-run reconciled, and a separate migration approval has been recorded.
