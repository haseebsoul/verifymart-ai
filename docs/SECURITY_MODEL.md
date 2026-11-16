# VerifyMart AI — Security Model

**Specification basis:** SRS Sections 5–7 (application security and authentication), 18–20 (revision, RBAC and Atlas), and 21 (architecture diagrams). This document is the implementation-facing security summary; the SRS remains authoritative.

## 1. Trust boundaries and data classification

| Class | Examples | Handling |
|---|---|---|
| Public | Approved catalog listings, public verification result, tariff estimate | Public read only; never expose pending merchant drafts or private order details |
| Authenticated | Shopper profile, cart and own orders; merchant workspace; staff console | Require a valid access token and derive identity/role from the server-side user record |
| Sensitive | Password hashes, refresh token hashes, business onboarding data, order/shipping data, security events | Least-privilege reads, input validation, no sensitive values in logs |
| Secrets | Atlas URIs, JWT secrets, cookie/signing secrets | Environment or managed secret store only; never in source, CI artifacts, logs, or screenshots |

The application is not a payment processor. Escrow is a simulated state machine only. Tariff values are estimates from seeded tariff rules and are not official customs advice. Provenance hashes are application verification records, not manufacturer-signed proof of authenticity. Telemetry and generated threats are simulated unless a live data source is explicitly added and evidenced.

## 2. Identity and session rules

- Passwords are hashed with bcrypt cost 12; plaintext passwords are never stored.
- Registration password minimum is 10 characters.
- Access tokens expire after 15 minutes.
- Refresh sessions last seven days, are rotated on refresh, are stored as token hashes, and are delivered only in an httpOnly, Secure (production), SameSite=Strict cookie scoped to the authentication API.
- Five consecutive failed password checks lock an account for five minutes. Login responses do not disclose whether an email exists.
- Logout revokes the presented refresh session.
- On each protected request, authorization must use the current server-side user record. A role embedded in a stale JWT is not authoritative after a role change.
- Demo credentials and automatic demo seeding are disabled in production.

## 3. Five-role authorization model

The only authenticated roles are `shopper`, `merchant`, `inventory_manager`, `operator`, and `admin`. Visitor is unauthenticated.

The full resource/action matrix is maintained in [ROLE_PERMISSION_MATRIX.md](./ROLE_PERMISSION_MATRIX.md). Key invariants:

- Shopper reads and changes only their own cart and orders.
- Merchant ownership is established from the authenticated user’s Merchant record. Every merchant listing, stock, purchase, reward and threat read is constrained by that Merchant `merchantId`.
- The `merchantId` ownership predicate is evaluated in the same middleware as the role check, not as a frontend-only or handler convention.
- Pending merchants can manage only their own non-public drafts. They cannot publish or change stock. Admin approval/rejection requires a reason and creates an immutable audit event.
- Inventory managers can read all listings and threats and change stock for any SKU, but cannot resolve threats or change escrow.
- Operators can read all orders, change stock, resolve/manage threats, release/hold escrow, and read settings/audit.
- Admins manage listings, users/roles, hubs, tariff rules, settings, threats and escrow. An admin cannot delete or demote their own account.
- Orders, audit entries and financial history are never hard-deleted.

Every protected endpoint must return 401 for absent/invalid authentication and 403 for authenticated but unauthorized access. Ownership failures follow one consistent, tested non-disclosing policy. Request bodies cannot assign their own role, merchantId, owner, price, audit actor or escrow status.

## 4. API and browser controls

- Validate request and response boundaries using shared Zod schemas; reject unknown or invalid fields where the schema requires.
- Use Helmet security headers and a restrictive Content Security Policy; allow only configured CORS origins.
- Apply rate limits to public and authentication/checkout endpoints.
- Use request IDs in all API responses and structured JSON logs.
- Never log passwords, Authorization headers, cookies, refresh tokens, Atlas URIs, JWT secrets, or unredacted customer payloads.
- WebSocket connections are authenticated and use the same current-role authorization as REST. Privileged events are role-filtered; public events use a field allowlist and must not leak order/user/security details. Query-string tokens must be avoided because proxy logs commonly retain URLs.
- Admin self-delete and self-demotion are blocked server-side and covered by negative tests.
- CSV exports must escape formula-leading values and include only the columns authorized for the requesting role.

## 5. Database security and integrity

- Use separate Atlas database names and credentials for `verifymart_dev`, `verifymart_staging`, and `verifymart_prod`.
- Restrict Atlas network access to the application’s actual outbound IP/CIDR ranges. Do not use a permanent allow-all rule.
- Application credentials must be limited to the collections and operations required by the runtime.
- Audit writer credentials must have `find` and `insert` on `auditLog` only. They must not have `update` or `remove`. Index/collection administration uses a separate deployment principal. Audit events are append-only at database authorization level, not just by application convention.
- Money is integer cents encoded as BSON Int64 or Decimal128. Do not use floating point for stored money.
- Persist timestamps as BSON Date in UTC.
- Checkout stock decrements and order insert execute in one MongoDB transaction. If any stock update or order insert fails, the transaction aborts.
- Unique indexes protect email, merchant user ownership, SKU, batch hash, hub code, tariff key, order idempotency key and settings key.
- Provenance event arrays are capped at 50. Unbounded history belongs in a separate collection.
- Do not delete financial/audit history to satisfy ordinary account deletion.

## 6. Security test gates

- Exercise every write endpoint with an allowed role and at least one denied role.
- Test merchant A attempting merchant B’s listing, stock, purchase, rewards and threat records.
- Test inventory-manager denied threat resolution and escrow actions.
- Test shopper denied staff actions and cross-user order reads.
- Test stale JWT after role demotion.
- Test admin self-demotion and self-delete.
- Test repeated failed login lockout and refresh-token rotation/reuse.
- Confirm Atlas audit writer cannot update/delete an event.
- Run dependency/security scanning and a secret scan against the complete proposed diff before merge.
- Run axe accessibility scans on all critical journeys; zero serious/critical issues is the release gate.
