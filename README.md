<div align="center">

# 🛡️ VerifyMart AI

### Trusted. Verified. Global.

**An AI-assisted product authenticity, supply-chain verification and operations platform.**

[![Project](https://img.shields.io/badge/Project-VerifyMart%20AI-EB412C?style=for-the-badge)](https://github.com/haseebsoul/verifymart-ai)
[![Frontend](https://img.shields.io/badge/Frontend-React%20%7C%20Vite-61DAFB?style=for-the-badge)](#technology)
[![Backend](https://img.shields.io/badge/Backend-Node.js%20%7C%20Express-339933?style=for-the-badge)](#technology)

</div>

---

## 🌍 Project Overview

VerifyMart AI is designed to help customers verify high-value products, understand international landed costs, and follow product provenance. It also provides operational tools for managing inventory, shipments, authenticity reviews and risk events.

## 📸 Dashboard Preview

![VerifyMart AI Dashboard](assets/dashboard-preview.png)

*Conceptual dashboard preview. Actual application screens and live data depend on the implemented project.*

## ✨ Core Features

- **Product Marketplace:** Browse and search products.
- **Authenticity Verification:** Look up product, batch and order verification records.
- **Supply-Chain Provenance:** Inspect ordered product custody events.
- **Landed-Cost Calculator:** Estimate destination-specific duty, VAT and delivery costs.
- **Operations Dashboard:** Monitor inventory, shipments, threats and operational activity.
- **Escrow Workflow:** Track simulated held, released and refunded escrow states.
- **Role-Based Access:** Shopper, Merchant, Inventory Manager, Operator and Administrator.
- **Audit Trail:** Record important operational and administrative actions.

## 👥 Stakeholder Roles

| Role | Purpose |
|---|---|
| Shopper | Browse, purchase and verify products |
| Merchant | Manage merchant products and orders |
| Inventory Manager | Manage inventory and warehouse operations |
| Operator / Auditor | Review threats, verification and operational activity |
| Administrator | Manage users, roles and platform settings |

## 🧰 Technology

The project is designed around:

- React, Vite and TypeScript
- Node.js and Express
- MongoDB Atlas integration (where configured)
- Shared validation and application types
- API-driven application architecture

Check the actual project files and environment configuration for the implemented versions and services.

## 📁 Project Structure

```text
VerifyMartAI/
├── backend/
├── frontend/
├── packages/
├── docs/
├── package.json
├── README.md
└── .env.example
```

## 🧭 Developer handoff

For the current source-code map, five-role routing, registration changes, safe Git workflow and outstanding verification items, see [docs/DEVELOPMENT_HANDOFF.md](docs/DEVELOPMENT_HANDOFF.md).

## 🚀 Getting Started

### Requirements

- Node.js (use the version specified in the project)
- npm
- Git
- MongoDB Atlas or another configured database

### Install

```bash
npm install
```

### Configure

Copy the example environment file(s) supplied by the project into the appropriate local environment files.

Never commit real database passwords, JWT secrets or API keys.

### Run

Use the scripts defined in the root `package.json`:

```bash
npm run
```

This lists the available npm scripts. Start the backend and frontend using the documented scripts in the project.

## 🔐 Important Transparency

Some external integrations and operational workflows may use seeded or simulated data.

- Seeded authenticity hashes are not proof of a manufacturer's live ledger.
- Tariff calculations are estimates, not official customs quotations.
- Simulated escrow does not transfer real money.
- Simulated telemetry is not a live threat-intelligence feed.

Verify the implementation and its documentation before relying on any external-service integration.

## 🗺️ Project Roadmap

- [x] Repository created
- [ ] Complete source code published
- [ ] Database integration verified
- [ ] Authentication and role permissions tested
- [ ] Marketplace and verification workflows tested
- [ ] Operations dashboard validated
- [ ] Production deployment

## 🤝 Contributing

Issues and suggestions are welcome. Please open an issue before submitting major changes.

## 📄 License

Add the appropriate license before distributing or accepting external contributions.

---

<div align="center">

**VerifyMart AI — Secure. Verified. Global.**

Built to make product trust more transparent.

</div>


## MongoDB Atlas five-role runtime

The default application runtime on this branch is MongoDB Atlas with the five SRS roles: shopper, merchant, inventory manager, operator and admin. SQLite is retained only as an explicitly named legacy compatibility path for migration analysis; the legacy SQLite server refuses to start with `NODE_ENV=production`.

### Development prerequisites

- Node.js 20.19+ and npm.
- A dedicated Atlas development database named `verifymart_dev`, provisioned with the 11 Section 20 collections and expected indexes.
- An application database principal scoped to application collections only; it must not write to `auditLog`.
- A separate audit principal with only `find` and `insert` on `auditLog`.
- Atlas network access restricted to the development machine's actual outbound IP.
- A random `JWT_ACCESS_SECRET` of at least 32 characters.

Copy `.env.example` to a local, untracked environment file and supply values there. Never paste credentials into chat, commit them, or put them in shell history. Required runtime values:

```dotenv
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb+srv://<APP_USER>:<URL_ENCODED_PASSWORD>@<CLUSTER>/?retryWrites=true&w=majority&appName=VerifyMart-Dev
MONGODB_AUDIT_URI=mongodb+srv://<AUDIT_USER>:<URL_ENCODED_PASSWORD>@<CLUSTER>/?retryWrites=true&w=majority&appName=VerifyMart-Audit
MONGODB_DB_NAME=verifymart_dev
MONGODB_APP_NAME=VerifyMart-Dev
JWT_ACCESS_SECRET=<RANDOM_SECRET_AT_LEAST_32_CHARACTERS>
CORS_ORIGIN=http://localhost:5173
VITE_API_URL=http://localhost:5000/api
```

The normal commands use Atlas:

```powershell
npm install
npm run dev
npm run build
npm test
```

The backend listens on port 5000, Vite on port 5173. `npm start` runs the Atlas server. `npm run seed` is the Atlas development seed. The frontend proxies `/api` and `/ws` to the Atlas backend.

Legacy SQLite commands are explicitly separated as `npm run dev:sqlite`, `npm run start:sqlite` and `npm run seed:sqlite`. They are compatibility/migration tooling, not the normal application path and must not be used in production.

### Atlas provisioning and seed

Create all collections and indexes with a separate deployment/admin principal before runtime startup. The app runtime validates that collections and indexes exist; it does not try to create database objects with its restricted application credential. The audit principal must be append-only at the database permission layer. The server startup validates the app connection, the audit connection, the JWT secret and required app indexes; `/api/health` is liveness, while `/api/ready` checks both database principals and index readiness.

`npm run seed` is limited to `verifymart_dev` and `verifymart_staging`, refuses production and is idempotent for the demo catalogue, hubs, tariffs, settings and optional demo fixtures. It fills missing deterministic catalogue rows without overwriting existing products. Demo accounts are created only when `DEMO_PASSWORD` is explicitly configured (10+ characters); no demo password is checked in.

### Migration safety

`npm run migrate:atlas` defaults to a read-only dry run and requires the original SQLite source file, a development/staging migration principal and the separate audit migration principal when audit records exist. Use `DATABASE_PATH` only to point the tool to the local source file. The target is restricted to `verifymart_dev` or `verifymart_staging`. Before `--apply`, the script checks for target ID collisions and aborts rather than replacing records; malformed source JSON also aborts rather than being silently discarded. Review the per-collection count report and rejected-record output before any apply operation.

Do not use the existing legacy Atlas database `verifymart_v14` as the target. It is not an application migration target and must remain untouched. No migration should be performed until the SQLite source, clean staging target, credentials, network access and reconciliation plan have been independently reviewed.

### Simulation boundaries

- Seeded authenticity hashes are application-generated records, not manufacturer signatures or a live provenance ledger.
- Tariff rates are seeded estimates, not official customs quotations or live customs feeds.
- Escrow/order state is simulated; no payment or funds transfer occurs.
- Telemetry and threat signals are simulated; there is no live network attack or threat-intelligence source.
- SRE targets are not measured service-level results until monitoring data exists.


## Windows development station

For a guarded local setup on Windows, run PowerShell from the repository root:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\Start-VerifyMart-Windows.ps1
```

On first run the launcher creates `backend/.env`, generates a local development JWT secret, and stops safely until both Atlas connection URIs are configured. It fixes the target database to `verifymart_dev`, displays the PC's public IPv4 for a narrow Atlas allowlist entry, installs workspace dependencies, runs the development-only Atlas seed, builds the app, and starts the API and Vite UI. The launcher never changes Atlas network access itself and never configures a wildcard IP allowlist.

Before rerunning it, provision the separate Atlas app and audit users in the Atlas console and put their URIs in `backend/.env`. The app principal must not have access to `auditLog`; the audit principal must have only `find` and `insert` on `verifymart_dev.auditLog`. Use Atlas custom database roles to enforce those restrictions. Never reuse the legacy `verifymart_app` principal or target `verifymart_v14`.

Optional five-role demo accounts are created only when `DEMO_PASSWORD` is configured (10+ characters) before the seed runs. All five share that local-only password. Their emails are `admin@verifymart.ai`, `auditor@verifymart.ai`, `shopper@verifymart.ai`, `inventory@verifymart.ai`, and `merchant@verifymart.ai`. Without `DEMO_PASSWORD`, visitors can browse the seeded public catalogue and shoppers can register normally; no prebuilt admin credentials are present.

The catalogue and provenance history created by the seed are explicitly simulated development fixtures. They do not represent actual supplier inventory, independently verified warehouse stock, manufacturer-signed evidence, live customs rates, or real payments. Karachi / HUB-KHI remains a proposed demo hub, not a verified facility.


Full manual for Atlas custom roles, separate users, local environment and startup: [docs/WINDOWS_LOCAL_SETUP.md](docs/WINDOWS_LOCAL_SETUP.md).


### Five-role registration and demo access

The sign-in and registration forms require an explicit stakeholder role. Shopper registration is open. Merchant registration creates a pending supplier profile in the same Atlas transaction as the user record. Inventory Manager, Operations Auditor and System Administrator registration require role-specific invitations: set `ADMIN_INVITE_KEY` for administrator registration and optionally set `ROLE_INVITE_KEYS` to a JSON object containing `inventory_manager` and/or `operator` keys. Never commit real invitation values.

In a non-production environment, setting `DEMO_PASSWORD` (10+ characters) enables the evaluator panel. The seeded demo shortcut checks the server-side password against the seeded account hash; the password is not sent to or exposed in browser code. The five fixed demo emails are `admin@verifymart.ai`, `merchant@verifymart.ai`, `inventory@verifymart.ai`, `auditor@verifymart.ai` and `shopper@verifymart.ai`.

The Atlas API defaults to port 5000 and Vite to 5173. Vite uses `strictPort` and proxies `/api` and `/ws` to port 5000. `/api/health` checks the Atlas application and audit connections; `/api/public/metrics` returns aggregate public record counts and in-process p95 API latency. The landed-cost engine currently supports the seeded product value, destination duty, VAT and carrier fee in USD. City-level, filer-specific, additional customs, regulatory, excise, withholding, platform fees and a live USD/PKR conversion are not yet configured and are not fabricated by the UI.
