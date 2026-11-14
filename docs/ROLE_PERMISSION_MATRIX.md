# VerifyMart AI — Full Role Permission Matrix

**Source:** SRS Sections 18, 19.1–19.5 and 20.  
**Rule:** All permissions below are enforced by the server. Hiding a React control is not an authorization boundary.

## 1. Resource matrix

Legend: **R** = read; **C** = create; **U** = update; **D** = delete only where explicitly permitted; **Own** = authenticated user's or merchant's own records; **Draft** = non-public merchant draft; **Stock** = stock fields only; **Resolve** = resolve threat; **Manage** = manage permitted state transitions; **—** = no access.

| Resource / action | Visitor | Shopper | Merchant | Inventory Manager | Operator | Admin |
|---|---:|---:|---:|---:|---:|---:|
| Public catalog | R | R | R | R | R | R |
| Public verification (SKU, batch hash, order ID) | R | R | R | R | R | R |
| Duty / landed-cost estimate | R | R | R | R | R | R |
| Own cart | — | CRUD Own | — | — | — | — |
| Own orders | — | Create / Read / Update state Own; no hard delete | — | — | R all | R all |
| Merchant purchases | — | — | R Own merchant SKUs | — | R all | R all |
| Merchant listings | — | — | CRUD Own; pending merchants Draft only | R all | R all | CRUD all |
| Product stock | — | — | U Stock Own SKUs | U Stock any SKU | U Stock any SKU | U Stock any SKU |
| Inventory adjustments | — | — | C Own SKUs | C any SKU | C any SKU | C any SKU |
| Threats | — | — | R Own-SKU threats | R all | R / Resolve all | R / Manage all |
| Escrow | — | — | — | — | R / release / hold | R / Manage |
| Hubs | R | R | R | R | R | CRUD |
| Tariff rules | R | R | R | R | R | CRUD |
| Users and roles | — | — | — | — | — | CRUD, subject to self-protection |
| Merchant approval / rejection | — | — | — | — | — | C / U |
| Settings and thresholds | — | — | — | — | R | CRUD |
| Audit log | — | — | — | — | R | R |
| Trust ledger / merchant rewards | — | — | R Own merchant ledger | — | R | CRUD / manage |

**Deletion constraints:** Orders, audit records and financial history are never hard-deleted by any role. Merchant listing deletion is a soft archive/unpublish operation so provenance and purchase history remain intact. Admin cannot delete or demote their own account.

## 2. Authentication and account lifecycle

| Account state | Public visibility | Allowed actions |
|---|---|---|
| Visitor | Public catalog, verification and duty calculator | No authenticated writes |
| Shopper | Public catalog and own account data | Own cart and orders |
| Merchant, pending | Public catalog unaffected; own draft workspace only | Read/update own merchant profile and own draft listings; cannot publish |
| Merchant, approved | Approved listings may appear publicly | Manage own listings, own SKU stock, own purchases and own-SKU threat visibility |
| Merchant, rejected | No public listings from the rejected merchant | Read rejection decision and resubmit through onboarding |
| Inventory Manager | Public catalog plus authenticated inventory console | Read all listings/threats, adjust stock across merchants; no escrow release or threat resolution |
| Operator | Public catalog plus operations console | Read all orders, update stock, manage/resolve threats, release/hold escrow, read settings/audit |
| Admin | Full governance console | Manage users/roles/listings/hubs/tariffs/settings/threats/escrow; cannot self-delete or self-demote |

Merchant self-registration creates a pending Merchant record. Pending merchants may create drafts, but drafts must not be returned by public catalog queries. Admin approval and rejection both require a reason and create an immutable audit event. A merchant has one associated merchant record (unique userId).

## 3. Server-side enforcement map

| API capability | Required server check |
|---|---|
| Shopper cart/order read and mutation | Valid session, role shopper, and userId equals authenticated user ID for every resource |
| Merchant listing create/read/update/archive | Valid session, role merchant or admin; ownership by the same authorization middleware; pending merchants can mutate only Draft listings |
| Merchant purchase and threat read | Valid session, role merchant; query constrained to products with authenticated merchantId |
| Merchant stock change | Valid session, role merchant; same middleware asserts product merchantId equals actor merchant ID; only stock fields allowed |
| Inventory stock change | Valid session, role inventory_manager, operator or admin; schema prevents price/listing/ownership edits for inventory managers |
| Threat resolution / management | Valid session, role operator or admin; inventory managers and merchants receive 403 |
| Escrow release / hold | Valid session, role operator or admin; validate current state and allowed transition in service |
| User/role management | Valid session, role admin; self-role changes and self-delete rejected in backend |
| Hubs, tariff rules and settings writes | Valid session, role admin |
| Audit log | Operator/admin read only; writes originate from trusted backend code and use a DB principal with insert/find only |

The merchant merchantId predicate must live in the same authorization middleware as the role check. Do not authorize with a role check in one middleware and rely on a later route handler to remember ownership.

## 4. Deny-by-default requirements

1. No role is inferred from a request body, query parameter, browser-supplied header or local storage. The authoritative role comes from the authenticated user record.
2. Missing authentication returns 401. Authenticated but unauthorized requests return 403. Ownership mismatches return 403 (or a consistent, tested non-disclosing 404 policy).
3. Every write endpoint has a request schema and authorization tests for allowed and denied roles.
4. Role changes take effect on the next request; stale access tokens must not preserve privileges after demotion.
5. Inventory managers cannot change price, merchant ownership, listing visibility, threat state, escrow, roles or platform settings.
6. Merchants cannot read or write another merchant's listings, stock, purchases, rewards or threats.
7. Admin self-protection is tested for both role change and account deletion.
8. Audit records are append-only at the database credential level, not merely by convention in application routes.
