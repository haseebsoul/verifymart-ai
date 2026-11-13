# VerifyMart AI — Site Reliability Engineering Plan

## Source boundary

The uploaded baseline identifies this document as an SRS **and** SRE plan and its contents list sections 12–16 for SLOs, monitoring, incident response and chaos testing. The uploaded file itself ends at section 11.6; those detailed sections were not present in the provided material. This plan preserves the explicit SRS reliability target and supplies a clearly marked implementation plan for the prototype. It must not be described as text copied from the missing source sections.

## 1. Service boundary and critical user journeys

The v1 service is one Express API process, a SQLite database, a WebSocket telemetry hub and a React/Vite static frontend. The primary critical journeys are:

1. Public visitor reads catalog and verification data.
2. Shopper receives a deterministic landed-cost quote and completes an idempotent simulated escrow checkout.
3. Operator sees telemetry, investigates threats and inventory, and holds/releases escrow.
4. Administrator manages user roles and access.

The public verification flow and server-side checkout transaction are treated as the most business-critical paths. A WebSocket outage must not take down REST catalog, verification, quote or checkout functionality.

## 2. Service level objectives

### Explicit baseline objective

| SLI | SLO | Window | Definition |
|---|---:|---|---|
| API availability | **99.5%** | Rolling 30 days | Successful non-5xx API requests / eligible API requests. Planned maintenance is not automatically excluded unless declared before the window. |

The 99.5% target is stated in the SRS. A 30-day window contains 720 hours; a 0.5% error budget is 3.6 hours (216 minutes).

### Additional prototype targets

The following are derived from the non-functional requirements in the SRS:

| SLI | Target | Measurement |
|---|---:|---|
| Catalog and verification latency | p95 < 300 ms | Server request duration, endpoint family split |
| Duty calculation latency | p95 < 150 ms | Server request duration for `/api/duty/calculate` |
| Landing-page first contentful paint | < 2.0 s | Throttled fast-3G browser run |
| Initial JS bundle | < 250 KB gzip | Vite build output / bundle analyzer |
| Canvas/network animation | >= 55 fps | Mid-range laptop; reduced-motion disables looping motion |
| Domain-service tests | >= 80% line coverage target | Duty, verification and checkout services |

These are targets, not claimed achieved measurements. CI build/test success is required; load, browser performance, accessibility and coverage must be measured in the target runtime before an SLO is declared met.

## 3. Error budget policy

- At 50% of the rolling 30-day budget consumed: review deployment frequency, open incidents and error causes before the next release.
- At 75% consumed: pause non-critical changes and prioritize reliability fixes.
- At 100% consumed: freeze feature releases except approved reliability/security work until the SLO recovers.
- A checkout correctness failure, stock underflow, duplicated idempotent order or audit-log mutation is a release-blocking incident even if aggregate availability remains within budget.

For a prototype, an operator can calculate the budget from request/error logs or an external monitor. The current repository does not ship a persistent SLI aggregation backend; the dashboard's 99.5% figure is a demo indicator, not a live measured availability calculation.

## 4. Monitoring and alert thresholds

### Implemented instrumentation

- `X-Request-Id` is emitted for every API response and included in the common error envelope.
- Express request logging uses structured JSON logging.
- `/api/health` reports process liveness and `/api/ready` checks SQLite readiness.
- The WebSocket simulator emits a `TELEMETRY_TICK` every two seconds and the operations UI reports connection state.
- The database uses SQLite WAL mode, foreign-key enforcement and a five-second busy timeout.

### Recommended alert rules (implementation-defined)

These thresholds are proposed operational defaults, not source-specified values:

| Alert | Threshold | Severity | First response |
|---|---|---|---|
| API unavailable | `/api/health` fails 2 checks in a row | SEV-1 | Check process, host, reverse proxy and recent deploy |
| Database not ready | `/api/ready` returns 503 for 1 minute | SEV-1 | Check disk, permissions, SQLite file/WAL, restore path |
| Elevated 5xx | 5xx ratio > 5% for 5 minutes | SEV-2 | Group by route/request ID; check dependency and recent changes |
| Catalog / verify latency | p95 > 300 ms for 10 minutes | SEV-2 | Inspect DB query plans, CPU, I/O and request volume |
| Duty latency | p95 > 150 ms for 10 minutes | SEV-2 | Inspect tariff lookup and database contention |
| WebSocket degradation | > 25% operator disconnects within 5 minutes | SEV-3 | Check proxy upgrade support, auth-token expiry and server load |
| Error budget burn | > 14.4x sustainable burn over 1 hour and 6 hours | SEV-1 | Halt feature releases and start incident process |

A production deployment should export request duration, HTTP status, route template, active websocket connections, queue depth, SQLite busy/error counts, process memory and restart count to a real monitoring system. Do not attach raw credentials, cookies, refresh tokens or full customer payloads to logs.

## 5. Incident response

### Severity levels

- **SEV-1:** checkout integrity, stock consistency, unauthorized operator/admin access, database loss or API-wide outage.
- **SEV-2:** verification/catalog unavailable, sustained elevated API errors/latency or escrow actions unusable while core API is up.
- **SEV-3:** WebSocket degradation, non-critical reporting/export defect or isolated dashboard feature failure.

### Response sequence

1. Acknowledge the alert and record start time, severity, impact and incident lead.
2. Capture request IDs, deployment version, health/readiness state and relevant logs without exposing secrets.
3. Protect data integrity first: pause checkout or staff mutations when duplicate/partial state is suspected.
4. Mitigate by rollback, process restart, traffic reduction or feature isolation. Do not manually edit audit rows.
5. Verify health/readiness, catalog lookup, a test quote, idempotent checkout replay and role restrictions after mitigation.
6. Communicate impact and current state to users/reviewers; close only after SLIs recover.
7. Write a blameless post-incident review with timeline, contributing factors, detection gaps and assigned follow-up work.

## 6. Runbooks

### API is unavailable

- Check process and container status, `/api/health`, port 8000 and reverse-proxy routing.
- Inspect the newest request ID and structured logs.
- Confirm environment variables and the configured frontend CORS origin.
- Restart only after capturing logs. If the issue began with a release, roll back to the last known good image.
- Re-run public verification and quote smoke tests.

### Database is not ready or disk is full

- Stop writes and check free disk space, permissions, mount state and SQLite file/WAL files.
- Preserve the database and WAL before any repair attempt. Do not delete a live WAL file.
- Restore from the latest verified backup if integrity checks fail; record the recovery point and data-loss window.
- Validate row counts, foreign keys, stock non-negativity, orders and audit records.
- Resume checkout only after a successful readiness and transaction smoke test.

### Checkout reports stock conflict or possible duplicate

- Use the request ID, order ID and idempotency key to locate the transaction record.
- Re-submit only with the original idempotency key when confirming replay behavior.
- Never decrement stock manually. Inspect order, order items and current product stock in one consistent database snapshot.
- Escalate any mismatch between order records and inventory; preserve evidence and keep the escrow in a safe held state.

### Telemetry socket is disconnected

- Confirm REST health remains green; REST availability is independent of the socket.
- Check websocket upgrade forwarding at the proxy and confirm the short-lived access token is current.
- Verify the client reconnects after a page refresh and public events contain no privileged payload.

## 7. Chaos and resilience testing

The operator console includes deterministic business simulations for customs hold, counterfeit surge and auto-rebalance. These validate operator workflows; they are **not** infrastructure chaos testing. Before production, add isolated staging experiments:

- Kill the API process during normal read traffic and verify restart/health recovery.
- Restart the process during an active SQLite WAL write and verify committed orders remain consistent.
- Drop WebSocket connections while REST requests continue; verify UI reconnect state and REST degradation behavior.
- Add latency to the database or reverse proxy and check p95 alarms.
- Exhaust disk space in an isolated disposable environment and verify readiness fails safely.
- Replay checkout requests with same and conflicting idempotency keys; verify one stock deduction and one order for the matching key.

All fault-injection experiments must run in isolated test/staging data, never against a real payment or production ledger.

## 8. Backup, recovery and deployment

- Persist `/app/data` (or configured `DATABASE_PATH`) on a durable volume.
- Use SQLite's online backup API or a consistent filesystem snapshot; copying only the main database file while WAL writes are active is not a safe backup procedure.
- Keep encrypted off-host backups and periodically test restores.
- Container health checks should use `/api/ready`; reverse proxy must support HTTP and WebSocket upgrade paths.
- CI gates strict TypeScript, production build, unit tests and palette linting.
- Production startup does not run demo seeding. Demo credentials must never be enabled in production.

## 9. SRE acceptance checklist

- [ ] API and frontend production builds pass on Node.js 20+.
- [ ] `/api/health` and `/api/ready` behave as documented.
- [ ] 99.5% availability is measured over a rolling window by an external monitor.
- [ ] Catalog/verification p95 < 300 ms and duty p95 < 150 ms under the specified load test.
- [ ] Same-key checkout replay returns original order; conflicting key payload returns 409.
- [ ] SQLite restart and backup/restore exercise shows no committed order loss.
- [ ] WebSocket failure does not take down REST flows; operator socket requires authorized role.
- [ ] Alerts, incident owner, runbooks, rollback and communication channels are tested.
- [ ] Production demo accounts and seed routine are disabled.
