# Authentication Test & Verification Report

**Project:** Stitch Group Chat  
**Date:** September 29, 2026  
**Scope:** Complete fix and verification of Login and Register authentication flows (Frontend ↔ Backend ↔ MySQL)

---

## 1. Summary Test Results Table

All tests listed below have been executed directly against the live backend API and frontend application.

| Test | Result | Notes |
| :--- | :---: | :--- |
| **Register valid user** | **PASS** | Valid user registered with 201 Created; safe user object returned without `passwordHash`; tokens issued; password securely hashed with bcrypt (12 rounds). |
| **Duplicate email** | **PASS** | Registration with existing email rejected with HTTP 409 and code `DUPLICATE_EMAIL`. |
| **Duplicate username** | **PASS** | Registration with existing username rejected with HTTP 409 and code `DUPLICATE_USERNAME`. |
| **Password validation** | **PASS** | Enforces minimum 8 characters, at least 1 uppercase letter, 1 lowercase letter, and 1 number. Length < 8, missing upper, missing lower, and missing number rejected with 400 `VALIDATION_ERROR`. |
| **Login valid** | **PASS** | Successful login with both email and username returning access token, refresh token, and sanitized user object. |
| **Login invalid** | **PASS** | Wrong password and unknown user rejected with HTTP 401 and code `INVALID_CREDENTIALS`. Empty inputs rejected with 400 `VALIDATION_ERROR`. |
| **Refresh token** | **PASS** | Refresh token rotation verified; invalid or tampered refresh tokens rejected with 401 `INVALID_REFRESH_TOKEN`; reuse attack detection verified (revokes all active user sessions). |
| **Logout** | **PASS** | Refresh token revoked in database; subsequent refresh requests with the logged-out token fail with 401; cookies cleared. |
| **Protected route** | **PASS** | Unauthenticated requests to `/api/auth/me` fail with 401 `UNAUTHORIZED`; malformed tokens rejected with 401 `INVALID_TOKEN`; expired tokens rejected with 401 `Token has expired`; valid Bearer token returns authenticated user profile. Frontend `/` and `/groups` redirect unauthenticated visitors to `/login`. |

---

## 2. Detailed Test Execution Breakdown

### A. Registration Flow (`POST /api/auth/register`)
- **Empty Fields:** Rejected with HTTP 400 (`VALIDATION_ERROR`).
- **Invalid Email:** Input `not-an-email` rejected with HTTP 400.
- **Weak Password (<8 chars):** Rejected with HTTP 400 (`Password must be at least 8 characters long`).
- **Weak Password (missing number):** Rejected with HTTP 400 (`Password must contain at least one number`).
- **Weak Password (missing uppercase):** Rejected with HTTP 400 (`Password must contain at least one uppercase letter`).
- **Valid User Creation:** HTTP 201 Created. User persisted in MySQL `users` table with bcrypt hash. Response includes `user` (no `passwordHash`), `accessToken`, and `refreshToken`.
- **Duplicate Email:** Conflict detected via Prisma `findUnique`, returning HTTP 409 (`DUPLICATE_EMAIL`).
- **Duplicate Username:** Conflict detected via Prisma `findUnique`, returning HTTP 409 (`DUPLICATE_USERNAME`).

### B. Login Flow (`POST /api/auth/login`)
- **Empty Fields:** Rejected with HTTP 400 (`VALIDATION_ERROR`).
- **Unknown User:** Rejected with HTTP 401 (`INVALID_CREDENTIALS`).
- **Incorrect Password:** Rejected with HTTP 401 (`INVALID_CREDENTIALS`).
- **Valid Login by Email:** Authenticated with HTTP 200; tokens generated; session stored in MySQL.
- **Valid Login by Username:** Authenticated with HTTP 200; case-insensitive username match verified.

### C. Refresh & Token Lifecycle (`POST /api/auth/refresh`)
- **Missing Token:** HTTP 400 Bad Request.
- **Invalid Token:** HTTP 401 (`INVALID_REFRESH_TOKEN`).
- **Successful Rotation:** Old refresh token marked as revoked (`revokedAt = NOW()`); new refresh token created and returned along with fresh access token.
- **Token Reuse Attack Detection:** Attempting to exchange an already-revoked refresh token triggers an immediate account protection mechanism: all active refresh tokens for that user are revoked in MySQL, and HTTP 401 (`TOKEN_REUSE_DETECTED`) is returned.

### D. Logout Flow (`POST /api/auth/logout`)
- Refresh token revoked in database (`revokedAt` timestamp set).
- Replay test confirms revoked token cannot be refreshed.
- Auth cookies cleared.

### E. Protected Route Security (`GET /api/auth/me` & Route Guards)
- **No Token:** HTTP 401 `UNAUTHORIZED`.
- **Malformed Bearer Token:** HTTP 401 `INVALID_TOKEN`.
- **Expired Access Token:** HTTP 401 `INVALID_TOKEN` ("Token has expired").
- **Valid Bearer Token:** HTTP 200 OK returning sanitized user profile.
- **Client Route Protection:** Unauthenticated access to `/` or `/groups` redirects to `/login`.

---

## 3. Build & Static Analysis Verification

1. **Prisma Schema Validation:**
   ```bash
   npx prisma validate
   # Result: The schema at prisma\schema.prisma is valid 🚀
   ```
2. **Backend TypeScript Check:**
   ```bash
   npm run typecheck (tsc --noEmit)
   # Result: Exited with code 0 (0 errors)
   ```
3. **Frontend Production Build:**
   ```bash
   npm run build (next build)
   # Result: Compiled successfully in 3.0s, Finished TypeScript in 7.4s, 7/7 static pages generated with 0 errors
   ```
4. **Frontend ESLint:**
   ```bash
   npx eslint src
   # Result: 0 errors
   ```
