# Backend Setup Guide

This document outlines the architecture, configuration, database setup, and operational instructions for the Stitch Chat Express backend foundation.

---

## 1. Backend Architecture

The backend follows a modular, clean, and separation-of-concerns architecture:

```
backend/
├── src/
│   ├── config/
│   │   └── env.ts               # Environment validation via Zod
│   ├── controllers/
│   │   └── health.controller.ts # Handlers for service & database health
│   ├── middleware/
│   │   ├── error.middleware.ts  # Centralized error handler
│   │   └── notFound.middleware.ts # 404 handler for unmatched routes
│   ├── routes/
│   │   ├── health.routes.ts     # Health routes (/health, /health/db)
│   │   └── index.ts             # Central API router aggregation
│   ├── services/
│   │   └── health.service.ts    # Database health check via Prisma query
│   ├── utils/
│   │   └── prisma.ts            # Reusable Prisma client singleton
│   ├── app.ts                   # Express application initialization & middleware
│   └── server.ts                # HTTP server bootstrap & port listener
├── prisma/
│   └── schema.prisma            # Prisma schema (MySQL provider & User model)
├── .env                         # Local environment configuration (git-ignored)
├── .env.example                 # Environment template
├── package.json                 # Dependencies and npm scripts
└── tsconfig.json                # TypeScript compiler configuration
```

---

## 2. Environment Configuration (`.env`)

Create a `.env` file in the `backend/` directory by copying `.env.example`:

```bash
cp .env.example .env
```

### Environment Variables Reference

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `PORT` | HTTP port the Express server listens on | `5000` |
| `NODE_ENV` | Environment mode (`development`, `production`, `test`) | `development` |
| `FRONTEND_URL` | Client origin allowed by CORS | `http://localhost:3000` |
| `DATABASE_URL` | MySQL connection string for Prisma ORM | `mysql://USER:PASSWORD@HOST:PORT/DATABASE` |

### `DATABASE_URL` Format

```text
mysql://[USER]:[PASSWORD]@[HOST]:[PORT]/[DATABASE]
```

**Common Examples:**
* Local MySQL / XAMPP (no password):
  ```env
  DATABASE_URL="mysql://root:@localhost:3306/chat_app"
  ```
* Local MySQL with password:
  ```env
  DATABASE_URL="mysql://root:your_secure_password@localhost:3306/chat_app"
  ```
* Docker MySQL container:
  ```env
  DATABASE_URL="mysql://root:rootpassword@127.0.0.1:3306/chat_app"
  ```

---

## 3. MySQL Database Setup

1. **Start MySQL Server:**
   * **XAMPP:** Open XAMPP Control Panel and start the **MySQL** service.
   * **Native Windows Service:** Open Services (`services.msc`) and start `MySQL` or run:
     ```powershell
     net start mysql
     ```
   * **Docker:**
     ```bash
     docker run --name chat-mysql -e MYSQL_ROOT_PASSWORD=password -e MYSQL_DATABASE=chat_app -p 3306:3306 -d mysql:8.0
     ```

2. **Create Database (if not auto-created):**
   ```sql
   CREATE DATABASE IF NOT EXISTS chat_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

---

## 4. Prisma Commands

* **Validate Schema:**
  ```bash
  npm run prisma:validate  # or: npx prisma validate
  ```
* **Generate Prisma Client:**
  ```bash
  npm run prisma:generate  # or: npx prisma generate
  ```
* **Apply Database Migration:**
  ```bash
  npm run prisma:migrate   # or: npx prisma migrate dev --name init_user
  ```
* **Push Schema Directly to Database:**
  ```bash
  npx prisma db push
  ```
* **Launch Prisma Studio (GUI):**
  ```bash
  npm run prisma:studio
  ```

---

## 5. Starting the Backend Server

* **Development Mode (with auto-reload):**
  ```bash
  npm run dev
  ```
* **Type-check without emitting:**
  ```bash
  npm run typecheck
  ```
* **Linting:**
  ```bash
  npm run lint
  ```
* **Production Build:**
  ```bash
  npm run build
  ```
* **Production Start:**
  ```bash
  npm run start
  ```

---

## 6. Health-Check Endpoints

### 1. Server Health
* **Endpoint:** `GET /api/health`
* **Purpose:** Confirms Express server is responsive and accepting connections.
* **Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "Backend is running"
  }
  ```

### 2. Database Health
* **Endpoint:** `GET /api/health/db`
* **Purpose:** Confirms Prisma can communicate with MySQL via raw test query (`SELECT 1`).
* **Response when MySQL is connected (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "message": "Database is connected and healthy",
    "database": "MySQL"
  }
  ```
* **Response when MySQL is unreachable (HTTP 503 Service Unavailable):**
  ```json
  {
    "success": false,
    "message": "Database connection failed"
  }
  ```
  *(Credentials and internal query stack traces are never exposed in the response).*
