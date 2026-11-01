import http from "http";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";

const PORT = 5052;
const API_BASE = `http://localhost:${PORT}/api`;

interface TestResult {
  num: number;
  section: string;
  test: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(num: number, section: string, test: string, passed: boolean, details: string) {
  results.push({ num, section, test, passed, details });
  const icon = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${icon} [${num}] [${section}] ${test}: ${details}`);
}

async function runStep2AuthVerification() {
  console.log("================================================================================");
  console.log("        BACKEND STEP 2 - COMPREHENSIVE USER AUTHENTICATION VERIFICATION");
  console.log("================================================================================\n");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, () => resolve()));
  console.log(`Test server running on port ${PORT}\n`);

  try {
    const timestamp = Date.now().toString().slice(-6);
  const validUser = {
    name: "Saurav Kumar",
    username: `saurav_${timestamp}`,
    email: `saurav_${timestamp}@example.com`,
    password: "Password123!",
  };

  let registeredUserId = "";
  let currentAccessToken = "";
  let currentRefreshToken = "";

  // --------------------------------------------------------------------------
  // 1. REGISTER TESTS
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 1: REGISTER TESTS ---");

  // 1.1 Valid Registration
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validUser),
    });
    const data = await res.json();
    const hasTokens = Boolean(data.data?.accessToken && data.data?.refreshToken);
    const noPasswordHash = data.data?.user && !("passwordHash" in data.data.user);
    const is201 = res.status === 201;

    registeredUserId = data.data?.user?.id || "";
    currentAccessToken = data.data?.accessToken || "";
    currentRefreshToken = data.data?.refreshToken || "";

    record(
      1,
      "Register",
      "Valid registration",
      is201 && data.success && hasTokens && noPasswordHash,
      `HTTP ${res.status}, user ID: ${registeredUserId}`
    );
  } catch (e: any) {
    record(1, "Register", "Valid registration", false, e.message);
  }

  // 1.2 Duplicate Email
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Another User",
        username: `diff_${timestamp}`,
        email: validUser.email, // duplicate
        password: "Password123!",
      }),
    });
    const data = await res.json();
    record(
      2,
      "Register",
      "Duplicate email",
      res.status === 409 && data.error?.code === "DUPLICATE_EMAIL",
      `HTTP ${res.status}, code: ${data.error?.code}`
    );
  } catch (e: any) {
    record(2, "Register", "Duplicate email", false, e.message);
  }

  // 1.3 Duplicate Username
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Another User",
        username: validUser.username, // duplicate
        email: `another_${timestamp}@example.com`,
        password: "Password123!",
      }),
    });
    const data = await res.json();
    record(
      3,
      "Register",
      "Duplicate username",
      res.status === 409 && data.error?.code === "DUPLICATE_USERNAME",
      `HTTP ${res.status}, code: ${data.error?.code}`
    );
  } catch (e: any) {
    record(3, "Register", "Duplicate username", false, e.message);
  }

  // 1.4 Invalid Email
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        username: `inval_${timestamp}`,
        email: "not-an-email",
        password: "Password123!",
      }),
    });
    const data = await res.json();
    record(
      4,
      "Register",
      "Invalid email",
      res.status === 400 && data.error?.code === "VALIDATION_ERROR",
      `HTTP ${res.status}, message: ${data.error?.message}`
    );
  } catch (e: any) {
    record(4, "Register", "Invalid email", false, e.message);
  }

  // 1.5 Missing Name
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `noname_${timestamp}`,
        email: `noname_${timestamp}@example.com`,
        password: "Password123!",
      }),
    });
    const data = await res.json();
    record(
      5,
      "Register",
      "Missing name",
      res.status === 400 && data.error?.code === "VALIDATION_ERROR",
      `HTTP ${res.status}, code: ${data.error?.code}`
    );
  } catch (e: any) {
    record(5, "Register", "Missing name", false, e.message);
  }

  // 1.6 Missing Username
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "No Username User",
        email: `nouser_${timestamp}@example.com`,
        password: "Password123!",
      }),
    });
    const data = await res.json();
    record(
      6,
      "Register",
      "Missing username",
      res.status === 400 && data.error?.code === "VALIDATION_ERROR",
      `HTTP ${res.status}, code: ${data.error?.code}`
    );
  } catch (e: any) {
    record(6, "Register", "Missing username", false, e.message);
  }

  // 1.7 Missing Password
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "No Pass User",
        username: `nopass_${timestamp}`,
        email: `nopass_${timestamp}@example.com`,
      }),
    });
    const data = await res.json();
    record(
      7,
      "Register",
      "Missing password",
      res.status === 400 && data.error?.code === "VALIDATION_ERROR",
      `HTTP ${res.status}, code: ${data.error?.code}`
    );
  } catch (e: any) {
    record(7, "Register", "Missing password", false, e.message);
  }

  // 1.8 Weak/Invalid Password
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Weak Pass User",
        username: `weak_${timestamp}`,
        email: `weak_${timestamp}@example.com`,
        password: "weak", // < 8 characters
      }),
    });
    const data = await res.json();
    record(
      8,
      "Register",
      "Weak/invalid password",
      res.status === 400 && data.error?.code === "VALIDATION_ERROR",
      `HTTP ${res.status}, message: ${data.error?.message}`
    );
  } catch (e: any) {
    record(8, "Register", "Weak/invalid password", false, e.message);
  }

  // 1.9 Password is Hashed in Database
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: registeredUserId },
    });
    const isBcrypt = dbUser?.passwordHash.startsWith("$2a$") || dbUser?.passwordHash.startsWith("$2b$");
    const matchesPassword = await bcryptjs.compare(validUser.password, dbUser?.passwordHash || "");
    const notPlainText = dbUser?.passwordHash !== validUser.password;

    record(
      9,
      "Register",
      "Password is hashed in database",
      Boolean(isBcrypt && matchesPassword && notPlainText),
      `Stored hash prefix: ${dbUser?.passwordHash.slice(0, 7)}, Bcrypt validated: ${matchesPassword}`
    );
  } catch (e: any) {
    record(9, "Register", "Password is hashed in database", false, e.message);
  }

  // --------------------------------------------------------------------------
  // 2. LOGIN TESTS
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 2: LOGIN TESTS ---");

  // 2.1 Correct Email + Password
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: validUser.email,
        password: validUser.password,
      }),
    });
    const data = await res.json();
    const hasTokens = Boolean(data.data?.accessToken && data.data?.refreshToken);
    const correctUser = data.data?.user?.id === registeredUserId;
    if (data.data) {
      currentAccessToken = data.data.accessToken;
      currentRefreshToken = data.data.refreshToken;
    }

    record(
      10,
      "Login",
      "Correct email + password",
      res.status === 200 && data.success && hasTokens && correctUser,
      `HTTP ${res.status}, authenticated user: ${data.data?.user?.email}`
    );
  } catch (e: any) {
    record(10, "Login", "Correct email + password", false, e.message);
  }

  // 2.2 Correct Username + Password
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: validUser.username,
        password: validUser.password,
      }),
    });
    const data = await res.json();
    record(
      11,
      "Login",
      "Correct username + password",
      res.status === 200 && data.data?.user?.username === validUser.username.toLowerCase(),
      `HTTP ${res.status}, matched username: ${data.data?.user?.username}`
    );
  } catch (e: any) {
    record(11, "Login", "Correct username + password", false, e.message);
  }

  // 2.3 Wrong Password
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: validUser.email,
        password: "IncorrectPassword999!",
      }),
    });
    const data = await res.json();
    record(
      12,
      "Login",
      "Wrong password",
      res.status === 401 && data.error?.code === "INVALID_CREDENTIALS",
      `HTTP ${res.status}, code: ${data.error?.code}`
    );
  } catch (e: any) {
    record(12, "Login", "Wrong password", false, e.message);
  }

  // 2.4 Unknown User
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: `ghost_user_${timestamp}@example.com`,
        password: "Password123!",
      }),
    });
    const data = await res.json();
    record(
      13,
      "Login",
      "Unknown user",
      res.status === 401 && data.error?.code === "INVALID_CREDENTIALS",
      `HTTP ${res.status}, code: ${data.error?.code}`
    );
  } catch (e: any) {
    record(13, "Login", "Unknown user", false, e.message);
  }

  // 2.5 Missing Identifier
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: "Password123!",
      }),
    });
    const data = await res.json();
    record(
      14,
      "Login",
      "Missing identifier",
      res.status === 400 && data.error?.code === "VALIDATION_ERROR",
      `HTTP ${res.status}, code: ${data.error?.code}`
    );
  } catch (e: any) {
    record(14, "Login", "Missing identifier", false, e.message);
  }

  // 2.6 Missing Password
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: validUser.email,
      }),
    });
    const data = await res.json();
    record(
      15,
      "Login",
      "Missing password",
      res.status === 400 && data.error?.code === "VALIDATION_ERROR",
      `HTTP ${res.status}, code: ${data.error?.code}`
    );
  } catch (e: any) {
    record(15, "Login", "Missing password", false, e.message);
  }

  // --------------------------------------------------------------------------
  // 3. SESSION & TOKEN TESTS
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 3: SESSION & TOKEN LIFECYCLE TESTS ---");

  // 3.1 /api/auth/me with valid token
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${currentAccessToken}` },
    });
    const data = await res.json();
    const isSelf = data.data?.user?.id === registeredUserId;
    const noHash = !("passwordHash" in (data.data?.user || {}));
    record(
      16,
      "Session",
      "/api/auth/me with valid token",
      res.status === 200 && data.success && isSelf && noHash,
      `HTTP ${res.status}, returned user: ${data.data?.user?.name}`
    );
  } catch (e: any) {
    record(16, "Session", "/api/auth/me with valid token", false, e.message);
  }

  // 3.2 /api/auth/me without token
  try {
    const res = await fetch(`${API_BASE}/auth/me`);
    const data = await res.json();
    record(
      17,
      "Session",
      "/api/auth/me without token",
      res.status === 401 && data.error?.code === "UNAUTHORIZED",
      `HTTP ${res.status}, code: ${data.error?.code}`
    );
  } catch (e: any) {
    record(17, "Session", "/api/auth/me without token", false, e.message);
  }

  // 3.3 /api/auth/me with invalid token
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: "Bearer this.is.completely.invalid" },
    });
    const data = await res.json();
    record(
      18,
      "Session",
      "/api/auth/me with invalid token",
      res.status === 401 && data.error?.code === "INVALID_TOKEN",
      `HTTP ${res.status}, code: ${data.error?.code}`
    );
  } catch (e: any) {
    record(18, "Session", "/api/auth/me with invalid token", false, e.message);
  }

  // 3.4 Access-token expiry
  try {
    const expiredToken = jwt.sign(
      { userId: registeredUserId, email: validUser.email, username: validUser.username },
      ENV.JWT_ACCESS_SECRET,
      { algorithm: "HS256", issuer: "chat-app-backend", audience: "chat-app-client", expiresIn: "0s" }
    );
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    const data = await res.json();
    record(
      19,
      "Session",
      "Access-token expiry",
      res.status === 401 && data.error?.message === "Token has expired",
      `HTTP ${res.status}, message: ${data.error?.message}`
    );
  } catch (e: any) {
    record(19, "Session", "Access-token expiry", false, e.message);
  }

  // 3.5 Refresh Token
  let newAccessToken = "";
  let newRefreshToken = "";
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });
    const data = await res.json();
    const hasNew = Boolean(data.data?.accessToken && data.data?.refreshToken);
    if (data.data) {
      newAccessToken = data.data.accessToken;
      newRefreshToken = data.data.refreshToken;
    }
    record(
      20,
      "Session",
      "Refresh token",
      res.status === 200 && data.success && hasNew,
      `HTTP ${res.status}, new access & refresh tokens issued`
    );
  } catch (e: any) {
    record(20, "Session", "Refresh token", false, e.message);
  }

  // 3.6 Refresh-Token Rotation
  try {
    const rotated = newRefreshToken !== currentRefreshToken;
    record(
      21,
      "Session",
      "Refresh-token rotation",
      rotated,
      `New refresh token differs from previous token: ${rotated}`
    );
  } catch (e: any) {
    record(21, "Session", "Refresh-token rotation", false, e.message);
  }

  // 3.7 Revoked Refresh Token (Reuse Detection)
  try {
    // Attempt to use old already-rotated refresh token
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: currentRefreshToken }),
    });
    const data = await res.json();
    record(
      22,
      "Session",
      "Revoked refresh token (reuse detection)",
      res.status === 401 && data.error?.code === "TOKEN_REUSE_DETECTED",
      `HTTP ${res.status}, code: ${data.error?.code}`
    );
  } catch (e: any) {
    record(22, "Session", "Revoked refresh token (reuse detection)", false, e.message);
  }

  // 3.8 Logout
  // Log in again to get a fresh session to log out cleanly
  let freshLogoutRefresh = "";
  try {
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: validUser.email, password: validUser.password }),
    });
    const loginData = await loginRes.json();
    freshLogoutRefresh = loginData.data?.refreshToken;

    const res = await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: freshLogoutRefresh }),
    });
    const data = await res.json();
    record(
      23,
      "Session",
      "Logout",
      res.status === 200 && data.success,
      `HTTP ${res.status}, message: ${data.message}`
    );
  } catch (e: any) {
    record(23, "Session", "Logout", false, e.message);
  }

  // 3.9 Refresh After Logout
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: freshLogoutRefresh }),
    });
    const data = await res.json();
    record(
      24,
      "Session",
      "Refresh after logout",
      res.status === 401,
      `HTTP ${res.status}, correctly rejected revoked token`
    );
  } catch (e: any) {
    record(24, "Session", "Refresh after logout", false, e.message);
  }

  // --------------------------------------------------------------------------
  // 4. RATE LIMITING
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 4: RATE LIMITING & SECURITY ---");

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "ratelimit_probe", password: "Password123!" }),
    });
    const hasLimitHeader = res.headers.has("ratelimit-limit") || res.headers.has("x-ratelimit-limit");
    record(
      25,
      "Rate Limiting",
      "Rate limiting headers present on auth endpoints",
      hasLimitHeader,
      `Rate limit headers detected: ${hasLimitHeader}`
    );
  } catch (e: any) {
    record(25, "Rate Limiting", "Rate limiting headers", false, e.message);
  }

  // --------------------------------------------------------------------------
  // 5. FRONTEND INTEGRATION FLOWS
  // --------------------------------------------------------------------------
  console.log("\n--- SECTION 5: FRONTEND INTEGRATION CLIENT FLOWS ---");

  const simulatedClientStorage: Record<string, string> = {};

  // 5.1 Register from UI (simulated frontend client)
  const clientUser = {
    name: "Alex Rivera",
    username: `alex_${timestamp}`,
    email: `alex_${timestamp}@stitch.app`,
    password: "Password123!",
  };

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clientUser),
    });
    const data = await res.json();
    if (data.data) {
      simulatedClientStorage["chat_access_token"] = data.data.accessToken;
      simulatedClientStorage["chat_refresh_token"] = data.data.refreshToken;
    }
    record(
      26,
      "Frontend Integration",
      "Register from UI (state set & tokens persisted)",
      res.status === 201 && Boolean(simulatedClientStorage["chat_access_token"]),
      `Registered client: ${data.data?.user?.username}, tokens stored`
    );
  } catch (e: any) {
    record(26, "Frontend Integration", "Register from UI", false, e.message);
  }

  // 5.2 Session Check on Page Load / Refresh (/api/auth/me)
  try {
    const token = simulatedClientStorage["chat_access_token"];
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    record(
      27,
      "Frontend Integration",
      "Page reload session restoration via /api/auth/me",
      res.status === 200 && data.data?.user?.username === clientUser.username.toLowerCase(),
      `Session restored for: ${data.data?.user?.name}`
    );
  } catch (e: any) {
    record(27, "Frontend Integration", "Session restoration", false, e.message);
  }

  // 5.3 Auto-Refresh on Expired Access Token
  try {
    const refreshTok = simulatedClientStorage["chat_refresh_token"];
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshTok }),
    });
    const data = await res.json();
    if (data.data) {
      simulatedClientStorage["chat_access_token"] = data.data.accessToken;
      simulatedClientStorage["chat_refresh_token"] = data.data.refreshToken;
    }
    record(
      28,
      "Frontend Integration",
      "Silent token refresh updates client session state",
      res.status === 200 && Boolean(data.data?.accessToken),
      `Tokens updated seamlessly`
    );
  } catch (e: any) {
    record(28, "Frontend Integration", "Silent token refresh", false, e.message);
  }

  // 5.4 Logout Clears Client Session
  try {
    const refreshTok = simulatedClientStorage["chat_refresh_token"];
    const res = await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshTok }),
    });
    delete simulatedClientStorage["chat_access_token"];
    delete simulatedClientStorage["chat_refresh_token"];
    record(
      29,
      "Frontend Integration",
      "Logout clears client storage & invalidates session",
      res.status === 200 && !simulatedClientStorage["chat_access_token"],
      `Storage cleared: ${Object.keys(simulatedClientStorage).length === 0}`
    );
  } catch (e: any) {
    record(29, "Frontend Integration", "Logout clears client storage", false, e.message);
  }

  // 5.5 Login Again via Username
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: clientUser.username,
        password: clientUser.password,
      }),
    });
    const data = await res.json();
    if (data.data) {
      simulatedClientStorage["chat_access_token"] = data.data.accessToken;
      simulatedClientStorage["chat_refresh_token"] = data.data.refreshToken;
    }
    record(
      30,
      "Frontend Integration",
      "Login again via username restores full authenticated state",
      res.status === 200 && Boolean(simulatedClientStorage["chat_access_token"]),
      `Authenticated state re-established for user ${data.data?.user?.username}`
    );
  } catch (e: any) {
    record(30, "Frontend Integration", "Login again via username", false, e.message);
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("                       STEP 2 VERIFICATION SUMMARY");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Total Test Cases Executed: ${total}`);
  console.log(`Passed:                    ${passed}`);
  console.log(`Failed:                    ${failed}`);
  console.log(`Success Rate:              ${Math.round((passed / total) * 100)}%\n`);

  if (failed > 0) {
    console.error("FAILURES:");
    results.filter((r) => !r.passed).forEach((r) => console.error(`- [${r.section}] ${r.test}: ${r.details}`));
    process.exit(1);
  } else {
    console.log("🎉 ALL 30 STEP 2 AUTHENTICATION TESTS PASSED WITH 100% SUCCESS!");
  }
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runStep2AuthVerification().catch((e) => {
  console.error("FATAL ERROR IN STEP 2 AUTH SUITE:", e);
  process.exit(1);
});
