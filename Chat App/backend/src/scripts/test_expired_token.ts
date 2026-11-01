import jwt from "jsonwebtoken";
import { ENV } from "../config/env";

const API_BASE = "http://localhost:5000/api";

async function testExpiredAccessToken() {
  console.log("Testing expired token behavior...");

  // Create an expired access token
  const expiredToken = jwt.sign(
    {
      userId: "test-user-id",
      email: "test@example.com",
      username: "testuser",
    },
    ENV.JWT_ACCESS_SECRET,
    {
      algorithm: "HS256",
      issuer: "chat-app-backend",
      audience: "chat-app-client",
      expiresIn: "0s",
    }
  );

  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });

  const data = await res.json();
  console.log("Expired token response:", res.status, data);

  if (res.status === 401 && data.error?.code === "INVALID_TOKEN" && data.error?.message === "Token has expired") {
    console.log("✅ Expired token correctly rejected with 401 'Token has expired'");
  } else {
    console.error("❌ Unexpected response for expired token");
    process.exit(1);
  }
}

testExpiredAccessToken().catch((e) => {
  console.error(e);
  process.exit(1);
});
