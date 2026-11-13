# VerifyMart AI — Security Model & Threat Assessment

**Release:** Operations Command V14  
**Date:** 2026-11-13  
**Status:** Approved & Enforced

---

## 1. Authentication & Session Security
- **Password Storage:** bcrypt algorithm with work factor `12`.
- **Brute Force Protection:** Account lockout after 5 consecutive failed login attempts for 5 minutes (enforced in `routes-auth.ts`).
- **Token Strategy:**
  - Short-lived JWT Access Tokens issued in authorization responses.
  - Opaque refresh tokens stored in database session table and delivered via `httpOnly`, `SameSite=Strict`, secure cookies (`vm_refresh`).
  - Refresh token rotation on each refresh request; previous token immediately revoked.
- **Demo Mode Isolation:** Demo account autofill is restricted strictly to non-production environments (`NODE_ENV !== 'production'`). Public administrator self-registration is permanently blocked.

---

## 2. Authorization & RBAC
- Role-based authorization enforced via centralized Express middleware (`requireRole(...)`).
- Frontend navigation and UI gating dynamically adapt to the authenticated role, while the backend independently enforces authorization on every single API endpoint.
- Resource ownership validation prevents Horizontal Privilege Escalation (IDOR): Users can only access their own orders and profile data.

---

## 3. Data Integrity & Financial / Escrow Safeguards
- **Integer Cents Currency:** All financial values, landed costs, taxes, and escrow balances are stored as integer cents to eliminate floating-point precision errors.
- **Idempotent Checkout:** Orders use client-supplied or generated idempotency keys to prevent duplicate billing or double inventory deduction.
- **Database Transactions:** Multi-entity operations (such as inventory decrement + order creation + escrow hold generation) execute inside atomic SQLite transactions.
- **Append-Only Audit Trail:** Database triggers explicitly abort any attempt to `UPDATE` or `DELETE` historical records from the `audit_logs` table.

---

## 4. Network & WebSocket Telemetry Security
- Express application hardened with CORS allowlists, Helmet HTTP headers, and JSON body parsing limits.
- Telemetry WebSocket server at `/ws/telemetry` validates the JWT token before accepting client subscriptions.
