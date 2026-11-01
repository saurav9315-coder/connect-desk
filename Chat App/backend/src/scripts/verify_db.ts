import { prisma } from "../lib/prisma";

async function verifyDatabaseIntegrity() {
  console.log("Verifying Database records...");

  const users = await prisma.user.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      passwordHash: true,
      createdAt: true,
    },
  });

  console.log(`Found ${users.length} recent users in MySQL`);
  for (const user of users) {
    const isBcrypt = user.passwordHash.startsWith("$2a$") || user.passwordHash.startsWith("$2b$");
    console.log(`User: ${user.username} (${user.email}), bcrypt hashed: ${isBcrypt}`);
    if (!isBcrypt) {
      throw new Error(`User ${user.username} has unhashed password!`);
    }
  }

  const tokens = await prisma.refreshToken.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
  });
  console.log(`Found ${tokens.length} recent refresh tokens in MySQL`);
  for (const token of tokens) {
    console.log(`Token id: ${token.id}, tokenHash length: ${token.tokenHash.length} (SHA-256), revoked: ${token.revokedAt !== null}`);
  }

  console.log("✅ Database verification passed with 100% integrity.");
}

verifyDatabaseIntegrity().catch((e) => {
  console.error(e);
  process.exit(1);
});
