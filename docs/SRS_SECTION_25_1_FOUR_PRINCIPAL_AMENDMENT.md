# SRS §25.1 — Four-principal Atlas access amendment

**Effective date:** 2026-11-16  
**Applies to:** VerifyMart AI SRS Sections 18–27, superseding the three-principal wording in §25.1.  
**Decision source:** Project owner approval in the implementation discussion.

This amendment is normative. It documents the four distinct Atlas database principals and their non-overlapping responsibilities. The database must enforce these scopes; application code alone is not a substitute for MongoDB privileges.

| Principal / environment variable | Allowed scope | Explicit exclusions |
|---|---|---|
| Application: `MONGODB_URI` | `find`, `insert`, `update`, `remove` on exactly these ten operational collections: `users`, `merchants`, `products`, `hubs`, `tariffRules`, `orders`, `threats`, `inventoryAdjustments`, `settings`, `trustLedger`; database `listCollections` and `listIndexes` for runtime validation. | No privileges on `auditLog`; no `createCollection` or `createIndex`; no cluster/database administration. |
| Audit writer: `MONGODB_AUDIT_URI` | `insert` on `auditLog` only. Used by the application append-audit repository. | No `find`, `update`, `remove`, or privileges on operational collections. |
| Audit reader: `MONGODB_AUDIT_READ_URI` | `find` on `auditLog` only. Used only by Operator/Admin audit-review and CSV-export routes. | No `insert`, `update`, `remove`, or privileges on operational collections. |
| Migration/admin: `MONGODB_MIGRATION_URI` | Full migration/deployment privileges on the explicitly selected development/staging target database, including provision of collections and indexes during one-off CLI execution. | Never imported by the API server, runtime repositories, routes, frontend, or normal seed/application startup. No migration credential is used as a runtime fallback. |

The existing migration CLI refers to `MONGODB_AUDIT_MIGRATION_URI` when it handles `auditLog` separately from the ten operational collections. This environment variable must resolve to the **same one-off migration/admin identity** as `MONGODB_MIGRATION_URI`; it is not a fifth principal and must never point to the runtime audit writer. The CLI needs its migration-level privileges for preflight collision/count reconciliation and writes.

## Startup and readiness rules

1. The API connects independently with `MONGODB_URI`, `MONGODB_AUDIT_URI`, and `MONGODB_AUDIT_READ_URI`.
2. Runtime readiness pings all three connections. A bounded `find` permission check against `auditLog` is performed only with the read-only reader connection. The insert-only writer is never tested with a read.
3. The application connection validates only the ten provisioned operational collections and their expected indexes. It must not list or inspect `auditLog`.
4. Collections and indexes are provisioned by deployment/migration tooling before the runtime starts. Runtime startup must not create either.
5. Credentials are stored in local environment files or a secret manager; no URI/password is committed to Git. The dev/staging migration identity is used only for a deliberate one-off CLI run.

## Audit route policy

Only Operator and Admin server-side role-protected routes may read audit entries. All application audit writes continue through the insert-only writer connection. No code path should use the application principal or writer principal to query `auditLog`.

## Demo Pakistan landed-cost assumptions

Pending an approved tariff/FX source, Pakistan ACD, regulatory duty, FED, withholding, platform fee and USD/PKR conversion are seeded **demonstration placeholders**. Every user-facing estimate must state that the values are illustrative, not official customs/FBR figures or market foreign-exchange rates. Replacing them with an approved source is a separate follow-up and must not silently remove the placeholder disclosure.
