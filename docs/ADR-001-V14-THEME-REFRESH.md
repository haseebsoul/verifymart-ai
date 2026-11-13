# Architecture Decision Record: V14 Unified Theme & Visual Continuity Refresh

**Status:** Accepted  
**Date:** 2026-11-13  
**Deciders:** Principal Software Architect, Senior UI/UX Lead  
**Scope:** VerifyMart AI Repository (`C:\Users\Hp\verifymart-ai`)

---

## 1. Context & Problem Statement
Prior iterations of VerifyMart AI presented an inconsistent user experience:
- The public landing page featured a warm editorial theme (cream and sage).
- The authenticated operations console switched abruptly into an unbranded dark obsidian palette.
- TSX components used ad-hoc styling and hardcoded color literals, creating friction and brand fragmentation.

## 2. Decision
Adopt a single, canonical design system across both public storefront and authenticated operations dashboards:
1. **Centralized CSS Variables on `:root` in `frontend/src/styles.css`**:
   - `--bg-root: #09090B` (Deep Obsidian Base)
   - `--bg-sidebar: #0C0C0E` (Deep Charcoal Sidebar)
   - `--bg-card: #121216` (Elevated Glass Card Surface)
   - `--bg-editorial-cream: #F3EEE3` (Warm Cream Editorial Accent)
   - `--text-primary: #FFFFFF`
   - `--text-secondary: #A1A1AA`
   - `--text-muted: #52525B`
   - `--accent-lime: #B6FF00` (Volt Lime for Live Sync and Verified states)
   - `--accent-burnt-orange: #D9541E` (Editorial Brand Accent)
   - Status tokens: Positive (`#10B981`), Warning (`#F59E0B`), Critical (`#F43F5E`).

2. **Semantic Token Rule**: Zero hardcoded hex literals inside `.tsx` components. All badges, buttons, cards, and borders reference semantic classes (`.badge-lime`, `.badge-orange`, `.button-brand`, `.bg-glass`).

3. **Motion Language**: Standardized micro-interactions, layout transitions, and live telemetry indicators across all 5 stakeholder views.

## 3. Consequences & Validation
- **Positive:** Seamless visual transition between public pages (`/`, `/store`, `/verify`) and authenticated workspaces (`/dashboard/*`).
- **Positive:** Improved accessibility contrast and clear semantic state representation.
- **Validation:** Production bundle verified with `vite build` (0 warnings).
