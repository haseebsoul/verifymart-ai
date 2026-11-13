# Requirements traceability

This matrix maps the uploaded SRS IDs to the current prototype source areas. It is an implementation index, not a claim that external production integrations or all target performance measurements have been verified.

| SRS area | Implementation |
|---|---|
| FR-AUTH-01–06 | `backend/src/routes-auth.ts`, `backend/src/middleware/auth.ts`, `frontend/src/pages/LoginPage.tsx`, `frontend/src/context/AuthContext.tsx` |
| FR-AUTH-07 | `/api/auth/mode` and demo fill, enabled only outside production |
| FR-AUTH-08 | Five failed passwords trigger a five-minute lock in `routes-auth.ts` |
| FR-CAT-01–05 | `routes-catalog.ts`, 24 seeded items in `seed.ts`, `StorePage.tsx`, `ProductCard.tsx` |
| FR-CAT-06 | Cart landed-cost estimate via `CartDrawer.tsx` and `/api/duty/calculate` |
| FR-VER-01–06 | `services/verification.ts`, `/api/verify/:query`, `VerifyPage.tsx`, sample chips and simulated-data notice |
| FR-DUTY-01–05 | `services/duty.ts`, shared `dutySchema`, destination tariff seed and deterministic line rounding |
| FR-DUTY-06 | Landing page sample-basket calculator and explicitly stated illustrative legacy assumption |
| FR-ORD-01–07 | Persisted Zustand cart, quote refresh, idempotent `/orders/checkout`, transactional stock decrement and held order/escrow record |
| FR-ORD-08–09 | Operator release/hold routes, confirmation UI, append-only audit log |
| FR-OPS-01–02 | `/api/metrics`, overview KPIs and Recharts visualizations |
| FR-OPS-03 | `TopologyPage.tsx`: five SVG route nodes and an accessible table alternative (SVG is used instead of a literal Canvas element) |
| FR-OPS-04 | Three API-backed business simulations in `routes-ops.ts` |
| FR-OPS-05–06 | Threat list, severity/type filtering, API restock and threat resolution |
| FR-OPS-07 | Authenticated WebSocket event feed with 500-line client buffer and filters |
| FR-OPS-08 | Settings steppers and editable inventory rows. Press-and-hold accelerated repeat and timed undo are not implemented in this prototype. |
| FR-OPS-09 | Seeded merchant trust score and points ledger (`/api/rewards`) |
| FR-OPS-10 | Server-side CSV audit export with UTF-8 BOM and date range |
| FR-OPS-11 | Five sequential API health checks with min/average/max round-trip times |
| FR-ADM-01–05 | Admin-only user list, role change, two-step email confirmation, self-protection and audit entry |
| NFR-UX-01–04, 06 | Semantic controls, visible focus styles, textual status labels, reduced-motion CSS and responsive layouts; manual keyboard/device checks remain necessary |
| NFR-UX-05, 07 | Three-color base theme and semantic contrast-conscious patterns are present. A fourth-value high-contrast mode and a completed axe audit on every route remain follow-up work. |
| NFR-MNT-01–05 | Strict TypeScript, shared Zod body schemas, workspace packages and ESLint/Prettier CI configuration; domain coverage target must be measured in CI. |
| SRE / 99.5% target | `/api/health`, `/api/ready`, request IDs, structured logs and implementation-defined plan in `SRE_PLAN.md`; external SLI aggregation and alert delivery are not shipped. |

## Known implementation decisions / gaps

- The actual uploaded file ends at section 11.6. The detailed SRE requirements it references as sections 12–17 were not present in the uploaded document. `SRE_PLAN.md` identifies which reliability objective is explicit and which alerting/runbook policies were independently defined for this prototype.
- `FR-OPS-03` uses a responsive SVG topology with table alternative rather than the literal HTML Canvas specified in the UI section.
- `FR-OPS-08` steppers are click-operated; press-and-hold repeat and ten-second undo are not included.
- High-contrast mode and a completed axe scan for all routes have not been delivered; the strict three-value base palette can only partially satisfy small-text contrast requirements as the SRS itself notes.
- Load-test p95, FCP, bundle-gzip and 80% service coverage targets are objectives, not confirmed measurements.
- Demo provider integrations are intentionally simulated. No live payment, customs, manufacturer provenance, carrier or FX provider is connected.
