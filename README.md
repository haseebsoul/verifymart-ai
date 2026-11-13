# VerifyMart AI

**Verified provenance · landed-cost estimates · simulated escrow**  
Prototype baseline: 1.0 · November 12, 2026

VerifyMart AI is a cross-border commerce prototype with three connected surfaces:

- **Storefront:** a 24-product verified catalog, search/filter/sort and a persistent cart.
- **Public verification portal:** look up a SKU, SHA-256 batch hash, order ID or escrow receipt and inspect its chain-of-custody timeline.
- **Operations console:** role-gated KPIs, hub topology, simulated telemetry, threats, inventory controls, escrow actions, audit export and user administration.

The frontend uses React 18, Vite, TypeScript and Tailwind. The API uses Node.js 20+, Express, TypeScript, WebSocket and SQLite (`better-sqlite3`). Shared Zod schemas and types live in `packages/shared`.

## Important prototype limits

These are intentional product boundaries, not hidden implementation details:

- Batch hashes are SHA-256 hashes of seeded product metadata. They are **not** anchored to a real manufacturer ledger.
- Tariffs are a small seeded demo table (`source: seed-tariff-v1`). They are not legally authoritative customs rates or tax advice.
- Checkout creates a database order and an escrow state (`held`, `on_hold`, `released`). **No payment is processed and no funds move.**
- WebSocket events and hub telemetry are produced by a server-side simulator and labeled simulated in the UI.
- Carrier/customs-provider connections and multi-currency settlement are not part of v1.0.
- The uploaded baseline file contains sections 1–11.6 and references (but does not include) the detailed SRE sections 12–17. `docs/SRE_PLAN.md` therefore distinguishes the stated 99.5% availability target from implementation-defined prototype alerting/runbook recommendations.

## Requirements coverage

The build implements the documented public catalog, verification and duty flows; shopper auth and cart/checkout; the escrow state machine; staff dashboards, hub simulations, threats, inventory, settings, reports and admin user management; request IDs, Zod body validation, rate limiting, audit logging, refresh-cookie sessions, Docker and CI scaffolding. See [`docs/REQUIREMENTS_TRACEABILITY.md`](docs/REQUIREMENTS_TRACEABILITY.md) for the page/requirement mapping and known prototype deviations.

## Quick start

### Requirements

- Node.js 20 LTS or later
- npm 10 or later

### Install and run

```bash
cp .env.example .env
npm install
npm run dev
```

The frontend is at [http://localhost:5173](http://localhost:5173). The API is at [http://localhost:8000/api/health](http://localhost:8000/api/health).

The API creates `data/verifymart.sqlite` on first start and seeds the demo catalog, five hubs, tariff rules and development accounts. The frontend development server proxies `/api` and `/ws` to the API.

### Demo accounts

Available only when `NODE_ENV` is not `production`:

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@verifymart.ai` | `VerifyMart-Demo-2026` |
| Operator | `auditor@verifymart.ai` | `VerifyMart-Demo-2026` |
| Shopper | `shopper@verifymart.ai` | `VerifyMart-Demo-2026` |

Change `DEMO_PASSWORD` in `.env` before local use. Demo credentials and the seed routine are disabled for production startup.

## Useful commands

```bash
npm run dev            # API + frontend
npm run build          # shared package, API and frontend production builds
npm run typecheck      # strict TypeScript checks
npm test               # domain tests
npm run lint           # ESLint
npm run lint:colors    # strict three-color source guard
npm run seed           # re-run development seed (disabled in production)
```

The API uses a persistent SQLite file with WAL mode and foreign-key enforcement. To reset local demo data, stop the API and remove `data/verifymart.sqlite` and its `-wal` / `-shm` siblings, then start it again.

## API surface

Base path: `/api` · all JSON errors use `{ error: { code, message, requestId } }`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`; `GET /auth/me`, `/auth/mode` |
| Catalog | `GET /products`, `GET /products/:id` |
| Verification | `GET /verify/:query` |
| Landed cost | `POST /duty/calculate` |
| Orders / escrow | `POST /orders/checkout`, `GET /orders`, `POST /orders/:id/release`, `/orders/:id/hold` |
| Operations | `GET /metrics`, `/warehouses`, `/threats`, `/settings`, `/rewards`; `PATCH /settings`, `/inventory/:id`; `POST /inventory/restock/:id`, `/simulation/trigger`; `GET /reports/audit.csv` |
| Administration | `GET /admin/users`, `PATCH /admin/users/:id`, `DELETE /admin/users/:id` |
| Health | `GET /health`, `/ready` |

WebSocket telemetry is available at `/ws/telemetry`. Public clients connect with `?public=1` and receive only sanitized simulated events. Operator/admin clients connect with `?token=<short-lived-access-token>` and receive operational events. Each user is limited to five operator connections.

The complete OpenAPI starter contract is in [`backend/openapi.json`](backend/openapi.json).

## Checkout and landed-cost behavior

`POST /duty/calculate` accepts `destinationCountry` (`US`, `UK`, `EU`, `AE`, `PK`, `SG`) and product IDs with quantities. The response itemizes product value, duty, VAT/tax, carrier fee and total, and identifies `seed-tariff-v1` and `landed-cost-v1`.

The calculation is deterministic and rounds each line to cents using half-up rounding. VAT uses the duty-inclusive value plus carrier fee in the seeded v1 rule. Checkout never trusts browser totals: the server recomputes the quote and checks/decrements stock inside a SQLite transaction. A required `Idempotency-Key` is stored for 24 hours; a replay returns the original order result rather than decrementing stock again.

## Security and production notes

Before any production deployment:

1. Set a strong, unique `JWT_ACCESS_SECRET` and `COOKIE_SECURE=true`.
2. Terminate TLS at a trusted reverse proxy and set `CORS_ORIGIN` to the exact frontend origin.
3. Use a durable, backed-up volume for the SQLite database; restrict filesystem access.
4. Provision the first administrator through a controlled database/operations procedure; public registration always creates a shopper role.
5. Replace demo tariff, carrier, provenance and escrow adapters with authoritative providers before representing results as real.
6. Add an external metrics/alerting backend and a tested off-host backup/restore process. The prototype dashboard and SLO text are not an independent monitoring service.

Never commit `.env`, API keys, database files or real customer secrets. The committed `.env.example` contains placeholders and a development-only demo password as required by the SRS.

## Docker

```bash
cp .env.example .env
# Set JWT_ACCESS_SECRET and COOKIE_SECURE appropriately before deployment.
docker compose up --build
```

The compose file runs the API and frontend separately and persists the SQLite data directory.

## Source bundle

The complete project source is also available as [`VerifyMartAI-v1.0.zip`](VerifyMartAI-v1.0.zip) in the repository root. Download that archive directly from GitHub and extract it to a local folder before running the Quick start commands.

## Repository layout

```text
backend/              Express API, SQLite schema, services, routes, telemetry
frontend/             React storefront, verification portal and operations console
packages/shared/      Shared TypeScript types and Zod request schemas
docs/                 SRE plan and requirement traceability
.github/workflows/    CI build and test workflow
```

## License

Prototype project. Add a project-specific license before external redistribution.


## V14 MongoDB Atlas environment

A development Atlas project and free M0 cluster have been provisioned for the V14 migration:

- Project: `VerifyMart AI`
- Cluster: `VerifyMartCluster` (AWS `AP_SOUTH_1`, Mumbai)
- Database: `verifymart_v14`
- Application database user: `verifymart_app` (read/write limited to this database)

The provisioned database contains 31 collections, 76 indexes and 285 seed/demo documents. See [MongoDB Atlas provisioning](docs/MONGODB_ATLAS_PROVISIONING.md) for the resource record, collection inventory, seed counts and outstanding integration steps.

**Migration status:** the currently checked-in backend source still uses SQLite. The Atlas infrastructure and seed data are ready, but the V14 implementation must complete the backend persistence migration to MongoDB Atlas before the running application can be described as Atlas-connected. The repository contains only placeholder values in `.env.example`; actual credentials must remain in a private local `.env` file and must never be committed.
