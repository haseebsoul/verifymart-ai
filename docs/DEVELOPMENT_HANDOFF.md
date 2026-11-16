# Development handoff: VerifyMart AI

This document is the working map for future implementation on this repository. Update it whenever architecture, role behavior, or verified project status changes.

## Current working baseline

- Repository: `haseebsoul/verifymart-ai`
- Active implementation branch: `feat/registration-entry-and-role-routing`
- Runtime path: React/Vite frontend + Express/TypeScript backend + MongoDB Atlas.
- Node requirement: `>=20.19.0` (see root `package.json`).
- This handoff describes source code, not a claim that every workflow has passed end-to-end testing.

## Roles and current frontend routing

The five application roles are:

1. `shopper`
2. `merchant`
3. `inventory_manager`
4. `operator`
5. `admin`

Main routing is in `frontend/src/App.tsx`:

- Public routes: `/`, `/store`, `/verify`, `/login`, `/register`.
- Authenticated dashboard routes are nested under `/dashboard`.
- `Protected` checks authentication and the supported role set.
- `/dashboard/admin` is additionally restricted to `admin`.
- Dashboard home currently dispatches shopper to `ShopperDashboardPage`, merchant to `MerchantDashboardPage`, inventory manager to `ManagePage`, and operator/admin to `OverviewPage`.

Important role-oriented frontend files:

- `frontend/src/context/AuthContext.tsx`: session refresh, login, shopper registration, logout and current user state.
- `frontend/src/components/Header.tsx`: public navigation and registration entry.
- `frontend/src/dashboard/DashboardLayout.tsx`: dashboard shell and navigation.
- `frontend/src/dashboard/ShopperDashboardPage.tsx`: shopper home.
- `frontend/src/dashboard/MerchantDashboardPage.tsx`: merchant listings, application state and merchant workflow.
- `frontend/src/dashboard/ManagePage.tsx`: inventory workspace; UI differentiates inventory and admin-only settings/pricing.
- `frontend/src/dashboard/OverviewPage.tsx`: shared operator/admin overview.
- `frontend/src/dashboard/AdminPage.tsx`: user roles, account disable, merchant application decisions and listing moderation.
- `frontend/src/dashboard/ThreatsPage.tsx`: risk signals and role-aware actions.
- `frontend/src/dashboard/ActivityPage.tsx`: authenticated WebSocket activity feed.

Do not assume a frontend visibility check is sufficient authorization. Verify the matching backend route middleware and repository scoping for every privileged operation.

## Registration work already committed on this branch

The following three commits are on the branch:

- `9b7914724bd86c655fd567f5f43cde288613a5ca` — add dedicated shopper registration route.
- `9447a37802e571e7fd135a4ebcd94bb871f5e5b0` — make login/register mode follow the current route.
- `8d492e1f9f37f09399bce6a40c8b4e8df485e4fb` — expose shopper registration in storefront navigation.

Files changed:

- `frontend/src/App.tsx`: `/register` renders the existing `LoginPage`.
- `frontend/src/pages/LoginPage.tsx`: selects register mode for `/register`, login mode for `/login`, and navigates between them.
- `frontend/src/components/Header.tsx`: adds a visible `Create account` link to `/register`.

Scope note: this exposes the existing shopper registration flow. It does not implement public self-registration for merchant, inventory manager, operator, or admin. Merchant onboarding is a separate application/review workflow. Admin access must remain controlled.

## Backend and data boundaries

- Backend entry point: `backend/src/server-atlas.ts`.
- Express app composition: `backend/src/app-atlas.ts`.
- Public product routes: `backend/src/routes-atlas-public.ts`.
- Product persistence: `backend/src/repositories/products.ts`.
- Shared role definitions and contracts live in `packages/shared` and backend repository contracts.
- The Atlas server connects to the application database and a separate audit-log connection. Respect the documented least-privilege and append-only audit boundaries.
- Root scripts in `package.json` define development, build, test, typecheck and lint workflows. Normal `dev`/start paths target Atlas; SQLite commands are explicitly named legacy compatibility paths.

## Safe development workflow

1. Work on `feat/registration-entry-and-role-routing` unless a new task explicitly requires another branch.
2. Read the existing route, service, repository and tests before editing.
3. Keep changes scoped; do not replace whole files based on assumptions.
4. For every privileged API action, verify server-side role authorization, ownership checks, validation, and audit behavior.
5. Add or update tests alongside behavior changes.
6. Run relevant checks, then the root checks where the environment permits: `npm run typecheck`, `npm test`, `npm run lint`, and `npm run build`.
7. Commit and push to this feature branch. Do not merge to the default branch or deploy without explicit approval.
8. Never commit `.env`, database credentials, JWT secrets, access tokens, or production data.

## Verification status / known follow-ups

- The three registration changes were confirmed present in a clean local clone on this branch; that confirms checkout state, not successful browser or automated testing.
- The local Atlas-backed `GET /api/products` endpoint previously returned HTTP 500. The root exception was not yet captured, so do not guess at a database or product-model fix. Capture the backend diagnostic log and reproduce before changing this path.
- Role dashboard and backend authorization behavior still need a complete route-by-route audit and tests.
- Do not run database provisioning, seeding, migration, destructive operations, production changes, or process termination as a troubleshooting shortcut. Confirm scope and authorization first.

## Change log

- 2026-11-16: Added this handoff map to document the repository layout, five roles, registration commits, safe workflow and outstanding verification work.
