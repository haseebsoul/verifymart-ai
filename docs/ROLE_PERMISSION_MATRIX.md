# VerifyMart AI — Role & Permission Matrix (RBAC)

**Release:** Operations Command V14  
**Date:** 2026-11-13  
**Status:** Enforced via Server Middleware (`backend/src/middleware/auth.ts`) & Database (`backend/src/db.ts`)

---

## 1. Stakeholder Ecosystem Overview

| No. | Stakeholder | Database Role (`role`) | Primary Workspace | Description |
|---|---|---|---|---|
| 1 | **Shopper** | `user` | Shopper Portal | Buy verified international goods with transparent landed cost & escrow protection. |
| 2 | **Merchant** | `merchant` | Merchant Studio | Manage cross-border listings, fulfillment, verification requests, and trust score. |
| 3 | **Inventory Manager** | `inventory_manager` | Inventory Control | Warehouse stock allocation, movements, transfers, and replenishment thresholds. |
| 4 | **Operator / Auditor** | `operator` | Operations Command | Threat mitigation, provenance audit, customs hold reviews, and escrow transitions. |
| 5 | **Administrator** | `admin` | Administration Center | Platform governance, merchant approvals, user management, and tariff policies. |

---

## 2. Granular Permission Matrix

| Feature / Action | Shopper (`user`) | Merchant (`merchant`) | Inventory Manager (`inventory_manager`) | Operator (`operator`) | Administrator (`admin`) |
|---|:---:|:---:|:---:|:---:|:---:|
| **Browse Verified Catalog** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Verify Batch / Provenance** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Calculate Landed Cost** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Place Order (Escrow Held)** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **View Own Orders** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Submit Merchant Application** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Create Product Draft** | ❌ | ✅ | ❌ | ❌ | ✅ |
| **View Trust & Rewards Ledger** | ❌ | ✅ | ❌ | ✅ | ✅ |
| **View Warehouse Hub Levels** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Restock Inventory** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Transfer Inventory Hubs** | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Review & Resolve Threats** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Release / Hold Escrow** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Trigger Network Simulation** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Update System Settings** | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Approve Merchant Applications** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Manage User Roles & Status** | ❌ | ❌ | ❌ | ❌ | ✅ |
| **View Audit Logs (Append-Only)**| ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 3. Security Rules & Invariants
1. **Self-Protection:** Administrators cannot demote or suspend their own accounts.
2. **Staff Onboarding Gate:** Internal staff roles (`inventory_manager`, `operator`) require an authorized invitation token (`VERIFYMART-STAFF-2026`).
3. **Merchant Gate:** Merchant registrations create a `pending` application requiring administrator review before listing publication rights are enabled.
4. **Append-Only Audit:** All security, escrow, and inventory actions are permanently recorded in `audit_logs` protected by SQLite triggers preventing `UPDATE` or `DELETE`.
