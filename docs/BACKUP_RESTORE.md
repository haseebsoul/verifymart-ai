# VerifyMart AI — Backup and Restore Plan

**Specification basis:** SRS Section 20 (Atlas migration), reliability targets and recovery objectives. Target recovery objectives: **RPO 1 hour** and **RTO 30 minutes**. These are requirements, not measured guarantees for the current M0 development cluster.

## 1. Environment and backup boundary

Use separate Atlas environments/databases: `verifymart_dev`, `verifymart_staging`, and `verifymart_prod`. The current development database is `verifymart_dev` on the existing M0 cluster. The legacy `verifymart_v14` database is not a replacement for a production backup and must not be repointed or overwritten.

Production backup/PITR capability depends on the selected Atlas tier and configured backup policy. An M0/free cluster is not evidence that the required production backup or point-in-time recovery features are available. Select a production tier that supports the required recovery controls before launch.

## 2. Required protections

- Enable and verify Atlas continuous/cloud backups and point-in-time recovery on the production cluster where supported by the selected tier.
- Set retention that meets organizational/legal policy and keep an independent encrypted export for critical recovery scenarios.
- Use separate least-privilege backup/restore credentials held in the secret manager.
- Restrict Atlas network access to application/operations outbound IPs.
- Record cluster, project, database, region, backup policy, retention, last successful backup and last successful restore test in the production operations record.
- Audit all restore operations and restrict them to authorized operators/admins through a break-glass process.
- Do not log secrets or backup download URLs.

## 3. Recovery objectives and alerting

| Objective | Target | Operational interpretation |
|---|---:|---|
| RPO | 1 hour | At most one hour of committed data should be lost at recovery point |
| RTO | 30 minutes | Restore critical service within thirty minutes after declaring recoverable incident |

Alert on backup failure, missing restore points, retention-policy drift, restore-test failure, unexpected database/cluster deletion, and mismatch between configured and approved cluster region/tier.

## 4. Backup verification

At least monthly, and after material database or tier changes:

1. Confirm the latest successful Atlas backup timestamp and retention window.
2. Confirm backup coverage includes all eleven required collections.
3. Verify the restore target is an isolated recovery database/cluster, never production source.
4. Restore a point-in-time snapshot to the isolated target.
5. Compare expected collection names, indexes and document counts.
6. Run integrity checks: unique email/SKU/batch/idempotency keys; order items reference products; no negative stock; money values remain integer cents; timestamps decode as UTC BSON Date; audit events are readable and unchanged.
7. Run read-only application health and API checks against restored data.
8. Record actual RPO/RTO observed, gaps and corrective work.

## 5. Restore procedure

1. Declare incident severity and appoint incident lead.
2. Select recovery timestamp based on incident onset and latest known-good state; preserve the original cluster for forensics when possible.
3. Obtain the approved break-glass approval and restore into a new isolated cluster/database using Atlas restore tooling.
4. Apply the same schema/index migration version as the application release. Do not write new application data before required unique indexes are confirmed.
5. Verify document counts and critical invariants against the last known-good record.
6. Update the secret manager with the restored connection URI only after network allowlists and least-privilege roles are configured.
7. Start the application in read-only/maintenance mode; verify `/api/ready`, catalog, verification and order history.
8. Reconcile any post-backup orders/inventory from preserved transaction logs or approved audit evidence; never edit audit rows.
9. Switch traffic after sign-off. Preserve original source snapshots until the incident review is complete.
10. Record actual data-loss window and recovery time; compare with 1-hour RPO / 30-minute RTO target.

## 6. SQLite migration transition

The SQLite migration utility is dry-run-first and reads its source database read-only. It must preserve source IDs, map legacy records with `migratedFrom: "sqlite-v1"`, and compare source row counts with destination documents. Run first against staging, never production. Cutover is blocked until all source entities have documented mappings, count comparisons match, and E2E acceptance passes. Do not drop the SQLite source database as part of migration.

## 7. Release and restore checklist

- [ ] Production Atlas tier supports required backup/PITR policy.
- [ ] RPO/RTO targets are documented and exercised.
- [ ] Backup and restore credentials are least privilege and secret-managed.
- [ ] Restore test covers all eleven collections and indexes.
- [ ] Document counts and application integrity checks pass.
- [ ] Application readiness and smoke tests pass against restored database.
- [ ] Rollback URI/traffic cutover owner is assigned.
- [ ] No backup secrets or raw URIs appear in logs, CI output or Git.
