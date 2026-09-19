# Real-Time Client Project Dashboard - Backend

Backend service built with Node.js, Express, TypeScript, PostgreSQL, Prisma, Socket.io, and node-cron.

## Implementation Status (Phases 1–10 Complete)

- **Phase 1**:
  - TypeScript + Express project initialized.
  - Prisma ORM configured with PostgreSQL.
  - Database schema created with all relational models, enums, and foreign-key indexes.
  - Database migration applied (`20260918202435_init`).
  - Comprehensive seed data populated (7 users, 4 clients, 4 projects, 24 tasks, 13 activity logs, 4 notifications).
- **Phase 2**:
  - Auth module implemented: `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/refresh`, `POST /api/auth/logout`.
  - JWT Access Token (15m TTL) in JSON payload + Refresh Token (7d TTL) in httpOnly, Secure, SameSite=Strict cookie.
  - `auth` middleware (verifies Bearer token and attaches `req.user = { id, role }`).
  - `requireRole(...roles)` middleware (enforces role guards, e.g. Admin-only registration).
  - Zod validation middleware on routes with standard `{ error: { code, message } }` error formatting.
- **Phase 3**:
  - CRUD modules implemented: Users (`/api/users`), Clients (`/api/clients`), Projects (`/api/projects`), Tasks (`/api/tasks`, `/api/projects/:id/tasks`).
  - Strict Service-Layer Role Scoping:
    - **PM Isolation**: PMs can only access and create tasks in projects they own (`pmId === user.id`).
    - **Developer Isolation**: Developers can only query and view tasks assigned to them (`assigneeId === user.id`).
    - **Assigned Dev Project Access**: Developers can only view project details (`GET /api/projects/:id`) if they are assigned to at least one task within that project.
- **Phase 4**:
  - `PATCH /api/tasks/:id/status`: Atomic task status update writing `ActivityLog` entries (`fromStatus`, `toStatus`, `userId`, `taskId`, `projectId`, `createdAt`).
  - Role-based authorization: Admin, Owning PM (`project.pmId === user.id`), and Assigned Developer (`task.assigneeId === user.id`). All other users receive 403 Forbidden.
  - `GET /api/tasks/:id/activity`: Scoped retrieval of task activity history.
- **Phase 5**:
  - Socket.io server with handshake JWT verification (`socket.handshake.auth.token`).
  - Role-scoped room joining on connection:
    - `project:{projectId}`: Admin joins all project rooms; PM joins owned project rooms; Dev joins rooms for assigned projects.
    - `user:{userId}`: Dedicated user room for private events/notifications.
    - `presence`: Global room for presence tracking.
  - Real-time `activity:new` event emission on `PATCH /api/tasks/:id/status` broadcasted to the task's `project:{projectId}` room.
  - Missed-event catchup endpoint: `GET /api/activity?projectId=&since=&limit=20` reading directly from `ActivityLog`.
- **Phase 6**:
  - In-memory presence tracking: counts unique active users online, handling multi-tabbing gracefully.
  - Real-time `presence:count` event: emitted to `presence` room on connection and disconnection.
  - Handled client-to-server `presence:join` event.
  - `getOnlineUsersCount()` helper exported for dashboard aggregations.
- **Phase 7**:
  - DB-backed notifications for task assignment (sent to assignee) and move-to-In-Review (sent to project PM).
  - Real-time `notification:new` socket event emitted to `user:{userId}` room.
  - REST endpoints: `GET /api/notifications` (own notifications + unreadCount), `PATCH /api/notifications/:id/read` (scoped to owner), `PATCH /api/notifications/read-all`.
- **Phase 8**:
  - Role-specific dashboard aggregate endpoints:
    - `GET /api/dashboard/admin` (Admin only): global totals, overdue count, live presence count, status breakdown, and recent activity.
    - `GET /api/dashboard/pm` (PM only): own projects summary with progress percentages, status/priority breakdowns, due-this-week count, and PM-scoped activity.
    - `GET /api/dashboard/developer` (Developer only): assigned tasks summary, status/priority breakdown, and assigned tasks sorted by priority (`CRITICAL` > `HIGH` > `MEDIUM` > `LOW`) then due date.
- **Phase 9**:
  - Background overdue-task job with `node-cron` running every 5 minutes (`*/5 * * * *`).
  - Automatically sweeps tasks where `dueDate < new Date()`, `isOverdue: false`, and `status != 'DONE'`, updating `isOverdue: true`.
  - Zero page-load computation.
- **Phase 10**:
  - Production-ready containerized setup with `Dockerfile` (Node 20 Alpine) and `docker-compose.yml` (`postgres:16-alpine` + backend).
  - Automated migration deployment and seeding on container boot.

---

## Docker Quickstart

To run the entire backend and PostgreSQL database in Docker:

```bash
docker compose up --build
```

This starts:
- **PostgreSQL 16** on `localhost:5432` with healthcheck.
- **Backend API & WebSockets** on `http://localhost:4000`, running `prisma migrate deploy && prisma db seed && node dist/server.js`.

To stop the services:
```bash
docker compose down
```

---

## Local Setup (Without Docker)

### 1. Prerequisites
- Node.js 20+
- PostgreSQL 16+ running locally

### 2. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure `DATABASE_URL` points to your PostgreSQL instance:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dashboard?schema=public"
ACCESS_TOKEN_SECRET=your_access_token_secret_here
REFRESH_TOKEN_SECRET=your_refresh_token_secret_here
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
CLIENT_URL=http://localhost:5173
PORT=4000
NODE_ENV=development
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Migrations & Seed
```bash
npx prisma migrate dev --name init
npx prisma db seed
```

### 5. Start Development Server or Run Test Suites
```bash
# Run dev server with tsx watch
npm run dev

# Run automated test suites
npm run test:auth          # Auth module, JWT cookies, role guards
npm run test:crud          # CRUD & service-layer role isolation
npm run test:activity      # Task status patch & ActivityLog transaction
npm run test:socket        # Socket handshake auth & room emissions
npm run test:presence      # Presence tracking & multi-tabbing count
npm run test:notifications # DB notifications & notification:new event
npm run test:dashboard     # Role-specific dashboard aggregates
npm run test:job           # node-cron overdue tasks sweep logic
```
Check health endpoint: `GET http://localhost:4000/health`

---

## Free Deployment (Render + Neon)

Per Section 11 of `backend-spec.md`:

### 1. Database: Neon (neon.tech)
1. Create a free PostgreSQL project at [neon.tech](https://neon.tech).
2. Copy the pooled connection string provided by Neon.
3. Use this connection string for `DATABASE_URL`.

### 2. API & WebSockets: Render (render.com)
1. Create a new **Web Service** on Render and connect the repository.
2. Configure service settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npx prisma generate && npm run build`
   - **Start Command**: `npx prisma migrate deploy && npm run start`
3. Add Environment Variables in the Render Dashboard:
   - `DATABASE_URL`: Your Neon connection string
   - `ACCESS_TOKEN_SECRET`: Random secure 32+ character string
   - `REFRESH_TOKEN_SECRET`: Random secure 32+ character string
   - `ACCESS_TOKEN_TTL`: `15m`
   - `REFRESH_TOKEN_TTL`: `7d`
   - `CLIENT_URL`: URL of your frontend deployment (e.g. Vercel)
   - `PORT`: `4000`
   - `NODE_ENV`: `production`
4. Deploy the service. Render free tier natively supports WebSockets.

---

## Architectural Decisions & Justifications

### 1. Socket.io vs. Raw WebSockets
- **Decision**: Used `Socket.io` rather than native raw WebSockets (`ws`).
- **Justification from backend-spec.md**:
  - **Rooms & Namespaces**: Socket.io has built-in primitives for room management (`project:{id}`, `user:{id}`, `presence`). Implementing role-scoped broadcasting, private user notification delivery, and presence tracking in raw WebSockets would require hand-rolling complex connection registries, room mapping data structures, and cross-socket message routing.
  - **Connection Resilience**: Automatic reconnection with exponential backoff and jitter out of the box.
  - **Transport Fallback**: Seamless fallback to HTTP long-polling if corporate firewalls or proxies block WebSockets.
  - **Handshake Authentication**: Native support for passing JWT tokens during connection handshake (`socket.handshake.auth.token`).

### 2. node-cron vs. Bull / Redis-Backed Queues
- **Decision**: Used `node-cron` for the overdue tasks background job instead of a distributed queue like `Bull` or `BullMQ`.
- **Justification from backend-spec.md**:
  - **Single Recurring Sweep**: The application requirements call for exactly one recurring sweep (`*/5 * * * *`) that executes an idempotent database update:
    ```sql
    UPDATE "Task" SET "isOverdue" = true WHERE "dueDate" < NOW() AND "isOverdue" = false AND "status" != 'DONE';
    ```
  - **Zero Unnecessary Infrastructure**: Bull requires a dedicated Redis instance for state management. For a single scheduled task with no complex retry, backoff, or priority queuing requirements, introducing Redis would add substantial operational overhead, cost, and complexity.
  - **Free-Tier Compatibility**: Relying on `node-cron` allows the entire application to be deployed on free-tier services (Render + Neon) without requiring a paid or separate Redis cluster.

### 3. httpOnly Cookie Refresh Tokens + In-Memory Access Tokens
- **Decision**: Kept JWT access tokens **strictly in memory** on the client and issued refresh tokens inside **httpOnly, Secure, SameSite=Strict** cookies.
- **Justification from backend-spec.md**:
  - **XSS Protection**: Tokens stored in `localStorage` or `sessionStorage` are vulnerable to exfiltration by any Cross-Site Scripting (XSS) vulnerability. Keeping the short-lived (15-minute) access token in memory ensures client-side scripts cannot read stored credentials.
  - **CSRF Protection**: The refresh token is stored in an `httpOnly` cookie with `SameSite=Strict`, preventing malicious cross-site requests from triggering unauthorized refreshes.
  - **Silent Token Rotation**: On application boot or when an API request returns a 401 error, an Axios interceptor catches the error and silently calls `POST /api/auth/refresh`. The browser automatically includes the `httpOnly` cookie, retrieves a fresh access token, and retries the failed request seamlessly without logging the user out.

---

## Known Limitations

1. **Render Free Tier Cold Starts**:
   - Render's free web services automatically spin down after 15 minutes of inactivity.
   - The first HTTP or WebSocket connection after an idle period may take 30 to 50 seconds to complete while the container boots.
2. **Single-Node In-Memory Presence**:
   - Online user presence tracking (`connectedUsers: Map<string, number>`) is maintained in memory on the backend instance.
   - If the backend is horizontally scaled across multiple container instances, a Redis Pub/Sub adapter (`@socket.io/redis-adapter`) would be necessary to synchronize presence counts across nodes.
3. **node-cron Multi-Instance Duplication**:
   - `node-cron` executes within the Node.js process. In a multi-replica deployment, each replica would trigger the overdue task sweep simultaneously. While the sweep query is idempotent (`WHERE isOverdue = false`), a distributed lock (e.g. Redlock or PostgreSQL advisory lock) would be recommended for horizontal scaling.

---

## Seeded Test Accounts

All accounts are created with bcrypt-hashed passwords using salt rounds 10.

| Role | Name | Email | Password |
|---|---|---|---|
| **ADMIN** | Alice Admin | `admin@velozity.com` | `Password123!` |
| **PM** | Sarah Jenkins (PM) | `pm1@velozity.com` | `Password123!` |
| **PM** | David Chen (PM) | `pm2@velozity.com` | `Password123!` |
| **DEVELOPER** | Alex Rivera (Dev) | `dev1@velozity.com` | `Password123!` |
| **DEVELOPER** | Emma Watson (Dev) | `dev2@velozity.com` | `Password123!` |
| **DEVELOPER** | Liam Patel (Dev) | `dev3@velozity.com` | `Password123!` |
| **DEVELOPER** | Sophia Kim (Dev) | `dev4@velozity.com` | `Password123!` |

---

## Seeded Data Summary
- **Users**: 7 total (1 Admin, 2 PMs, 4 Developers)
- **Clients**: 4 (Acme Corporation, Starlight Media, Nexus FinTech, HealthPulse Systems)
- **Projects**: 4 projects distributed across the 2 PMs
- **Tasks**: 24 tasks distributed across all 4 projects and spanning all statuses (`TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`) and priorities (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), including 2 deliberately overdue tasks (`isOverdue: true`, past due date)
- **Activity Logs**: 13 historical task transition records for instant feed visualization
- **Notifications**: 4 initial notifications for assigned devs and PMs
