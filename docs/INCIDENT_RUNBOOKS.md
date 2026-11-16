# VerifyMart AI — Incident Runbooks

**Specification basis:** SRS reliability and security requirements, the 99.5% API availability objective, and the five-role / Atlas architecture revision. These runbooks are operational checklists; thresholds and recovery steps must be validated against the deployed environment before production.

## Severity model

| Severity | Trigger examples | Initial response |
|---|---|---|
| SEV-1 | Public API unavailable; database outage/data loss; stock/order mismatch; unauthorized privileged access; audit integrity compromised | Declare incident, stop risky writes/checkout if integrity is uncertain, preserve evidence |
| SEV-2 | Catalog/verification or checkout degraded; sustained 5xx or latency; Atlas connection unavailable | Assign incident lead, identify affected routes/data, mitigate or roll back |
| SEV-3 | WebSocket/telemetry degraded while REST works; non-critical report/export defect | Isolate feature, communicate impact, repair without risking checkout |

## RB-01 — API unavailable

1. Capture incident start time, current deployment SHA, request IDs and last successful health check.
2. Check process/container status and `/api/health`.
3. Check `/api/ready`; readiness must include a live Atlas ping after cutover.
4. Inspect redacted structured logs and reverse-proxy routing. Do not copy cookies, Authorization headers or raw secrets into incident channels.
5. If tied to a release, roll back to the last known good artifact.
6. Verify public catalog, public verification, duty quote and one authenticated read before declaring recovery.

## RB-02 — Atlas unavailable or not ready

1. Do not switch silently to SQLite or another environment.
2. Verify Atlas cluster health, network access entry, DNS/SRV resolution, TLS, selected DB name and secret-store version.
3. Confirm the application is using the correct environment URI; never print the URI in logs.
4. Pause checkout and inventory writes if connection retries could lead to uncertain outcomes.
5. Restore connectivity, then run read-only readiness and index checks.
6. Verify collection counts and critical invariants before re-enabling writes.

## RB-03 — Checkout integrity / stock mismatch

1. Preserve the request ID, order ID, and idempotency key using a restricted incident record.
2. Stop checkout if transaction atomicity or order/stock consistency is in doubt.
3. Query the order and corresponding product stock from Atlas without modifying records.
4. Repeat the original request only with the exact same key and payload to verify idempotent replay.
5. Never decrement stock manually or delete/recreate the order to “repair” a mismatch.
6. If a transaction partially persisted, preserve evidence and reconcile through a reviewed, audited correction workflow.
7. Resume checkout only after a transaction test confirms one order and one stock decrement per idempotency key.

## RB-04 — Unauthorized role/resource access

1. Preserve request IDs, actor ID, target resource and deployment SHA.
2. Revoke the affected account’s refresh sessions or disable the account through a reviewed admin process.
3. Verify server-side role is loaded from the authoritative users collection on each protected request.
4. Check merchant ownership filters in the shared authorization middleware and audit the affected queries.
5. Review audit events and logs; do not mutate or delete audit history.
6. Test the same request as the affected role and confirm 403; test authorized role and confirm expected result.

## RB-05 — Suspected audit-log mutation or deletion

1. Treat any audit update/delete success as SEV-1.
2. Preserve Atlas audit principal identity and permission configuration.
3. Disable the affected writer credential and issue a new least-privilege credential via secret management.
4. Verify the runtime audit user has only find/insert on auditLog and no update/remove.
5. Reconcile missing events only from independently preserved source records, appending correction events rather than editing history.
6. Add a regression test for denied update/delete and verify database-role enforcement.

## RB-06 — WebSocket / telemetry outage

1. Verify REST `/api/health` and `/api/ready`; WebSocket outage must not disable REST.
2. Check upgrade forwarding, connection counts, auth-token expiry and reconnect behavior.
3. Confirm public channel exposes only its approved allowlist.
4. Keep simulated telemetry and generated threat data explicitly labeled as simulated.
5. Disable the WebSocket feature only if it threatens API stability; restore after role-filter and reconnect checks pass.

## RB-07 — Secret exposure

1. Treat exposed Atlas URIs, JWT secrets, refresh tokens or passwords as compromised.
2. Revoke/rotate the affected secret in the secret manager; do not paste the replacement into code or chat logs.
3. Remove the value from logs/artifacts and restrict access to the affected build.
4. Scan current branch history and artifacts; rotate even if a secret was later deleted from a commit.
5. Re-run secret scanning and verify startup logs report only that a development secret was generated (never its value).
6. Record scope, rotation time, impact and preventive action.

## Incident closeout

Record a blameless timeline, user impact, detection/response time, root cause and contributing conditions, data-integrity findings, recovery steps, and owner/date for every corrective action. A SEV-1 or SEV-2 requires a post-incident review before the next feature release.
