process.env.NODE_ENV = "test";
import http from "http";
import { app } from "../app";
import { initSocketServer } from "../socket";
import { prisma } from "../lib/prisma";
import bcryptjs from "bcryptjs";

const PORT = 5088;
const BASE_URL = `http://localhost:${PORT}/api`;

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function recordTest(category: string, name: string, passed: boolean, details?: string) {
  results.push({ category, name, passed, details });
  const status = passed ? "✅ PASS" : "❌ FAIL";
  console.log(`${status} [${category}] ${name}${details ? ` -> ${details}` : ""}`);
}

async function runSecurityAuditTests() {
  console.log("\n=======================================================");
  console.log("   STARTING COMPREHENSIVE SECURITY AUDIT VERIFICATION");
  console.log("=======================================================\n");

  const server = http.createServer(app);
  initSocketServer(server);
  await new Promise<void>((resolve) => server.listen(PORT, () => resolve()));
  console.log(`Test server running on port ${PORT}\n`);

  const testId = Date.now().toString().slice(-6);
  const testUserA = {
    name: `SecUser A_${testId}`,
    username: `sec_a_${testId}`,
    email: `sec_a_${testId}@test.local`,
    password: "Password123!", // Compliant: uppercase, lowercase, number, 8+ chars
  };
  const testUserB = {
    name: `SecUser B_${testId}`,
    username: `sec_b_${testId}`,
    email: `sec_b_${testId}@test.local`,
    password: "Password123!",
  };

  let tokenA = "";
  let refreshTokenA = "";
  let userAId = "";

  let tokenB = "";
  let refreshTokenB = "";
  let userBId = "";

  // ---------------------------------------------------------
  // 1. AUTHENTICATION & VALIDATION
  // ---------------------------------------------------------
  console.log("\n--- Testing Authentication & Password Validation ---");

  // 1.1 Password complexity: reject weak passwords (no uppercase)
  try {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Weak Pass",
        username: `weak_${testId}`,
        email: `weak_${testId}@test.local`,
        password: "password123", // Missing uppercase
      }),
    });
    const json = (await res.json()) as any;
    recordTest(
      "Validation",
      "Reject registration with password lacking uppercase",
      res.status === 400 && json.error?.code === "VALIDATION_ERROR",
      `Status ${res.status}: ${json.error?.message}`
    );
  } catch (e: any) {
    recordTest("Validation", "Reject registration with password lacking uppercase", false, e.message);
  }

  // 1.2 Password complexity: reject password lacking numbers
  try {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Weak Pass",
        username: `weak2_${testId}`,
        email: `weak2_${testId}@test.local`,
        password: "PasswordOnly", // Missing number
      }),
    });
    const json = (await res.json()) as any;
    recordTest(
      "Validation",
      "Reject registration with password lacking number",
      res.status === 400 && json.error?.code === "VALIDATION_ERROR",
      `Status ${res.status}: ${json.error?.message}`
    );
  } catch (e: any) {
    recordTest("Validation", "Reject registration with password lacking number", false, e.message);
  }

  // 1.3 Reject unexpected input (strict schema)
  try {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...testUserA,
        maliciousInjectedField: "attacker_controlled",
      }),
    });
    const json = (await res.json()) as any;
    recordTest(
      "Validation",
      "Reject unexpected properties in request body (.strict())",
      res.status === 400 && json.error?.code === "VALIDATION_ERROR",
      `Status ${res.status}`
    );
  } catch (e: any) {
    recordTest("Validation", "Reject unexpected properties in request body (.strict())", false, e.message);
  }

  // 1.4 Register User A (Compliant password)
  try {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUserA),
    });
    const json = (await res.json()) as any;
    tokenA = json.data?.accessToken;
    refreshTokenA = json.data?.refreshToken;
    userAId = json.data?.user?.id;

    recordTest(
      "Authentication",
      "Register user with compliant password",
      res.status === 201 && !!tokenA && !!refreshTokenA,
      `User ID: ${userAId}`
    );
  } catch (e: any) {
    recordTest("Authentication", "Register user with compliant password", false, e.message);
  }

  // 1.5 Register User B
  try {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testUserB),
    });
    const json = (await res.json()) as any;
    tokenB = json.data?.accessToken;
    refreshTokenB = json.data?.refreshToken;
    userBId = json.data?.user?.id;
  } catch (e: any) {
    console.error("Failed to register User B", e);
  }

  // 1.6 Verify password hashing work factor in database >= 12
  try {
    const userInDb = await prisma.user.findUnique({ where: { id: userAId } });
    const isCost12 = userInDb?.passwordHash.startsWith("$2a$12$") || userInDb?.passwordHash.startsWith("$2b$12$");
    recordTest(
      "Authentication",
      "Bcrypt password hashing work factor >= 12",
      !!isCost12,
      `Hash prefix: ${userInDb?.passwordHash.substring(0, 7)}`
    );
  } catch (e: any) {
    recordTest("Authentication", "Bcrypt password hashing work factor >= 12", false, e.message);
  }

  // ---------------------------------------------------------
  // 2. JWT VALIDATION & TAMPERING
  // ---------------------------------------------------------
  console.log("\n--- Testing JWT Validation ---");

  // 2.1 Tampered token rejected
  try {
    const tamperedToken = tokenA.slice(0, -6) + "xxxxxx";
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${tamperedToken}` },
    });
    const json = (await res.json()) as any;
    recordTest(
      "Authentication",
      "Reject tampered/forged JWT signature",
      res.status === 401 && json.error?.code === "INVALID_TOKEN",
      `Status ${res.status}`
    );
  } catch (e: any) {
    recordTest("Authentication", "Reject tampered/forged JWT signature", false, e.message);
  }

  // 2.2 Missing token rejected
  try {
    const res = await fetch(`${BASE_URL}/auth/me`);
    const json = (await res.json()) as any;
    recordTest(
      "Authentication",
      "Reject request without authorization token",
      res.status === 401 && json.error?.code === "UNAUTHORIZED",
      `Status ${res.status}`
    );
  } catch (e: any) {
    recordTest("Authentication", "Reject request without authorization token", false, e.message);
  }

  // ---------------------------------------------------------
  // 3. REFRESH TOKEN ROTATION & REUSE DETECTION
  // ---------------------------------------------------------
  console.log("\n--- Testing Refresh Token Rotation & Reuse Detection ---");

  let newRefreshTokenA = "";
  // 3.1 Normal single-use refresh token rotation
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshTokenA }),
    });
    const json = (await res.json()) as any;
    newRefreshTokenA = json.data?.refreshToken;
    tokenA = json.data?.accessToken; // Update current token
    recordTest(
      "Authentication",
      "Single-use refresh token rotation issues new pair",
      res.status === 200 && !!newRefreshTokenA && newRefreshTokenA !== refreshTokenA,
      "Old token rotated"
    );
  } catch (e: any) {
    recordTest("Authentication", "Single-use refresh token rotation issues new pair", false, e.message);
  }

  // 3.2 Token Reuse Detection: presenting the old (now revoked) refreshTokenA
  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshTokenA }), // Reusing old token!
    });
    const json = (await res.json()) as any;

    // Verify all active refresh tokens for User A are now revoked
    const activeTokens = await prisma.refreshToken.findMany({
      where: { userId: userAId, revokedAt: null },
    });

    recordTest(
      "Authentication",
      "Token reuse detection revokes all user sessions on compromised token presentation",
      res.status === 401 &&
        json.error?.code === "TOKEN_REUSE_DETECTED" &&
        activeTokens.length === 0,
      `Active tokens remaining: ${activeTokens.length} (Expected 0)`
    );
  } catch (e: any) {
    recordTest("Authentication", "Token reuse detection revokes all user sessions", false, e.message);
  }

  // Log in again to get fresh credentials for subsequent tests
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: testUserA.email, password: testUserA.password }),
  });
  const loginJson = (await loginRes.json()) as any;
  tokenA = loginJson.data?.accessToken;
  refreshTokenA = loginJson.data?.refreshToken;

  // 3.3 Logout / Token Revocation
  try {
    const logoutRes = await fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshTokenA }),
    });
    const logoutJson = await logoutRes.json();

    // Now try refreshing with that token
    const afterLogoutRefresh = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refreshTokenA }),
    });

    recordTest(
      "Authentication",
      "Logout successfully revokes refresh token",
      logoutRes.status === 200 && afterLogoutRefresh.status === 401,
      `Post-logout refresh status: ${afterLogoutRefresh.status}`
    );
  } catch (e: any) {
    recordTest("Authentication", "Logout successfully revokes refresh token", false, e.message);
  }

  // Log in again for remaining tests
  const freshLogin = ((await (
    await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: testUserA.email, password: testUserA.password }),
    })
  ).json())) as any;
  tokenA = freshLogin.data?.accessToken;

  // ---------------------------------------------------------
  // 4. PARAMETER & QUERY VALIDATION
  // ---------------------------------------------------------
  console.log("\n--- Testing Parameter & Query Validation ---");

  // 4.1 Reject non-UUID groupId
  try {
    const res = await fetch(`${BASE_URL}/groups/invalid-group-id-12345`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const json = (await res.json()) as any;
    recordTest(
      "Validation",
      "Reject non-UUID groupId parameter",
      res.status === 400 && json.error?.code === "VALIDATION_ERROR",
      `Status ${res.status}: ${json.error?.message}`
    );
  } catch (e: any) {
    recordTest("Validation", "Reject non-UUID groupId parameter", false, e.message);
  }

  // 4.2 Reject non-UUID userId in block parameter
  try {
    const res = await fetch(`${BASE_URL}/users/block/not-a-valid-uuid`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const json = (await res.json()) as any;
    recordTest(
      "Validation",
      "Reject non-UUID userId parameter in block route",
      res.status === 400 && json.error?.code === "VALIDATION_ERROR",
      `Status ${res.status}`
    );
  } catch (e: any) {
    recordTest("Validation", "Reject non-UUID userId parameter in block route", false, e.message);
  }

  // ---------------------------------------------------------
  // 5. AUTHORIZATION & RBAC
  // ---------------------------------------------------------
  console.log("\n--- Testing Authorization & RBAC ---");

  // Create a test group with User A as OWNER
  const groupRes = ((await (
    await fetch(`${BASE_URL}/groups`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ name: `Sec Group ${testId}` }),
    })
  ).json())) as any;
  const groupId = groupRes.data?.group?.id;

  // 5.1 Non-member cannot access group details (User B calling Group A)
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const json = (await res.json()) as any;
    recordTest(
      "Authorization",
      "Non-member denied access to group details (403)",
      res.status === 403 && json.error?.code === "FORBIDDEN",
      `Status ${res.status}`
    );
  } catch (e: any) {
    recordTest("Authorization", "Non-member denied access to group details (403)", false, e.message);
  }

  // Add User B as standard MEMBER
  await fetch(`${BASE_URL}/groups/${groupId}/members`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenA}`,
    },
    body: JSON.stringify({ userId: userBId }),
  });

  // 5.2 Standard Member cannot delete group
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const json = (await res.json()) as any;
    recordTest(
      "Authorization",
      "Standard Member cannot delete group (403)",
      res.status === 403 && json.error?.code === "FORBIDDEN",
      `Status ${res.status}`
    );
  } catch (e: any) {
    recordTest("Authorization", "Standard Member cannot delete group (403)", false, e.message);
  }

  // 5.3 Standard Member cannot promote/demote members
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}/members/${userAId}/role`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenB}`,
      },
      body: JSON.stringify({ role: "ADMIN" }),
    });
    const json = (await res.json()) as any;
    recordTest(
      "Authorization",
      "Standard Member cannot update member roles (403)",
      res.status === 403 && json.error?.code === "FORBIDDEN",
      `Status ${res.status}`
    );
  } catch (e: any) {
    recordTest("Authorization", "Standard Member cannot update member roles (403)", false, e.message);
  }

  // 5.4 Reject user forging message with type 'AI'
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        content: "I am fake AI",
        type: "AI", // Client disallowed
      }),
    });
    const json = (await res.json()) as any;
    recordTest(
      "AI Security",
      "Reject user attempting to forge message type 'AI'",
      res.status === 400 && json.error?.code === "VALIDATION_ERROR",
      `Status ${res.status}`
    );
  } catch (e: any) {
    recordTest("AI Security", "Reject user attempting to forge message type 'AI'", false, e.message);
  }

  // ---------------------------------------------------------
  // 6. BLOCKED USER PRIVACY & AUTHORIZATION
  // ---------------------------------------------------------
  console.log("\n--- Testing Blocked-User Privacy Rules ---");

  // User A blocks User B
  await fetch(`${BASE_URL}/users/block/${userBId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
  });

  // 6.1 Blocked user excluded from user search
  try {
    const res = await fetch(`${BASE_URL}/users/search?q=${testUserB.username}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const json = (await res.json()) as any;
    const foundUserB = (json.data?.users || []).some((u: any) => u.id === userBId);
    recordTest(
      "Authorization",
      "Blocked user excluded from user search results",
      res.status === 200 && !foundUserB,
      `User B present in search: ${foundUserB}`
    );
  } catch (e: any) {
    recordTest("Authorization", "Blocked user excluded from user search results", false, e.message);
  }

  // 6.2 Cannot add blocked user to a new group
  try {
    const newGroupRes = ((await (
      await fetch(`${BASE_URL}/groups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ name: "Block Test Group" }),
      })
    ).json())) as any;
    const blockGroupId = newGroupRes.data?.group?.id;

    const addBlockedRes = await fetch(`${BASE_URL}/groups/${blockGroupId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({ userId: userBId }),
    });
    const addBlockedJson = (await addBlockedRes.json()) as any;
    recordTest(
      "Authorization",
      "Prevent adding blocked user to group (403)",
      addBlockedRes.status === 403 && addBlockedJson.error?.code === "FORBIDDEN",
      `Status ${addBlockedRes.status}: ${addBlockedJson.error?.message}`
    );
  } catch (e: any) {
    recordTest("Authorization", "Prevent adding blocked user to group (403)", false, e.message);
  }

  // ---------------------------------------------------------
  // 7. FILE SECURITY & MAGIC BYTES
  // ---------------------------------------------------------
  console.log("\n--- Testing File Security & Magic Bytes ---");

  // 7.1 Executable disguised as PNG (PE 'MZ' header) rejected
  try {
    // Create multipart form with 'MZ' header
    const boundary = "---------------------------boundary" + Date.now();
    const fakeExeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // 'MZ' header
    const postData = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="innocent.png"\r\nContent-Type: image/png\r\n\r\n`
      ),
      fakeExeBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await fetch(`${BASE_URL}/groups/${groupId}/upload`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${tokenA}`,
      },
      body: postData,
    });
    const json = (await res.json()) as any;
    recordTest(
      "File Security",
      "Reject executable disguised as PNG via magic byte inspection",
      res.status === 400 && json.error?.code === "MALICIOUS_OR_CORRUPT_FILE",
      `Status ${res.status}: ${json.error?.message}`
    );
  } catch (e: any) {
    recordTest("File Security", "Reject executable disguised as PNG via magic byte inspection", false, e.message);
  }

  // 7.2 Dangerous extension (.exe) rejected
  try {
    const boundary = "---------------------------boundary" + Date.now();
    const fakeData = Buffer.from("console.log('test')");
    const postData = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="script.sh"\r\nContent-Type: application/x-sh\r\n\r\n`
      ),
      fakeData,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await fetch(`${BASE_URL}/groups/${groupId}/upload`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${tokenA}`,
      },
      body: postData,
    });
    const json = (await res.json()) as any;
    recordTest(
      "File Security",
      "Reject prohibited script extension (.sh) immediately",
      res.status === 400 && json.error?.code === "DANGEROUS_FILE_TYPE",
      `Status ${res.status}: ${json.error?.message}`
    );
  } catch (e: any) {
    recordTest("File Security", "Reject prohibited script extension (.sh) immediately", false, e.message);
  }

  // ---------------------------------------------------------
  // 8. SECURITY HEADERS & GENERAL CONFIG
  // ---------------------------------------------------------
  console.log("\n--- Testing Security Headers & Safe Errors ---");

  try {
    const res = await fetch(`${BASE_URL}/health`);
    const headers = res.headers;
    const xFrame = headers.get("x-frame-options");
    const xContentType = headers.get("x-content-type-options");
    const hsts = headers.get("strict-transport-security");

    recordTest(
      "General Security",
      "Helmet security headers present (X-Frame-Options, X-Content-Type-Options, HSTS)",
      xFrame === "DENY" && xContentType === "nosniff" && !!hsts,
      `X-Frame: ${xFrame}, X-Content-Type: ${xContentType}`
    );
  } catch (e: any) {
    recordTest("General Security", "Helmet security headers present", false, e.message);
  }

  // 8.2 Verify rate limit headers on auth route
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "nonexistent", password: "Password123!" }),
    });
    const rlLimit = res.headers.get("ratelimit-limit");
    const rlRemaining = res.headers.get("ratelimit-remaining");
    const rlReset = res.headers.get("ratelimit-reset");

    recordTest(
      "Rate Limiting",
      "Standard RateLimit headers returned on protected endpoints",
      !!rlLimit && rlRemaining !== null && !!rlReset,
      `RateLimit-Limit: ${rlLimit}, Remaining: ${rlRemaining}, Reset: ${rlReset}`
    );
  } catch (e: any) {
    recordTest("Rate Limiting", "Standard RateLimit headers returned on protected endpoints", false, e.message);
  }

  // 8.3 Verify HttpOnly cookie set on login
  try {
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: testUserA.email, password: testUserA.password }),
    });
    const setCookie = loginRes.headers.get("set-cookie") || "";
    recordTest(
      "Authentication",
      "Login sets secure HttpOnly cookies (accessToken / refreshToken)",
      setCookie.includes("HttpOnly") && setCookie.includes("accessToken"),
      `Set-Cookie contains HttpOnly: ${setCookie.includes("HttpOnly")}`
    );
  } catch (e: any) {
    recordTest("Authentication", "Login sets secure HttpOnly cookies", false, e.message);
  }

  // 8.4 Reject query parameter token on state-changing requests (POST/DELETE)
  try {
    const res = await fetch(`${BASE_URL}/groups?token=${tokenA}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Unauthenticated POST Attempt" }),
    });
    const json = (await res.json()) as any;
    recordTest(
      "Authentication",
      "Reject query token on state-changing non-GET request (POST /groups?token=)",
      res.status === 401 && json.error?.code === "UNAUTHORIZED",
      `Status ${res.status}: ${json.error?.message}`
    );
  } catch (e: any) {
    recordTest("Authentication", "Reject query token on state-changing non-GET request", false, e.message);
  }

  // 8.5 Reject path traversal in fileKey route parameter
  try {
    const res = await fetch(`${BASE_URL}/groups/${groupId}/files/..%2F..%2Fpackage.json`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const json = (await res.json()) as any;
    recordTest(
      "File Security",
      "Reject path traversal attack in fileKey parameter with regex validation",
      res.status === 400 && json.error?.code === "VALIDATION_ERROR",
      `Status ${res.status}`
    );
  } catch (e: any) {
    recordTest("File Security", "Reject path traversal attack in fileKey parameter", false, e.message);
  }

  // 8.6 Verify protected file access: Non-member denied access to group files
  try {
    // First, upload a valid text file to groupId as User A
    const boundary = "---------------------------boundary" + Date.now();
    const validFile = Buffer.from("Hello private group content!");
    const postData = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notes.txt"\r\nContent-Type: text/plain\r\n\r\n`
      ),
      validFile,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const uploadRes = await fetch(`${BASE_URL}/groups/${groupId}/upload`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${tokenA}`,
      },
      body: postData,
    });
    const uploadJson = (await uploadRes.json()) as any;
    const uploadedFileKey = uploadJson.data?.fileKey;

    // Create a new separate group where User B is definitely NOT a member
    const privateGroupRes = ((await (
      await fetch(`${BASE_URL}/groups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenA}`,
        },
        body: JSON.stringify({ name: "Strict Private Group" }),
      })
    ).json())) as any;
    const privateGroupId = privateGroupRes.data?.group?.id;

    // Upload file to that private group
    const uploadRes2 = await fetch(`${BASE_URL}/groups/${privateGroupId}/upload`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${tokenA}`,
      },
      body: postData,
    });
    const uploadJson2 = (await uploadRes2.json()) as any;
    const privateFileKey = uploadJson2.data?.fileKey;

    // User B attempts to access private file
    const fileRes = await fetch(`${BASE_URL}/groups/${privateGroupId}/files/${privateFileKey}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const fileJson = (await fileRes.json()) as any;

    recordTest(
      "Authorization",
      "Verify access to protected files strictly blocks non-members (403)",
      fileRes.status === 403 && fileJson.error?.code === "FORBIDDEN",
      `Status ${fileRes.status}: ${fileJson.error?.message}`
    );
  } catch (e: any) {
    recordTest("Authorization", "Verify access to protected files strictly blocks non-members", false, e.message);
  }


  // ---------------------------------------------------------
  // CLEANUP TEST USERS & GROUPS
  // ---------------------------------------------------------
  try {
    const userIds = [userAId, userBId].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.group.deleteMany({
        where: { ownerId: { in: userIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: userIds } },
      });
    }
  } catch (e) {
    console.warn("Cleanup error", e);
  }


  // SUMMARY REPORT
  console.log("\n=======================================================");
  console.log("            SECURITY AUDIT SUMMARY REPORT");
  console.log("=======================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;

  console.log(`Total Security Checks: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

  try {
    server.close();
    await prisma.$disconnect();
  } catch {}

  if (failed > 0) {
    console.error("❌ Some security tests failed! See details above.");
    process.exit(1);
  } else {
    console.log("🎉 ALL SECURITY HARDENING TESTS PASSED SUCCESFULLY!");
    process.exit(0);
  }
}

runSecurityAuditTests().catch(async (err) => {
  console.error("Test runner error", err);
  try {
    await prisma.$disconnect();
  } catch {}
  process.exit(1);
});
