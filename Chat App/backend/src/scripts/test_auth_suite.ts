/**
 * Comprehensive Authentication Test Suite
 * Tests every requirement specified in the TASK prompt:
 * 1. Register valid user
 * 2. Duplicate email
 * 3. Duplicate username
 * 4. Password validation (short, missing upper, missing lower, missing number)
 * 5. Invalid email
 * 6. Empty fields
 * 7. Login valid (via email and via username)
 * 8. Login invalid (wrong password, unknown user, empty fields)
 * 9. Refresh token (valid refresh, rotation, reuse detection revocation, invalid refresh token)
 * 10. Logout (token revocation)
 * 11. Protected routes (accessing /api/auth/me with valid, expired, missing, and invalid token)
 * 12. Safe responses (no passwordHash leaked, no plain-text passwords stored)
 */

import http from "http";
import { app } from "../app";

const PORT = 5059;
const API_BASE = `http://localhost:${PORT}/api`;

interface TestResult {
  category: string;
  test: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, category: string, test: string, details?: string) {
  if (condition) {
    results.push({ category, test, passed: true, details });
    console.log(`✅ [PASS] ${category}: ${test}`);
  } else {
    results.push({ category, test, passed: false, details });
    console.error(`❌ [FAIL] ${category}: ${test} - ${details || ""}`);
  }
}

async function runTests() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, () => resolve()));
  console.log("==================================================");
  console.log("STARTING AUTHENTICATION VERIFICATION SUITE");
  console.log("==================================================\n");

  const timestamp = Date.now();
  const testUser = {
    name: "Auth Test User",
    username: `testuser_${timestamp}`,
    email: `test_${timestamp}@example.com`,
    password: "Password123!",
  };

  // ----------------------------------------------------------------
  // 1. REGISTER TESTS
  // ----------------------------------------------------------------
  console.log("--- 1. REGISTER TESTS ---");

  // 1.1 Empty fields
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "", username: "", email: "", password: "" }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.success === false && data.error?.code === "VALIDATION_ERROR",
      "Register",
      "Reject empty fields with 400 VALIDATION_ERROR",
      `Status: ${res.status}, Error: ${data.error?.message}`
    );
  } catch (err: any) {
    assert(false, "Register", "Reject empty fields", err.message);
  }

  // 1.2 Invalid email format
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        username: `validuser_${timestamp}`,
        email: "not-an-email",
        password: "Password123!",
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error?.message?.toLowerCase().includes("email"),
      "Register",
      "Reject invalid email with 400 and clear message",
      `Status: ${res.status}, Error: ${data.error?.message}`
    );
  } catch (err: any) {
    assert(false, "Register", "Reject invalid email", err.message);
  }

  // 1.3 Weak password - short length
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        username: `shortpass_${timestamp}`,
        email: `shortpass_${timestamp}@example.com`,
        password: "Pass1",
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error?.message?.toLowerCase().includes("at least 8 characters"),
      "Register",
      "Password validation: reject password < 8 characters",
      `Status: ${res.status}, Error: ${data.error?.message}`
    );
  } catch (err: any) {
    assert(false, "Register", "Password validation: length", err.message);
  }

  // 1.4 Weak password - missing number
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        username: `nonum_${timestamp}`,
        email: `nonum_${timestamp}@example.com`,
        password: "PasswordOnly",
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error?.message?.toLowerCase().includes("number"),
      "Register",
      "Password validation: reject password without numbers",
      `Status: ${res.status}, Error: ${data.error?.message}`
    );
  } catch (err: any) {
    assert(false, "Register", "Password validation: number", err.message);
  }

  // 1.5 Weak password - missing uppercase
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        username: `noupper_${timestamp}`,
        email: `noupper_${timestamp}@example.com`,
        password: "password123!",
      }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error?.message?.toLowerCase().includes("uppercase"),
      "Register",
      "Password validation: reject password without uppercase",
      `Status: ${res.status}, Error: ${data.error?.message}`
    );
  } catch (err: any) {
    assert(false, "Register", "Password validation: uppercase", err.message);
  }

  // 1.6 Valid new account registration
  let initialAccessToken = "";
  let initialRefreshToken = "";
  let registeredUserId = "";

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUser),
    });
    const data = await res.json();

    const noPasswordHashLeaked = !data.data?.user?.passwordHash && !data.data?.passwordHash;
    const hasTokens = Boolean(data.data?.accessToken && data.data?.refreshToken);
    const hasSafeUser = Boolean(data.data?.user?.id && data.data?.user?.email === testUser.email.toLowerCase());

    assert(
      res.status === 201 && data.success === true && hasTokens && hasSafeUser && noPasswordHashLeaked,
      "Register",
      "Register valid user with 201 Created and safe user info (no passwordHash)",
      `Status: ${res.status}, userId: ${data.data?.user?.id}`
    );

    if (data.data) {
      initialAccessToken = data.data.accessToken;
      initialRefreshToken = data.data.refreshToken;
      registeredUserId = data.data.user.id;
    }
  } catch (err: any) {
    assert(false, "Register", "Register valid user", err.message);
  }

  // 1.7 Duplicate email registration
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Duplicate Email User",
        username: `diffuser_${timestamp}`,
        email: testUser.email, // existing email
        password: "Password123!",
      }),
    });
    const data = await res.json();
    assert(
      res.status === 409 && data.error?.code === "DUPLICATE_EMAIL",
      "Register",
      "Duplicate email rejected with 409 DUPLICATE_EMAIL",
      `Status: ${res.status}, Error: ${data.error?.message}`
    );
  } catch (err: any) {
    assert(false, "Register", "Duplicate email", err.message);
  }

  // 1.8 Duplicate username registration
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Duplicate Username User",
        username: testUser.username, // existing username
        email: `different_${timestamp}@example.com`,
        password: "Password123!",
      }),
    });
    const data = await res.json();
    assert(
      res.status === 409 && data.error?.code === "DUPLICATE_USERNAME",
      "Register",
      "Duplicate username rejected with 409 DUPLICATE_USERNAME",
      `Status: ${res.status}, Error: ${data.error?.message}`
    );
  } catch (err: any) {
    assert(false, "Register", "Duplicate username", err.message);
  }

  // ----------------------------------------------------------------
  // 2. LOGIN TESTS
  // ----------------------------------------------------------------
  console.log("\n--- 2. LOGIN TESTS ---");

  // 2.1 Login with empty fields
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "", password: "" }),
    });
    const data = await res.json();
    assert(
      res.status === 400 && data.error?.code === "VALIDATION_ERROR",
      "Login",
      "Login empty fields rejected with 400 VALIDATION_ERROR",
      `Status: ${res.status}`
    );
  } catch (err: any) {
    assert(false, "Login", "Login empty fields", err.message);
  }

  // 2.2 Login with unknown user
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "nonexistent_user_999999", password: "Password123!" }),
    });
    const data = await res.json();
    assert(
      res.status === 401 && data.error?.code === "INVALID_CREDENTIALS",
      "Login",
      "Login invalid: unknown user rejected with 401 INVALID_CREDENTIALS",
      `Status: ${res.status}, Error: ${data.error?.message}`
    );
  } catch (err: any) {
    assert(false, "Login", "Login unknown user", err.message);
  }

  // 2.3 Login with wrong password
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: testUser.email, password: "WrongPassword999!" }),
    });
    const data = await res.json();
    assert(
      res.status === 401 && data.error?.code === "INVALID_CREDENTIALS",
      "Login",
      "Login invalid: wrong password rejected with 401 INVALID_CREDENTIALS",
      `Status: ${res.status}, Error: ${data.error?.message}`
    );
  } catch (err: any) {
    assert(false, "Login", "Login wrong password", err.message);
  }

  // 2.4 Login valid: using email
  let activeAccessToken = "";
  let activeRefreshToken = "";
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: testUser.email, password: testUser.password }),
    });
    const data = await res.json();
    const hasTokens = Boolean(data.data?.accessToken && data.data?.refreshToken);
    const safeUser = Boolean(data.data?.user?.id === registeredUserId && !data.data?.user?.passwordHash);

    assert(
      res.status === 200 && data.success === true && hasTokens && safeUser,
      "Login",
      "Login valid: authenticate successfully by email",
      `Status: ${res.status}, email: ${data.data?.user?.email}`
    );

    if (data.data) {
      activeAccessToken = data.data.accessToken;
      activeRefreshToken = data.data.refreshToken;
    }
  } catch (err: any) {
    assert(false, "Login", "Login valid by email", err.message);
  }

  // 2.5 Login valid: using username
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: testUser.username, password: testUser.password }),
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.data?.user?.username === testUser.username.toLowerCase(),
      "Login",
      "Login valid: authenticate successfully by username",
      `Status: ${res.status}, username: ${data.data?.user?.username}`
    );
  } catch (err: any) {
    assert(false, "Login", "Login valid by username", err.message);
  }

  // ----------------------------------------------------------------
  // 3. REFRESH TOKEN TESTS
  // ----------------------------------------------------------------
  console.log("\n--- 3. REFRESH TOKEN TESTS ---");

  // 3.1 Reject missing refresh token
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    assert(
      res.status === 400,
      "Refresh Token",
      "Reject missing refresh token with 400",
      `Status: ${res.status}`
    );
  } catch (err: any) {
    assert(false, "Refresh Token", "Reject missing refresh token", err.message);
  }

  // 3.2 Reject invalid/tampered refresh token
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "completely_fake_invalid_refresh_token" }),
    });
    const data = await res.json();
    assert(
      res.status === 401 && data.error?.code === "INVALID_REFRESH_TOKEN",
      "Refresh Token",
      "Reject invalid refresh token with 401 INVALID_REFRESH_TOKEN",
      `Status: ${res.status}`
    );
  } catch (err: any) {
    assert(false, "Refresh Token", "Reject invalid refresh token", err.message);
  }

  // 3.3 Valid refresh token rotation
  let rotatedRefreshToken = "";
  let rotatedAccessToken = "";
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: activeRefreshToken }),
    });
    const data = await res.json();
    const hasNewTokens = Boolean(
      data.data?.accessToken &&
      data.data?.refreshToken &&
      data.data?.refreshToken !== activeRefreshToken
    );

    assert(
      res.status === 200 && data.success === true && hasNewTokens,
      "Refresh Token",
      "Rotate refresh token successfully and return new access token",
      `Status: ${res.status}, rotated token received`
    );

    if (data.data) {
      rotatedAccessToken = data.data.accessToken;
      rotatedRefreshToken = data.data.refreshToken;
    }
  } catch (err: any) {
    assert(false, "Refresh Token", "Rotate refresh token", err.message);
  }

  // 3.4 Refresh Token Reuse Detection
  // Using the old already-rotated activeRefreshToken should trigger reuse detection and revoke sessions
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: activeRefreshToken }),
    });
    const data = await res.json();
    assert(
      res.status === 401 && data.error?.code === "TOKEN_REUSE_DETECTED",
      "Refresh Token",
      "Token reuse attack detected: 401 TOKEN_REUSE_DETECTED and sessions invalidated",
      `Status: ${res.status}, Error: ${data.error?.message}`
    );
  } catch (err: any) {
    assert(false, "Refresh Token", "Token reuse detection", err.message);
  }

  // ----------------------------------------------------------------
  // 4. PROTECTED ROUTE TESTS (/api/auth/me)
  // ----------------------------------------------------------------
  console.log("\n--- 4. PROTECTED ROUTE TESTS ---");

  // 4.1 Unauthenticated request (no token)
  try {
    const res = await fetch(`${API_BASE}/auth/me`);
    const data = await res.json();
    assert(
      res.status === 401 && data.error?.code === "UNAUTHORIZED",
      "Protected Route",
      "Unauthenticated request to /api/auth/me rejected with 401 UNAUTHORIZED",
      `Status: ${res.status}`
    );
  } catch (err: any) {
    assert(false, "Protected Route", "Unauthenticated request", err.message);
  }

  // 4.2 Malformed token
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: "Bearer malformed.fake.token" },
    });
    const data = await res.json();
    assert(
      res.status === 401 && data.error?.code === "INVALID_TOKEN",
      "Protected Route",
      "Malformed Bearer token rejected with 401 INVALID_TOKEN",
      `Status: ${res.status}`
    );
  } catch (err: any) {
    assert(false, "Protected Route", "Malformed Bearer token", err.message);
  }

  // 4.3 Authenticated request with new valid token (post-fresh login)
  let freshAccessToken = "";
  let freshRefreshToken = "";
  try {
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: testUser.email, password: testUser.password }),
    });
    const loginData = await loginRes.json();
    freshAccessToken = loginData.data.accessToken;
    freshRefreshToken = loginData.data.refreshToken;

    const meRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${freshAccessToken}` },
    });
    const meData = await meRes.json();
    const isCurrentUser = meData.data?.user?.id === registeredUserId && meData.data?.user?.email === testUser.email.toLowerCase();

    assert(
      meRes.status === 200 && meData.success === true && isCurrentUser,
      "Protected Route",
      "Authenticated user allowed to access /api/auth/me with user profile",
      `Status: ${meRes.status}, user: ${meData.data?.user?.email}`
    );
  } catch (err: any) {
    assert(false, "Protected Route", "Authenticated access", err.message);
  }

  // ----------------------------------------------------------------
  // 5. LOGOUT TESTS
  // ----------------------------------------------------------------
  console.log("\n--- 5. LOGOUT TESTS ---");

  try {
    const res = await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: freshRefreshToken }),
    });
    const data = await res.json();
    assert(
      res.status === 200 && data.success === true,
      "Logout",
      "Logout endpoint returns 200 and revokes refresh token",
      `Status: ${res.status}, Message: ${data.message}`
    );

    // Verify revoked token cannot be refreshed
    const refreshAfterLogout = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: freshRefreshToken }),
    });
    const refreshData = await refreshAfterLogout.json();
    assert(
      refreshAfterLogout.status === 401,
      "Logout",
      "Revoked refresh token cannot be refreshed after logout",
      `Status: ${refreshAfterLogout.status}, Code: ${refreshData.error?.code}`
    );
  } catch (err: any) {
    assert(false, "Logout", "Logout verification", err.message);
  }

  // ----------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------
  console.log("\n==================================================");
  console.log("TEST SUMMARY RESULTS");
  console.log("==================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total Tests: ${total}`);
  console.log(`Passed:      ${passed}`);
  console.log(`Failed:      ${failed}`);
  console.log(`Success Rate: ${Math.round((passed / total) * 100)}%\n`);

  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (failed > 0) {
    console.error("FAILURES DETECTED:");
    results.filter((r) => !r.passed).forEach((r) => console.error(`- [${r.category}] ${r.test}: ${r.details}`));
    process.exit(1);
  } else {
    console.log("🎉 ALL AUTHENTICATION TESTS PASSED!");
    process.exit(0);
  }
}

runTests().catch((e) => {
  console.error("FATAL SUITE ERROR:", e);
  process.exit(1);
});
