# LendLoop

Borrow what you need. Lend what you don’t. A neighborhood tool-lending board built with **Next.js (App Router)**, **TypeScript**, **Clerk**, **Convex**, and **n8n**.

## Architecture
- **Frontend (Next.js App Router + TypeScript):** Public read-only view of available tools (`name` and `category` only) plus an authenticated workspace (`All Tools`, `My Listings`, `My Requests`, `Incoming Requests`) with category filtering and loan lifecycle controls.
- **Auth & Server-Side RBAC (Clerk + Convex):** Clerk authenticates users and passes identity tokens to Convex. Every Convex query and mutation enforces authorization server-side (`user` vs. `admin`), audit-logging mutations in `auditLogs`.
- **Workflow Automation (n8n):**
  1. `n8n/request-notification.json`: Triggered by webhook on loan creation/status changes, verifies HMAC signature, and writes back idempotently to Convex.
  2. `n8n/overdue-reminders.json`: Runs on a daily schedule, fetches overdue loans via signed Convex HTTP endpoint, and idempotently records reminder state.

## Local Setup & Docker Compose
1. Install dependencies: `npm install`
2. Configure environment variables (`.env.local` and Convex environment variables):
   - `NEXT_PUBLIC_CONVEX_URL`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `LENDLOOP_WEBHOOK_SECRET` (Convex env + n8n env)
   - `N8N_LOAN_WEBHOOK_URL` (Convex env)
   - `CONVEX_HTTP_BASE_URL` (n8n env, e.g. `https://<deployment>.convex.site`)
   - `LENDLOOP_ADMIN_CLERK_IDS` (optional comma-separated Clerk user IDs in Convex env)
3. Start n8n locally via Docker:
   ```bash
   docker compose up -d
