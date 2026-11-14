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


## Atlas five-role runtime (feature branch)

The current `main` runtime remains the legacy SQLite implementation. The five-role/Atlas implementation is being developed on `feat/atlas-five-role-migration`; it is **not a production cutover** and should not be deployed as production yet.

### Development prerequisites

- Node.js 20.19+ (CI uses Node 20.20.x).
- A separate Atlas database named `verifymart_dev`.
- A runtime database principal for the application collections, excluding `auditLog`.
- A separate audit principal limited to `find` and `insert` on `auditLog` only.
- Atlas network access restricted to the actual development machine/server outbound IP.
- Local environment values configured outside Git.

Copy `.env.example` to a local backend env file (never commit it), then configure at least:

```dotenv
MONGODB_URI=mongodb+srv://<APP_USER>:<URL_ENCODED_PASSWORD>@<CLUSTER>/?retryWrites=true&w=majority&appName=VerifyMart-Dev
MONGODB_DB_NAME=verifymart_dev
MONGODB_APP_NAME=VerifyMart-Dev
MONGODB_AUDIT_URI=mongodb+srv://<AUDIT_USER>:<URL_ENCODED_PASSWORD>@<CLUSTER>/?retryWrites=true&w=majority&appName=VerifyMart-Audit
JWT_ACCESS_SECRET=<RANDOM_SECRET_AT_LEAST_32_CHARACTERS>
CORS_ORIGIN=http://localhost:5173
```

The application principal should have the minimum CRUD permissions on its application collections and no write privileges on `auditLog`. The audit principal must be granted only `find` and `insert` on `auditLog`; it must not have update/remove. Create collections and indexes with a separate deployment/admin principal before runtime startup. Do not grant broad `readWrite` on the entire database to both users.

### Atlas commands

```powershell
npm install
npm run seed:atlas
npm run dev:atlas
```

`seed:atlas` is restricted to `verifymart_dev` or `verifymart_staging`, refuses production and requires all collections/indexes to be provisioned first. Demo accounts are created only when a local `DEMO_PASSWORD` of at least 10 characters is supplied. No demo password is checked into the repository.

The Atlas server listens on port 8000 by default; the Vite frontend remains on port 5173. `/api/ready` checks Atlas connectivity and the required application indexes. `/api/health` is process liveness only.

### Migration safety

`npm run migrate:atlas -- --apply` is **not** a casual setup command. First run it without `--apply` for a read-only dry run. It requires a local read-only SQLite source plus one-time migration and audit-insert credentials. The script only permits `verifymart_dev` and `verifymart_staging`; production cutover is a separate approved operation. Preserve the SQLite source until staging row counts, transaction behavior and end-to-end acceptance all reconcile.

Escrow, seeded tariff rules, provenance events and telemetry remain clearly simulated. There are no live payment, customs, manufacturer-ledger or attack-detection integrations.
