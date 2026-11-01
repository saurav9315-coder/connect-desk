import { app } from "../app";
import { prisma } from "../lib/prisma";
import http from "http";

const PORT = 5055;
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

async function runStep3GroupsVerification() {
  console.log("================================================================================");
  console.log("        BACKEND STEP 3 - COMPREHENSIVE GROUPS & ROLES VERIFICATION");
  console.log("================================================================================\n");

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, () => resolve()));
  console.log(`Test server running on port ${PORT}\n`);

  try {
    const timestamp = Date.now().toString().slice(-6);

    // --------------------------------------------------------------------------
    // SETUP: Create 5 Test Users (Owner, Admin, Member, Extra, Fifth)
    // --------------------------------------------------------------------------
    console.log("--- SETUP: REGISTERING TEST USERS ---");

    const usersToCreate = [
      { name: "Owner Alice", username: `alice_${timestamp}`, email: `alice_${timestamp}@test.com`, password: "Password123!" },
      { name: "Admin Bob", username: `bob_${timestamp}`, email: `bob_${timestamp}@test.com`, password: "Password123!" },
      { name: "Member Charlie", username: `charlie_${timestamp}`, email: `charlie_${timestamp}@test.com`, password: "Password123!" },
      { name: "Extra Dave", username: `dave_${timestamp}`, email: `dave_${timestamp}@test.com`, password: "Password123!" },
      { name: "Fifth Eve", username: `eve_${timestamp}`, email: `eve_${timestamp}@test.com`, password: "Password123!" },
    ];

    const userMap: Record<string, { id: string; token: string }> = {};

    for (const u of usersToCreate) {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(u),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(`Failed to create test user ${u.name}: ${JSON.stringify(data)}`);
      }
      userMap[u.name.split(" ")[0].toLowerCase()] = {
        id: data.data.user.id,
        token: data.data.accessToken,
      };
    }

    const alice = userMap["owner"];
    const bob = userMap["admin"];
    const charlie = userMap["member"];
    const dave = userMap["extra"];
    const eve = userMap["fifth"];

    console.log(`Registered 5 test users successfully.\n`);

    let groupId = "";

    // --------------------------------------------------------------------------
    // 1. GROUP CREATION TESTS
    // --------------------------------------------------------------------------
    console.log("--- SECTION 1: GROUP CREATION ---");

    // 1.1 Reject empty name
    {
      const res = await fetch(`${API_BASE}/groups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.token}`,
        },
        body: JSON.stringify({ name: "   ", memberIds: [bob.id] }),
      });
      const data = await res.json();
      const passed = res.status === 400 && data.success === false;
      record(1, "Create Group", "Reject empty group name", passed, `Status: ${res.status}, msg: ${data.message || data.error?.message}`);
    }

    // 1.2 Reject unknown user ID
    {
      const res = await fetch(`${API_BASE}/groups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.token}`,
        },
        body: JSON.stringify({ name: "Alpha Team", memberIds: ["00000000-0000-0000-0000-000000000000"] }),
      });
      const data = await res.json();
      const passed = res.status === 404 && data.success === false;
      record(2, "Create Group", "Reject unknown member user ID", passed, `Status: ${res.status}, msg: ${data.message || data.error?.message}`);
    }

    // 1.3 Valid group creation (Owner + selected members)
    {
      const res = await fetch(`${API_BASE}/groups`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.token}`,
        },
        body: JSON.stringify({
          name: "Engineers Club",
          image: "https://example.com/engineers.png",
          memberIds: [bob.id, charlie.id, alice.id], // duplicate creator in memberIds tested here
        }),
      });
      const data = await res.json();
      const group = data.data?.group || data.data;
      groupId = group?.id;

      const creatorMember = group?.members?.find((m: any) => m.userId === alice.id);
      const bobMember = group?.members?.find((m: any) => m.userId === bob.id);
      const charlieMember = group?.members?.find((m: any) => m.userId === charlie.id);

      const creatorIsOwner = creatorMember?.role === "OWNER";
      const membersAreMember = bobMember?.role === "MEMBER" && charlieMember?.role === "MEMBER";
      const noPasswordHash = !JSON.stringify(data).includes("passwordHash");
      const passed = res.status === 201 && !!groupId && creatorIsOwner && membersAreMember && noPasswordHash;

      record(
        3,
        "Create Group",
        "Create group with OWNER creator and MEMBER initial members in transaction",
        passed,
        `Status: ${res.status}, groupId: ${groupId}, members count: ${group?.members?.length}`
      );
    }

    // --------------------------------------------------------------------------
    // 2. GET USER GROUPS
    // --------------------------------------------------------------------------
    console.log("\n--- SECTION 2: GET USER GROUPS ---");

    // 2.1 Owner gets groups
    {
      const res = await fetch(`${API_BASE}/groups`, {
        headers: { Authorization: `Bearer ${alice.token}` },
      });
      const data = await res.json();
      const groups = data.data?.groups || [];
      const found = groups.find((g: any) => g.id === groupId);
      const passed = res.status === 200 && !!found && found.currentUserRole === "OWNER" && found.memberCount === 3;
      record(4, "Get Groups", "Owner fetches groups with role and memberCount", passed, `Status: ${res.status}, found: ${!!found}, role: ${found?.currentUserRole}`);
    }

    // 2.2 Member gets groups
    {
      const res = await fetch(`${API_BASE}/groups`, {
        headers: { Authorization: `Bearer ${charlie.token}` },
      });
      const data = await res.json();
      const groups = data.data?.groups || [];
      const found = groups.find((g: any) => g.id === groupId);
      const passed = res.status === 200 && !!found && found.currentUserRole === "MEMBER";
      record(5, "Get Groups", "Member fetches groups with role MEMBER", passed, `Status: ${res.status}, role: ${found?.currentUserRole}`);
    }

    // 2.3 Non-member does not see group
    {
      const res = await fetch(`${API_BASE}/groups`, {
        headers: { Authorization: `Bearer ${dave.token}` },
      });
      const data = await res.json();
      const groups = data.data?.groups || [];
      const found = groups.find((g: any) => g.id === groupId);
      const passed = res.status === 200 && !found;
      record(6, "Get Groups", "Non-member does not see unjoined group", passed, `Status: ${res.status}, present: ${!!found}`);
    }

    // --------------------------------------------------------------------------
    // 3. GET GROUP DETAILS
    // --------------------------------------------------------------------------
    console.log("\n--- SECTION 3: GET GROUP DETAILS ---");

    // 3.1 Member gets group details
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${bob.token}` },
      });
      const data = await res.json();
      const group = data.data?.group || data.data;
      const hasMembers = Array.isArray(group?.members) && group.members.length === 3;
      const noPasswordHash = !JSON.stringify(data).includes("passwordHash");
      const passed = res.status === 200 && hasMembers && noPasswordHash;
      record(7, "Group Details", "Member gets details with member list and safe user fields", passed, `Status: ${res.status}, members: ${group?.members?.length}`);
    }

    // 3.2 Non-member gets group details -> 403 Forbidden
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${dave.token}` },
      });
      const data = await res.json();
      const passed = res.status === 403 && data.success === false;
      record(8, "Group Details", "Non-member rejected with 403 Forbidden", passed, `Status: ${res.status}, msg: ${data.message || data.error?.message}`);
    }

    // --------------------------------------------------------------------------
    // 4. ROLE MANAGEMENT (Make Admin / Remove Admin)
    // --------------------------------------------------------------------------
    console.log("\n--- SECTION 4: ROLE MANAGEMENT ---");

    // 4.1 Owner promotes Bob to ADMIN
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/members/${bob.id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.token}`,
        },
        body: JSON.stringify({ role: "ADMIN" }),
      });
      const data = await res.json();
      const passed = res.status === 200 && data.data?.member?.role === "ADMIN";
      record(9, "Role Management", "Owner makes MEMBER -> ADMIN (Bob promoted)", passed, `Status: ${res.status}, new role: ${data.data?.member?.role}`);
    }

    // 4.2 Admin (Bob) tries to promote Charlie -> 403 Forbidden
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/members/${charlie.id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bob.token}`,
        },
        body: JSON.stringify({ role: "ADMIN" }),
      });
      const data = await res.json();
      const passed = res.status === 403 && data.success === false;
      record(10, "Role Management", "Admin denied from promoting members (403)", passed, `Status: ${res.status}, msg: ${data.message || data.error?.message}`);
    }

    // 4.3 Member (Charlie) tries to promote someone -> 403 Forbidden
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/members/${bob.id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${charlie.token}`,
        },
        body: JSON.stringify({ role: "ADMIN" }),
      });
      const data = await res.json();
      const passed = res.status === 403 && data.success === false;
      record(11, "Role Management", "Member denied from changing roles (403)", passed, `Status: ${res.status}, msg: ${data.message || data.error?.message}`);
    }

    // 4.4 Role escalation: Attempt to set role to OWNER -> 400 Bad Request
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/members/${charlie.id}/role`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.token}`,
        },
        body: JSON.stringify({ role: "OWNER" }),
      });
      const data = await res.json();
      const passed = res.status === 400 && data.success === false;
      record(12, "Role Management", "Role escalation to OWNER rejected (400)", passed, `Status: ${res.status}, msg: ${data.message || data.error?.message}`);
    }

    // 4.5 Owner demotes Charlie from ADMIN (promote first then demote)
    {
      // First promote Charlie
      await fetch(`${API_BASE}/groups/${groupId}/members/${charlie.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${alice.token}` },
        body: JSON.stringify({ role: "ADMIN" }),
      });

      // Now demote Charlie back to MEMBER
      const res = await fetch(`${API_BASE}/groups/${groupId}/members/${charlie.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${alice.token}` },
        body: JSON.stringify({ role: "MEMBER" }),
      });
      const data = await res.json();
      const passed = res.status === 200 && data.data?.member?.role === "MEMBER";
      record(13, "Role Management", "Owner demotes ADMIN -> MEMBER (Charlie demoted)", passed, `Status: ${res.status}, role: ${data.data?.member?.role}`);
    }

    // --------------------------------------------------------------------------
    // 5. MEMBER MANAGEMENT (Add / Remove Member)
    // --------------------------------------------------------------------------
    console.log("\n--- SECTION 5: MEMBER MANAGEMENT ---");

    // 5.1 Owner adds Dave
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.token}`,
        },
        body: JSON.stringify({ userId: dave.id }),
      });
      const data = await res.json();
      const passed = res.status === 201 && data.data?.member?.role === "MEMBER" && data.data?.member?.userId === dave.id;
      record(14, "Member Management", "Owner adds member (Dave added)", passed, `Status: ${res.status}`);
    }

    // 5.2 Duplicate member rejected -> 409 Conflict
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.token}`,
        },
        body: JSON.stringify({ userId: dave.id }),
      });
      const data = await res.json();
      const passed = res.status === 409 && data.success === false;
      record(15, "Member Management", "Duplicate member rejected (409 Conflict)", passed, `Status: ${res.status}, msg: ${data.message || data.error?.message}`);
    }

    // 5.3 Admin (Bob) adds Eve
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bob.token}`,
        },
        body: JSON.stringify({ userId: eve.id }),
      });
      const data = await res.json();
      const passed = res.status === 201 && data.data?.member?.userId === eve.id;
      record(16, "Member Management", "Admin adds member (Eve added)", passed, `Status: ${res.status}`);
    }

    // 5.4 Member (Charlie) tries to add member -> 403 Forbidden
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${charlie.token}`,
        },
        body: JSON.stringify({ userId: alice.id }),
      });
      const data = await res.json();
      const passed = res.status === 403 && data.success === false;
      record(17, "Member Management", "Member denied from adding members (403)", passed, `Status: ${res.status}, msg: ${data.message || data.error?.message}`);
    }

    // 5.5 Member (Charlie) tries to remove Eve -> 403 Forbidden
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/members/${eve.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${charlie.token}` },
      });
      const data = await res.json();
      const passed = res.status === 403 && data.success === false;
      record(18, "Member Management", "Member denied from removing other members (403)", passed, `Status: ${res.status}, msg: ${data.message || data.error?.message}`);
    }

    // 5.6 Admin (Bob) tries to remove Owner (Alice) -> 403 Forbidden
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/members/${alice.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${bob.token}` },
      });
      const data = await res.json();
      const passed = res.status === 403 && data.success === false;
      record(19, "Member Management", "Admin cannot remove group OWNER (403)", passed, `Status: ${res.status}, msg: ${data.message || data.error?.message}`);
    }

    // 5.7 Admin (Bob) removes Member (Eve) -> 200 OK
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/members/${eve.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${bob.token}` },
      });
      const data = await res.json();
      const passed = res.status === 200 && data.success === true;
      record(20, "Member Management", "Admin removes MEMBER (Eve removed)", passed, `Status: ${res.status}`);
    }

    // 5.8 Owner (Alice) removes Admin (Bob) -> 200 OK
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/members/${bob.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${alice.token}` },
      });
      const data = await res.json();
      const passed = res.status === 200 && data.success === true;
      record(21, "Member Management", "Owner removes ADMIN (Bob removed)", passed, `Status: ${res.status}`);
    }

    // --------------------------------------------------------------------------
    // 6. GROUP INFORMATION (Update Group)
    // --------------------------------------------------------------------------
    console.log("\n--- SECTION 6: GROUP INFORMATION ---");

    // 6.1 Owner updates group name and image
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.token}`,
        },
        body: JSON.stringify({
          name: "Engineers Club VIP",
          image: "https://example.com/vip.png",
        }),
      });
      const data = await res.json();
      const group = data.data?.group || data.data;
      const passed = res.status === 200 && group?.name === "Engineers Club VIP" && group?.image === "https://example.com/vip.png";
      record(22, "Update Group", "Owner updates group name & image", passed, `Status: ${res.status}, name: ${group?.name}`);
    }

    // 6.2 Admin / Non-owner tries to update group -> 403 Forbidden
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${charlie.token}`,
        },
        body: JSON.stringify({ name: "Hacked Team" }),
      });
      const data = await res.json();
      const passed = res.status === 403 && data.success === false;
      record(23, "Update Group", "Non-owner denied from updating group (403)", passed, `Status: ${res.status}, msg: ${data.message || data.error?.message}`);
    }

    // 6.3 Update with empty name -> 400 Bad Request
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${alice.token}`,
        },
        body: JSON.stringify({ name: "  " }),
      });
      const data = await res.json();
      const passed = res.status === 400 && data.success === false;
      record(24, "Update Group", "Reject empty name on update (400)", passed, `Status: ${res.status}`);
    }

    // --------------------------------------------------------------------------
    // 7. LEAVE GROUP
    // --------------------------------------------------------------------------
    console.log("\n--- SECTION 7: LEAVE GROUP ---");

    // 7.1 Owner tries to leave -> 400 with clear message
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${alice.token}` },
      });
      const data = await res.json();
      const hasClearMessage = (data.message || "").includes("Owner cannot leave the group. Transfer ownership before leaving.");
      const passed = res.status === 400 && hasClearMessage;
      record(25, "Leave Group", "Owner forbidden from leaving without transfer", passed, `Status: ${res.status}, msg: ${data.message}`);
    }

    // 7.2 Member (Charlie) leaves group -> 200 OK
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${charlie.token}` },
      });
      const data = await res.json();
      const passed = res.status === 200 && data.success === true;
      record(26, "Leave Group", "Member leaves group successfully (200)", passed, `Status: ${res.status}`);
    }

    // 7.3 Former member tries to leave again -> 403 Forbidden
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${charlie.token}` },
      });
      const data = await res.json();
      const passed = res.status === 403 && data.success === false;
      record(27, "Leave Group", "Non-member rejected on leave (403)", passed, `Status: ${res.status}, msg: ${data.message || data.error?.message}`);
    }

    // --------------------------------------------------------------------------
    // 8. SECURITY & TAMPERING
    // --------------------------------------------------------------------------
    console.log("\n--- SECTION 8: SECURITY & TAMPERING ---");

    // 8.1 Non-member accesses another group's ID
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}`, {
        headers: { Authorization: `Bearer ${charlie.token}` },
      });
      const data = await res.json();
      const passed = res.status === 403 && data.success === false;
      record(28, "Security", "Tampering: Access other group's ID rejected (403)", passed, `Status: ${res.status}`);
    }

    // 8.2 Malformed UUID
    {
      const res = await fetch(`${API_BASE}/groups/not-a-valid-uuid`, {
        headers: { Authorization: `Bearer ${alice.token}` },
      });
      const data = await res.json();
      const passed = res.status === 400 && data.success === false;
      record(29, "Security", "Malformed UUID rejected with validation error (400)", passed, `Status: ${res.status}`);
    }

    // 8.3 Unauthenticated request
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}`);
      const data = await res.json();
      const passed = res.status === 401 && data.success === false;
      record(30, "Security", "Unauthenticated request rejected with 401", passed, `Status: ${res.status}`);
    }

    // --------------------------------------------------------------------------
    // 9. DELETE GROUP
    // --------------------------------------------------------------------------
    console.log("\n--- SECTION 9: DELETE GROUP ---");

    // 9.1 Non-owner (Dave) tries to delete group -> 403 Forbidden
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${dave.token}` },
      });
      const data = await res.json();
      const passed = res.status === 403 && data.success === false;
      record(31, "Delete Group", "Non-owner denied from deleting group (403)", passed, `Status: ${res.status}`);
    }

    // 9.2 Owner deletes group -> 200 OK
    {
      const res = await fetch(`${API_BASE}/groups/${groupId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${alice.token}` },
      });
      const data = await res.json();
      const passed = res.status === 200 && data.success === true;
      record(32, "Delete Group", "Owner deletes group in safe cascade transaction (200)", passed, `Status: ${res.status}`);
    }

    // 9.3 Verify group is deleted and users intact
    {
      const groupInDb = await prisma.group.findUnique({ where: { id: groupId } });
      const membersInDb = await prisma.groupMember.count({ where: { groupId } });
      const aliceInDb = await prisma.user.findUnique({ where: { id: alice.id } });
      const bobInDb = await prisma.user.findUnique({ where: { id: bob.id } });

      const passed = !groupInDb && membersInDb === 0 && !!aliceInDb && !!bobInDb;
      record(33, "Delete Group", "Group and memberships removed, user records intact", passed, `Group exists: ${!!groupInDb}, users intact: ${!!aliceInDb && !!bobInDb}`);
    }

    // --------------------------------------------------------------------------
    // SUMMARY
    // --------------------------------------------------------------------------
    console.log("\n================================================================================");
    console.log("                           VERIFICATION SUMMARY");
    console.log("================================================================================");

    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;

    console.log(`TOTAL TESTS: ${totalCount}`);
    console.log(`PASSED: ${passedCount}`);
    console.log(`FAILED: ${totalCount - passedCount}`);

    if (passedCount === totalCount) {
      console.log("\n🎉 ALL TESTS PASSED! GROUP BACKEND READY");
    } else {
      console.error("\n❌ SOME TESTS FAILED! GROUP BACKEND NOT READY");
    }
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runStep3GroupsVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
