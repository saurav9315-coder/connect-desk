import { prisma } from "../lib/prisma";
import bcryptjs from "bcryptjs";

async function seedStitchDemo() {
  console.log("Seeding Stitch visual verification demo user and group...");

  const passwordHash = await bcryptjs.hash("Password123!", 12);

  // 1. Upsert Demo User A (Owner)
  const userA = await prisma.user.upsert({
    where: { email: "demo@stitch.local" },
    update: { passwordHash },
    create: {
      name: "Alex Rivera",
      username: "alex_stitch",
      email: "demo@stitch.local",
      passwordHash,
    },
  });

  // 2. Upsert Demo User B (Member)
  const userB = await prisma.user.upsert({
    where: { email: "sarah@stitch.local" },
    update: { passwordHash },
    create: {
      name: "Sarah Chen",
      username: "sarah_c",
      email: "sarah@stitch.local",
      passwordHash,
    },
  });

  // 3. Upsert Group
  let group = await prisma.group.findFirst({
    where: { name: "Stitch Engineering & AI" },
  });

  if (!group) {
    group = await prisma.group.create({
      data: {
        name: "Stitch Engineering & AI",
        description: "Google Stitch Design System (9667751278078556107) collaboration room",
        ownerId: userA.id,
        members: {
          create: [
            { userId: userA.id, role: "OWNER" },
            { userId: userB.id, role: "MEMBER" },
          ],
        },
      },
    });
  } else {
    // Ensure membership
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: userA.id } },
      update: { role: "OWNER" },
      create: { groupId: group.id, userId: userA.id, role: "OWNER" },
    });
    await prisma.groupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId: userB.id } },
      update: { role: "MEMBER" },
      create: { groupId: group.id, userId: userB.id, role: "MEMBER" },
    });
  }

  // Ensure pinned for userA
  await prisma.groupPin.upsert({
    where: { userId_groupId: { userId: userA.id, groupId: group.id } },
    update: {},
    create: { groupId: group.id, userId: userA.id },
  });

  // 4. Ensure demo messages if count < 4
  const msgCount = await prisma.message.count({ where: { groupId: group.id } });
  if (msgCount < 4) {
    // User message
    await prisma.message.create({
      data: {
        groupId: group.id,
        senderId: userB.id,
        type: "TEXT",
        content: "Hey @Alex! Could you ask the AI for a Node.js HTTP server example?",
      },
    });

    // User A query
    await prisma.message.create({
      data: {
        groupId: group.id,
        senderId: userA.id,
        type: "TEXT",
        content: "@AI Make a Node.js server with health check",
      },
    });

    // AI message
    await prisma.message.create({
      data: {
        groupId: group.id,
        senderId: null,
        type: "AI",
        content: `Here is a modern Node.js HTTP server implementation with a health check endpoint:

\`\`\`javascript
const http = require('http');

const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hello from Stitch Chat App!');
});

server.listen(5000, () => {
  console.log('Server listening on port 5000');
});
\`\`\`

### Key Features:
- Built with standard Node.js \`http\` module
- Direct JSON health endpoint
- Ready for Docker and production load balancing`,
      },
    });

    // Document file message
    await prisma.message.create({
      data: {
        groupId: group.id,
        senderId: userA.id,
        type: "FILE",
        content: "Here is the Stitch Architecture Specification document.",
        fileName: "stitch_spec_v2.pdf",
        fileSize: 2457600,
        fileUrl: "/api/groups/" + group.id + "/files/sample.pdf",
      },
    });
  }

  console.log("Demo seed complete! Group ID:", group.id);
  await prisma.$disconnect();
}

seedStitchDemo().catch((e) => {
  console.error("Seed error", e);
  process.exit(1);
});
