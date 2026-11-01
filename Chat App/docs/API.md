# REST API Specification Document

## Project: Simple Group Chat with AI

**Status:** Approved API Specification  
**Base URL:** `/api`  
**Protocol:** HTTPS / JSON  
**Lead Product Engineer:** Antigravity Team  

---

## 1. Global Conventions & Standards

### 1.1 Headers
- Content Type: `Content-Type: application/json` (except multipart uploads)
- Authorization: `Authorization: Bearer <ACCESS_TOKEN>`

### 1.2 Standard Success Response Envelope
```json
{
  "success": true,
  "data": {},
  "message": "Operation completed successfully"
}
```

### 1.3 Standard Error Response Envelope
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid email format",
    "details": [
      {
        "field": "email",
        "issue": "Must be a valid email address"
      }
    ]
  }
}
```

### 1.4 HTTP Status Codes
- `200 OK`: Request succeeded.
- `201 Created`: Resource successfully created.
- `400 Bad Request`: Input validation failed or malformed request.
- `401 Unauthorized`: Missing, invalid, or expired JWT.
- `403 Forbidden`: Authenticated user lacks permission (RBAC or membership check).
- `404 Not Found`: Target resource does not exist.
- `409 Conflict`: Unique constraint violation (e.g. email or username already taken).
- `429 Too Many Requests`: Rate limit exceeded.
- `500 Internal Server Error`: Unhandled server exception.

---

## 2. Authentication Endpoints

### 2.1 Register New User
- **Method / Route:** `POST /api/auth/register`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "email": "alex@example.com",
    "username": "alexdev",
    "displayName": "Alex Rivera",
    "password": "Password123!",
    "avatarUrl": "https://example.com/avatar.png" // optional
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "id": "usr_9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        "email": "alex@example.com",
        "username": "alexdev",
        "displayName": "Alex Rivera",
        "avatarUrl": null,
        "createdAt": "2026-09-27T08:00:00.000Z"
      },
      "accessToken": "eyJhbGciOiJIUzI1Ni...",
      "refreshToken": "d7b3dcb6d9b1deb4d..."
    }
  }
  ```

### 2.2 Login User
- **Method / Route:** `POST /api/auth/login`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "identifier": "alex@example.com", // email or username
    "password": "Password123!"
  }
  ```
- **Response (200 OK):** Same structure as Register response.

### 2.3 Refresh Access Token
- **Method / Route:** `POST /api/auth/refresh`
- **Auth:** Public (requires valid refresh token)
- **Request Body:**
  ```json
  {
    "refreshToken": "d7b3dcb6d9b1deb4d..."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "accessToken": "eyJhbGciOiJIUzI1Ni...",
      "refreshToken": "e8c4ecb7e0c2efb5e..." // Rotated refresh token
    }
  }
  ```

### 2.4 Logout
- **Method / Route:** `POST /api/auth/logout`
- **Auth:** Bearer Token
- **Request Body:**
  ```json
  {
    "refreshToken": "e8c4ecb7e0c2efb5e..."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```

### 2.5 Get Current User Profile
- **Method / Route:** `GET /api/auth/me`
- **Auth:** Bearer Token
- **Response (200 OK):** Returns current user record (excluding password hash).

---

## 3. User & Social Management Endpoints

### 3.1 Search Users (For Group Invites)
- **Method / Route:** `GET /api/users/search?q=alex`
- **Auth:** Bearer Token
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "usr_9b1deb4d...",
        "username": "alexdev",
        "displayName": "Alex Rivera",
        "avatarUrl": null
      }
    ]
  }
  ```

### 3.2 Block User
- **Method / Route:** `POST /api/users/block/:userId`
- **Auth:** Bearer Token
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "User blocked successfully"
  }
  ```

### 3.3 Unblock User
- **Method / Route:** `DELETE /api/users/block/:userId`
- **Auth:** Bearer Token
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "User unblocked successfully"
  }
  ```

### 3.4 List Blocked Users
- **Method / Route:** `GET /api/users/blocked`
- **Auth:** Bearer Token
- **Response (200 OK):** Returns array of blocked user profiles.

---

## 4. Group Management Endpoints

### 4.1 List User Groups (Group Sidebar)
- **Method / Route:** `GET /api/groups`
- **Auth:** Bearer Token
- **Description:** Returns all groups the user belongs to, sorted with pinned groups first, then by latest message date.
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "grp_1111-2222-3333",
        "name": "Frontend Architects",
        "description": "Next.js & Stitch UI discussions",
        "avatarUrl": "https://example.com/grp.png",
        "isPinned": true,
        "pinnedAt": "2026-09-27T07:15:00.000Z",
        "userRole": "OWNER",
        "memberCount": 5,
        "lastMessage": {
          "id": "msg_9999",
          "content": "@AI how do we optimize layout shifts?",
          "senderType": "USER",
          "senderName": "Alex Rivera",
          "createdAt": "2026-09-27T08:30:00.000Z"
        },
        "unreadCount": 0
      }
    ]
  }
  ```

### 4.2 Create Group
- **Method / Route:** `POST /api/groups`
- **Auth:** Bearer Token
- **Request Body:**
  ```json
  {
    "name": "Design Systems Core",
    "description": "Crafting clean components",
    "avatarUrl": null,
    "initialMemberIds": ["usr_2222", "usr_3333"]
  }
  ```
- **Response (201 Created):** Returns new group object with creator assigned as `OWNER`.

### 4.3 Get Group Details
- **Method / Route:** `GET /api/groups/:groupId`
- **Auth:** Bearer Token (must be member)
- **Response (200 OK):** Returns detailed group metadata, member count, and caller's role.

### 4.4 Update Group Details
- **Method / Route:** `PATCH /api/groups/:groupId`
- **Auth:** Bearer Token (requires `OWNER` or `ADMIN`)
- **Request Body:**
  ```json
  {
    "name": "Design Systems 2.0",
    "description": "Updated roadmap"
  }
  ```
- **Response (200 OK):** Returns updated group record.

### 4.5 Delete Group
- **Method / Route:** `DELETE /api/groups/:groupId`
- **Auth:** Bearer Token (strictly requires `OWNER`)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Group deleted successfully"
  }
  ```

### 4.6 Pin Group
- **Method / Route:** `POST /api/groups/:groupId/pin`
- **Auth:** Bearer Token
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Group pinned to top"
  }
  ```

### 4.7 Unpin Group
- **Method / Route:** `DELETE /api/groups/:groupId/pin`
- **Auth:** Bearer Token
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "message": "Group unpinned"
  }
  ```

---

## 5. Group Members & Admin Controls Endpoints

### 5.1 List Members of a Group
- **Method / Route:** `GET /api/groups/:groupId/members`
- **Auth:** Bearer Token (must be member)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "mem_111",
        "userId": "usr_9b1deb4d...",
        "role": "OWNER",
        "joinedAt": "2026-09-20T10:00:00.000Z",
        "user": {
          "id": "usr_9b1deb4d...",
          "username": "alexdev",
          "displayName": "Alex Rivera",
          "avatarUrl": null
        }
      }
    ]
  }
  ```

### 5.2 Add Member to Group
- **Method / Route:** `POST /api/groups/:groupId/members`
- **Auth:** Bearer Token (requires `OWNER` or `ADMIN`)
- **Request Body:**
  ```json
  {
    "userId": "usr_8888"
  }
  ```
- **Response (201 Created):** Returns new membership record.

### 5.3 Remove Member / Leave Group
- **Method / Route:** `DELETE /api/groups/:groupId/members/:userId`
- **Auth:** Bearer Token
- **Rules:**
  - Owner or Admin can remove members.
  - Any member can remove themselves ("Leave Group").
  - Admin cannot remove Owner or fellow Admins.
  - Owner cannot leave without transferring ownership first.
- **Response (200 OK):** Success confirmation.

### 5.4 Update Member Role / Admin Governance
- **Method / Route:** `PATCH /api/groups/:groupId/members/:userId/role`
- **Auth:** Bearer Token (strictly requires `OWNER`)
- **Request Body:**
  ```json
  {
    "role": "ADMIN" // "ADMIN", "MEMBER", or "OWNER" (ownership transfer)
  }
  ```
- **Response (200 OK):** Returns updated member record.

---

## 6. Messages & Media Endpoints

### 6.1 Get Group Messages (Cursor Pagination)
- **Method / Route:** `GET /api/groups/:groupId/messages?cursor=msg_123&limit=50`
- **Auth:** Bearer Token (must be member)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "messages": [
        {
          "id": "msg_456",
          "groupId": "grp_1111",
          "senderId": "usr_9b1deb4d...",
          "senderType": "USER",
          "messageType": "TEXT",
          "content": "@AI generate a clean Express middleware",
          "mediaUrl": null,
          "mediaMetadata": null,
          "createdAt": "2026-09-27T08:31:00.000Z",
          "sender": {
            "id": "usr_9b1deb4d...",
            "displayName": "Alex Rivera",
            "avatarUrl": null
          }
        },
        {
          "id": "msg_457",
          "groupId": "grp_1111",
          "senderId": null,
          "senderType": "AI",
          "messageType": "TEXT",
          "content": "Here is an Express middleware to validate JWT tokens:\n\n```typescript\nexport const authMiddleware = ...\n```",
          "mediaUrl": null,
          "mediaMetadata": null,
          "createdAt": "2026-09-27T08:31:05.000Z",
          "sender": null
        }
      ],
      "nextCursor": "msg_400",
      "hasMore": true
    }
  }
  ```

### 6.2 Upload Media File
- **Method / Route:** `POST /api/groups/:groupId/upload`
- **Auth:** Bearer Token (must be member)
- **Payload:** `multipart/form-data` with field `file` and `category` (`image` | `video` | `file` | `audio`)
- **Validation:**
  - `image`: max 10MB (`image/png`, `image/jpeg`, `image/webp`, `image/gif`)
  - `video`: max 50MB (`video/mp4`, `video/webm`, `video/quicktime`)
  - `audio`: max 15MB (`audio/webm`, `audio/mp3`, `audio/ogg`, `audio/wav`)
  - `file`: max 25MB (`application/pdf`, `text/*`, `.zip`, `.csv`)
- **Response (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "fileUrl": "/uploads/media/2026/09/aud_9a8b.webm",
      "fileName": "voice_note_1.webm",
      "fileSize": 142050,
      "mimeType": "audio/webm",
      "durationSec": 14
    }
  }
  ```

### 6.3 Send Message (REST Fallback)
- **Method / Route:** `POST /api/groups/:groupId/messages`
- **Auth:** Bearer Token (must be member)
- **Request Body:**
  ```json
  {
    "content": "Check out this screenshot",
    "messageType": "IMAGE",
    "mediaUrl": "https://example.com/uploads/screen.png",
    "mediaMetadata": {
      "fileName": "screen.png",
      "fileSize": 204800,
      "mimeType": "image/png",
      "dimensions": { "width": 1920, "height": 1080 }
    }
  }
  ```
- **Response (201 Created):** Returns created message and triggers real-time broadcast and AI worker if `@AI` is detected.
