# CreditFlow API Documentation

Base URL: `http://localhost:4000/api`

**Authentication**: Most endpoints (except Login & Register) require a JWT Bearer token in the Authorization header.
`Authorization: Bearer <token>`

---

## 1. Authentication (`/api/auth`)

### `POST /auth/register`
Creates a new merchant account.
- **Body**: `{ "name": "...", "email": "...", "password": "..." }`
- **Returns**: `{ success: true, accessToken, refreshToken, merchant }`

### `POST /auth/login`
Logs in a merchant.
- **Body**: `{ "email": "...", "password": "..." }`
- **Returns**: `{ success: true, accessToken, refreshToken, merchant }`

### `GET /auth/me`
Fetches the currently authenticated merchant's details along with their joined tenant groups and roles.
- **Returns**: `{ success: true, merchant: {...}, groups: [{ _id, name, type, ownerId, inviteCode, createdAt, role }] }`

### `PATCH /auth/me`
Updates profile information for the authenticated merchant.
- **Body**: `{ "name"?: string, "phone"?: string, "businessName"?: string }`
- **Returns**: `{ success: true, merchant: {...} }`

### `POST /auth/change-password`
Updates the authenticated merchant's password using bcrypt (12 rounds).
- **Headers**: `Authorization: Bearer <token>`
- **Body**: `{ "oldPassword": "currentPassword123", "newPassword": "newSecurePassword456" }`
- **Validation**: `newPassword` minimum 8 characters.
- **Returns (200)**: `{ "success": true, "message": "Password changed successfully." }`
- **Errors**: `400 INVALID_CREDENTIALS` if `oldPassword` is incorrect; `400 VALIDATION` on malformed inputs.

### `POST /auth/refresh`
Performs RFC 6819 refresh token rotation with family reuse detection.
- **Body**: `{ "refreshToken": "<jwt_refresh_token>" }`
- **Mechanism**: Validates the SHA-256 token hash against active sessions. On success, revokes current session and issues a new `accessToken` and `refreshToken` within the same `familyId`.
- **Reuse Detection**: If a previously revoked or invalidated token is presented, the entire session family (`familyId`) is immediately revoked to neutralize token theft attacks, returning `401`.
- **Returns (200)**: `{ "success": true, "accessToken": "...", "refreshToken": "..." }`

### `GET /auth/sessions`
Lists all active device sessions for the authenticated merchant.
- **Headers**: `Authorization: Bearer <token>`
- **Returns (200)**:
```json
{
  "success": true,
  "count": 1,
  "sessions": [
    {
      "id": "66123abc456def7890123999",
      "deviceInfo": "Mozilla/5.0 ... Chrome/128",
      "ipAddress": "127.0.0.1",
      "lastUsed": "2026-10-20T12:00:00.000Z",
      "createdAt": "2026-10-20T10:00:00.000Z"
    }
  ]
}
```

### `DELETE /auth/sessions/:id`
Revokes an active session, invalidating any future refresh requests from that token family.
- **Headers**: `Authorization: Bearer <token>`
- **Returns (200)**: `{ "success": true, "message": "Session revoked successfully." }`

---

## 2. Merchants (`/api/merchants`)

### `GET /merchants`
Fetches all merchants.
- **Returns**: `{ success: true, count: number, merchants: [...] }`

### `GET /merchants/:id`
Fetches a single merchant by ID.
- **Returns**: `{ success: true, merchant: {...} }`

---

## 3. Debts (`/api/debts`)

### `GET /debts`
Fetches all active debts.
- **Query Params (Optional)**: `?debtorId=...`, `?creditorId=...`, `?status=...`
- **Returns**: `{ success: true, count: number, debts: [...] }`

### `POST /debts`
Creates a new debt edge.
- **Body**: `{ "debtorId": "<mongo_id>", "creditorId": "<mongo_id>", "amount": 1500 }`
- **Returns**: `{ success: true, debt: {...} }`

### `PATCH /debts/:id`
Updates the amount of an existing active debt.
- **Body**: `{ "amount": 2000 }`
- **Returns**: `{ success: true, debt: {...} }`

### `DELETE /debts/:id`
Marks a debt as fully settled (amount becomes 0).
- **Returns**: `{ success: true, message: "...", debtId }`

---

## 4. Settlement & Graph (`/api/settlement`)

### `POST /settlement`
Computes the minimized debt settlement graph via Python Engine. Creates a pending settlement batch.
- **Returns**: `{ success: true, batchId, settlement: {...}, settlementId }`

### `POST /settlement/cycles`
Detects pure circular debt chains in the active graph via Python Engine.
- **Returns**: `{ success: true, has_cycle: boolean, cycles: [[...]] }`

### `POST /settlement/confirm/:batchId`
Confirms a pending settlement batch. Marks all active debts in the system as settled.
- **Returns**: `{ success: true, batchId }`

---

## 5. Risk Analysis (`/api/risk`)

### `POST /risk/score/:merchantId`
Calculates and updates the credit default risk score for a specific merchant.
- **Returns**: `{ success: true, assessment: {...} }`

### `GET /risk/score/:merchantId`
Fetches the latest cached risk assessment for a merchant.
- **Returns**: `{ success: true, assessment: {...} }`

### `POST /risk/portfolio`
Calculates risk scores for the entire merchant portfolio at once.
- **Returns**: `{ success: true, portfolio: {...} }`

---

## 6. Real-time Events (Socket.IO)
Connect the client via Socket.IO to `http://localhost:4000`.

### Client -> Server Events
- **`join:merchant`**: Send `{ "merchantId": "<mongo_id>" }` to subscribe to merchant-specific events.

### Server -> Client Events
- **`debt:created`**: `{ debt: {...} }` — emitted globally when a debt is added.
- **`debt:updated`**: `{ debt: {...} }` — emitted globally when a debt changes amount.
- **`debt:settled`**: `{ debtId: "..." }` — emitted globally when a specific debt is marked settled.
- **`settlement:ready`**: `{ batchId, transactions, transactionCount }` — emitted globally when Python engine finishes minimization.
- **`settlement:confirmed`**: `{ batchId }` — emitted globally when all debts are wiped/settled.

---

## 7. Groups / Debts / Payments / Audit (v2 contract)

### 7.1 Multi-Tenant Headers & Scoping
All group-scoped endpoints require:
1. `Authorization: Bearer <jwt_token>`
2. `X-Group-Id: <group_mongo_id>` (tenant boundary identifier)

### 7.2 Role Rules & Permissions
| Role | Visibility | Allowed Actions |
|---|---|---|
| `owner` / `admin` | Full group graph and all debts (`scope=all` or default) | Add/remove members, assign roles, rotate invite codes, compute/confirm settlements, view all audit logs. |
| `member` | Ego-network only (`scope=mine`): debts where member is debtor or creditor | Create debt requests (start in `pending`), confirm/reject/dispute debts where they are counterparty, record payments on own debts, view own audit logs. |

### 7.3 Standard Error Shape
```json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "Human readable explanation"
}
```

#### Slice A Error Codes
- **`FORBIDDEN_GROUP`** (403): User is not a member of the group specified in `X-Group-Id` or lacks permission for the requested action.
- **`CONCURRENT_MODIFICATION`** (409): Optimistic locking / CAS version mismatch (`expectedVersion` ≠ current `version`).
- **`STALE_SETTLEMENT`** (409): Debt versions changed since settlement batch snapshot was computed.
- **`VALIDATION`** (400): Invalid request payload (missing fields, negative amount, invalid role, etc.).
- **`NOT_FOUND`** (404): Group, Debt, Member, or Payment resource not found within the tenant.
- **`IDEMPOTENT_REPLAY`** (409 / 200): Request was already executed under this idempotency key.

---

### 7.4 Groups Endpoints (`/api/groups`)

#### `POST /groups`
Creates a new group. The authenticated caller automatically becomes the `owner`.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
```json
{
  "name": "Crawford Market Circle",
  "type": "market"
}
```
- **Returns (201)**:
```json
{
  "success": true,
  "group": {
    "_id": "66123abc456def7890123456",
    "name": "Crawford Market Circle",
    "type": "market",
    "ownerId": "66123abc456def7890123000",
    "inviteCode": "CRAWF882",
    "createdAt": "2026-10-16T12:00:00.000Z"
  }
}
```

#### `GET /groups`
Returns all groups where the authenticated user is a member.
- **Headers**: `Authorization: Bearer <token>`
- **Returns (200)**:
```json
{
  "success": true,
  "groups": [
    {
      "_id": "66123abc456def7890123456",
      "name": "Crawford Market Circle",
      "type": "market",
      "ownerId": "66123abc456def7890123000",
      "role": "owner"
    }
  ]
}
```

#### `POST /groups/join`
Join a group using an invite code. Role is set to `member`.
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**:
```json
{
  "inviteCode": "CRAWF882"
}
```
- **Returns (200)**:
```json
{
  "success": true,
  "membership": {
    "_id": "66123abc456def7890123777",
    "groupId": "66123abc456def7890123456",
    "merchantId": "66123abc456def7890123001",
    "role": "member",
    "joinedAt": "2026-10-16T12:05:00.000Z"
  }
}
```

#### `GET /groups/:id/members`
List members in the group with pagination, sorting, and filtering.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Query Parameters (Optional)**:
  - `page`: Page number (default: 1)
  - `limit`: Members per page (default: 20, max: 100)
  - `role`: Filter by membership role (`owner`, `admin`, or `member`)
  - `q`: Search string matching merchant name or email (case-insensitive substring)
  - `sortBy`: Field to sort by (`joinedAt`, `role`, default: `joinedAt`)
  - `sortOrder`: `asc` or `desc` (default: `desc`)
- **Returns (200)**:
```json
{
  "success": true,
  "count": 2,
  "total": 2,
  "page": 1,
  "totalPages": 1,
  "members": [
    {
      "merchantId": "66123abc456def7890123000",
      "name": "Wholesale A",
      "email": "wholesale.a@demo.com",
      "role": "owner",
      "joinedAt": "2026-10-16T12:00:00.000Z"
    },
    {
      "merchantId": "66123abc456def7890123001",
      "name": "Vendor B",
      "email": "vendor.b@demo.com",
      "role": "member",
      "joinedAt": "2026-10-16T12:05:00.000Z"
    }
  ]
}
```

#### `PATCH /groups/:id/members/:mid`
Update member's role (admin/owner only).
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Request Body**:
```json
{
  "role": "admin"
}
```
- **Returns (200)**:
```json
{
  "success": true,
  "membership": {
    "merchantId": "66123abc456def7890123001",
    "role": "admin"
  }
}
```

#### `DELETE /groups/:id/members/:mid`
Remove member from group (admin/owner) or leave group (self).
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Returns (200)**:
```json
{
  "success": true,
  "message": "Member removed from group"
}
```

#### `POST /groups/:id/invite-code/rotate`
Rotate group invite code to prevent unauthorized joins.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Returns (200)**:
```json
{
  "success": true,
  "inviteCode": "NEW8CODE"
}
```

---

### 7.5 Debts v2 Endpoints (`/api/debts`)

#### `GET /debts?scope=mine|all&status=&page=&limit=&sort=&q=`
Fetch debts in the current tenant group with sorting, filtering, and pagination.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Query Params**:
  - `scope`: `mine` (default for members) | `all` (admin/owner only)
  - `status`: `active` | `pending` | `settled` | `disputed` | `cancelled` | `overdue`
  - `q`: Search merchant name or invoice note
  - `sort`: Field and direction (e.g. `createdAt:desc`, `amount:asc`, `dueDate:asc`)
  - `page`: Page number (default 1)
  - `limit`: Page size (default 20, max 100)
- **Role Rules**: `all` is admin-only; `member` can only query `scope=mine`.
- **Returns (200)**:
```json
{
  "success": true,
  "count": 1,
  "total": 1,
  "page": 1,
  "totalPages": 1,
  "debts": [
    {
      "_id": "66123abc456def7890123888",
      "groupId": "66123abc456def7890123456",
      "debtorId": "66123abc456def7890123001",
      "creditorId": "66123abc456def7890123000",
      "amount": 7500,
      "originalAmount": 10000,
      "status": "active",
      "dueDate": "2026-11-01T00:00:00.000Z",
      "note": "Produce delivery invoice #402",
      "version": 1,
      "createdAt": "2026-10-16T12:10:00.000Z",
      "updatedAt": "2026-10-16T12:20:00.000Z"
    }
  ]
}
```

#### `GET /debts/:id`
Click-through single transaction detail returning debt, payment timeline, and audit log.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Role Rules**: Caller must be a party to the debt (debtor or creditor) or a group admin/owner.
- **Returns (200) `DebtDetailResponse`**:
```json
{
  "success": true,
  "debt": {
    "_id": "66123abc456def7890123888",
    "groupId": "66123abc456def7890123456",
    "debtorId": "66123abc456def7890123001",
    "creditorId": "66123abc456def7890123000",
    "amount": 7500,
    "originalAmount": 10000,
    "status": "active",
    "dueDate": "2026-11-01T00:00:00.000Z",
    "note": "Produce delivery invoice #402",
    "version": 1
  },
  "payments": [
    {
      "_id": "66123abc456def7890123999",
      "groupId": "66123abc456def7890123456",
      "debtId": "66123abc456def7890123888",
      "amount": 2500,
      "kind": "partial",
      "recordedBy": "66123abc456def7890123001",
      "note": "UPI transfer ref #239482",
      "createdAt": "2026-10-16T12:20:00.000Z"
    }
  ],
  "audit": [
    {
      "_id": "66123abc456def7890123444",
      "groupId": "66123abc456def7890123456",
      "actorId": "66123abc456def7890123001",
      "action": "PAYMENT_RECORDED",
      "entityType": "Debt",
      "entityId": "66123abc456def7890123888",
      "meta": { "amount": 2500, "remaining": 7500 },
      "createdAt": "2026-10-16T12:20:00.000Z"
    }
  ]
}
```

#### `POST /debts`
Creates a new debt in `pending` status awaiting counterparty confirmation.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Request Body**:
```json
{
  "debtorId": "66123abc456def7890123001",
  "creditorId": "66123abc456def7890123000",
  "amount": 10000,
  "dueDate": "2026-11-01T00:00:00.000Z",
  "note": "Produce delivery invoice #402"
}
```
- **Returns (201)**:
```json
{
  "success": true,
  "debt": {
    "_id": "66123abc456def7890123888",
    "groupId": "66123abc456def7890123456",
    "debtorId": "66123abc456def7890123001",
    "creditorId": "66123abc456def7890123000",
    "amount": 10000,
    "originalAmount": 10000,
    "status": "pending",
    "version": 0
  }
}
```

#### `POST /debts/:id/confirm`
Counterparty confirms pending debt, transitioning it to `active`.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Returns (200)**:
```json
{
  "success": true,
  "debt": {
    "_id": "66123abc456def7890123888",
    "status": "active",
    "confirmedBy": "66123abc456def7890123001",
    "version": 1
  }
}
```

#### `POST /debts/:id/reject`
Counterparty rejects pending debt request.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Returns (200)**:
```json
{
  "success": true,
  "message": "Debt request rejected"
}
```

#### `POST /debts/:id/dispute`
Flags an active debt as `disputed`.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Request Body**:
```json
{
  "reason": "Damaged goods in delivery"
}
```
- **Returns (200)**:
```json
{
  "success": true,
  "debt": {
    "_id": "66123abc456def7890123888",
    "status": "disputed",
    "version": 2
  }
}
```

---

### 7.6 Payment Ledger Endpoints (`/api/debts/:id/payments`)

#### `POST /debts/:id/payments`
Records a partial or settlement payment against an active debt using CAS optimistic locking.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Request Body**:
```json
{
  "amount": 2500,
  "expectedVersion": 1,
  "kind": "partial",
  "note": "UPI payment #992812",
  "idempotencyKey": "idemp-992812-uuid"
}
```
- **Returns (201 / 200 on Idempotent Replay)**:
```json
{
  "success": true,
  "payment": {
    "_id": "66123abc456def7890123999",
    "groupId": "66123abc456def7890123456",
    "debtId": "66123abc456def7890123888",
    "amount": 2500,
    "kind": "partial",
    "recordedBy": "66123abc456def7890123001",
    "note": "UPI payment #992812",
    "createdAt": "2026-10-16T12:20:00.000Z"
  },
  "debt": {
    "_id": "66123abc456def7890123888",
    "amount": 7500,
    "status": "active",
    "version": 2
  }
}
```
- **Errors**:
  - `409 Conflict`: `CONCURRENT_MODIFICATION` if `expectedVersion` does not match the stored version.

#### `GET /debts/export.csv`
Streams a CSV file of debts within the active tenant group.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Query Params**:
  - `status`: Filter by status (`active`, `pending`, `settled`, `disputed`, `cancelled`, or `all`)
  - `scope`: `mine` (default for members) | `all` (admin/owner only)
- **Response**: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="debts-<groupId>-<timestamp>.csv"`
- **Columns**: `id,debtorId,debtorName,debtorEmail,creditorId,creditorName,creditorEmail,amount,remainingAmount,status,dueDate,note,createdAt`
- **Streaming & Escaping**: Streamed using Mongoose cursor and escaped per RFC 4180.

#### `POST /debts/import`
Imports debts in bulk from a CSV file (admin/owner only).
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Content-Type**: `multipart/form-data` (field: `csvFile`), `text/csv`, or `application/json` (`{ "csvText": "..." }`)
- **Query Params**:
  - `dryRun`: `true` to validate rows and return errors without persisting changes (default: `false`)
- **Validation**: Per-row validation with Zod. Required columns: `debtorId` (or `debtorEmail`), `creditorId` (or `creditorEmail`), `amount`. Both counterparties must be members of the active group.
- **Behavior**:
  - When `dryRun=true`: returns total rows, valid rows, error counts, preview rows, and detailed per-row error diagnostics.
  - When `dryRun=false`: inserts validated debts in `active` status, audits each creation, and emits realtime socket notifications.
- **Returns (200 on dry-run, 201 on import)**:
```json
{
  "success": true,
  "dryRun": false,
  "totalRows": 25,
  "validRows": 25,
  "errorCount": 0,
  "importedCount": 25,
  "debts": [ ... ]
}
```

---

### 7.7 Audit Log Endpoints (`/api/audit`)

#### `GET /audit?entityId=&entityType=&action=&actorId=&from=&to=&q=&page=&limit=&sort=`
Retrieves tenant-isolated audit log entries with comprehensive filtering.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Query Params**:
  - `entityId`: Filter events for a specific resource ID
  - `entityType`: Filter events by type (`Debt`, `Payment`, `Settlement`, `RiskAssessment`)
  - `action`: Filter by action (e.g. `DEBT_CREATED`, `PAYMENT_RECORDED`, `DEBTS_IMPORTED_CSV`)
  - `actorId`: Filter by merchant ID who performed the action
  - `from` / `to`: ISO date strings filtering event creation timestamp
  - `q`: Search string matching action or metadata content
  - `sort`: Field and direction (default: `createdAt:desc`)
  - `page`: Page number (default: 1)
  - `limit`: Page limit (default: 20, max: 100)
- **Role Rules**: `admin` / `owner` sees all group audit logs; `member` sees logs where they are the actor or entity party.
- **Returns (200)**:
```json
{
  "success": true,
  "count": 1,
  "total": 1,
  "page": 1,
  "totalPages": 1,
  "audit": [
    {
      "_id": "66123abc456def7890123444",
      "groupId": "66123abc456def7890123456",
      "actorId": "66123abc456def7890123001",
      "action": "PAYMENT_RECORDED",
      "entityType": "Debt",
      "entityId": "66123abc456def7890123888",
      "meta": {
        "amount": 2500,
        "remaining": 7500
      },
      "createdAt": "2026-10-16T12:20:00.000Z"
    }
  ]
}
```

---

## 8. Risk, Notifications & Realtime (v2 contract)

### 8.1 Risk Endpoints (`/api/risk`)

#### `GET /risk/group`
Fetches group-wide aggregate risk analytics, average portfolio default rate, and all merchant risk assessments within the tenant group.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Returns (200)**:
```json
{
  "success": true,
  "groupRisk": {
    "averageRiskScore": 0.185,
    "totalMerchants": 4,
    "highRiskCount": 1,
    "assessments": [
      {
        "merchantId": "66123abc456def7890123001",
        "lambda": 0.25,
        "zScore": 2.15,
        "pValue": 0.0157,
        "correlation": 0.62,
        "riskScore": 0.221,
        "riskLabel": "MEDIUM",
        "computedAt": "2026-10-17T12:00:00.000Z"
      },
      {
        "merchantId": "66123abc456def7890123002",
        "lambda": 0.75,
        "zScore": 3.84,
        "pValue": 0.0001,
        "correlation": 0.81,
        "riskScore": 0.527,
        "riskLabel": "HIGH",
        "computedAt": "2026-10-17T12:00:00.000Z"
      }
    ]
  }
}
```

#### `GET /risk/merchant/:id`
Fetches the detailed risk profile for a specific merchant in the group, including Poisson $\lambda$, hypothesis test $z$-score, $p$-value, and delay-amount correlation.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Returns (200)**:
```json
{
  "success": true,
  "assessment": {
    "merchantId": "66123abc456def7890123001",
    "lambda": 0.25,
    "zScore": 2.15,
    "pValue": 0.0157,
    "correlation": 0.62,
    "riskScore": 0.221,
    "riskLabel": "MEDIUM",
    "computedAt": "2026-10-17T12:00:00.000Z"
  }
}
```

#### `POST /risk/recompute`
Triggers full group-wide recomputation of risk scores across all merchants using historical ledger events.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Returns (200)**:
```json
{
  "success": true,
  "recomputedCount": 4,
  "groupRisk": {
    "averageRiskScore": 0.185,
    "totalMerchants": 4,
    "highRiskCount": 1,
    "assessments": []
  }
}
```

#### `POST /risk/contagion`
Simulates systemic network default shock if a target merchant defaults, returning cascade levels and per-merchant financial loss.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Request Body**:
```json
{
  "merchantId": "66123abc456def7890123001",
  "lossGivenDefault": 1.0,
  "maxRounds": 5
}
```
- **Returns (200)**:
```json
{
  "success": true,
  "contagion": {
    "source": "66123abc456def7890123001",
    "totalLoss": 15000,
    "perMerchantLoss": {
      "66123abc456def7890123002": 10000,
      "66123abc456def7890123003": 5000
    },
    "levels": [
      ["66123abc456def7890123001"],
      ["66123abc456def7890123002"],
      ["66123abc456def7890123003"]
    ]
  }
}
```

---

### 8.2 Notification Endpoints (`/api/notifications`)

#### `GET /notifications`
Retrieves tenant-isolated notifications for the authenticated merchant.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Query Params (Optional)**: `?unreadOnly=true&page=1&limit=20`
- **Returns (200)**:
```json
{
  "success": true,
  "count": 2,
  "unreadCount": 1,
  "notifications": [
    {
      "id": "66123abc456def7890123555",
      "type": "risk:flagged",
      "message": "Merchant Apex Supplies marked HIGH risk (score: 0.527)",
      "refType": "RiskAssessment",
      "refId": "66123abc456def7890123002",
      "readAt": null,
      "createdAt": "2026-10-17T12:05:00.000Z"
    },
    {
      "id": "66123abc456def7890123556",
      "type": "debt:confirmed",
      "message": "Debt #888 confirmed by counterparty",
      "refType": "Debt",
      "refId": "66123abc456def7890123888",
      "readAt": "2026-10-17T12:10:00.000Z",
      "createdAt": "2026-10-17T12:02:00.000Z"
    }
  ]
}
```

#### `PATCH /notifications/:id/read`
Marks a specific notification as read.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Returns (200)**:
```json
{
  "success": true,
  "notification": {
    "id": "66123abc456def7890123555",
    "type": "risk:flagged",
    "message": "Merchant Apex Supplies marked HIGH risk (score: 0.527)",
    "refType": "RiskAssessment",
    "refId": "66123abc456def7890123002",
    "readAt": "2026-10-17T12:15:00.000Z",
    "createdAt": "2026-10-17T12:05:00.000Z"
  }
}
```

#### `POST /notifications/read-all`
Marks all notifications in the tenant group for the authenticated merchant as read.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Returns (200)**:
```json
{
  "success": true,
  "markedCount": 3
}
```

---

### 8.3 Health & Diagnostic Endpoints (`/health` & `/api/health`)

#### `GET /health` or `GET /api/health`
Basic liveness probe returning server status and uptime.
- **Returns (200)**: `{ "status": "ok", "uptime": 124.5 }`

#### `GET /health/deep` or `GET /api/health/deep`
Deep readiness probe inspecting both the local MongoDB connection state and reachability of the Python computational engine (`http://localhost:8000/health`).
- **Headers**: No authentication required.
- **Returns (200 OK / 200 Degraded / 503 Unhealthy)**:
```json
{
  "status": "ok",
  "timestamp": "2026-10-20T12:00:00.000Z",
  "uptime": 124.5,
  "services": {
    "mongodb": {
      "status": "connected",
      "readyState": 1
    },
    "pythonEngine": {
      "status": "reachable",
      "url": "http://localhost:8000/health",
      "responseTimeMs": 14
    }
  }
}
```
- **Status Determination**:
  - `status: "ok"` (HTTP 200) if both MongoDB and Python engine are healthy.
  - `status: "degraded"` (HTTP 200) if MongoDB is connected but Python engine is unreachable (e.g. background engine offline).
  - `status: "unhealthy"` (HTTP 503) if MongoDB is disconnected or connecting.

---

### 8.4 Realtime Socket Architecture & AIMD Throttling

#### Socket Handshake & Room Subscriptions
Client connects to Socket.IO with credentials in the handshake authentication block:
```typescript
const socket = io("http://localhost:4000", {
  auth: {
    token: "<JWT_BEARER_TOKEN>"
  }
});
```
- **Authentication**: Verified on server via `socket.handshake.auth.token`. Invalid or expired tokens are rejected immediately.
- **Auto-joined Rooms**:
  - `group:<id>` — Automatically joined for each group the authenticated merchant belongs to. All group broadcasts (`debt:*`, `settlement:*`, `risk:flagged`, `cycle:netted`, `batch:update`) are scoped to this room.
  - `merchant:<id>` — Private room joined for the merchant's own identity. Receives private messages (`notification:new`, direct mentions, and individual debt updates).

#### AIMD (Additive Increase / Multiplicative Decrease) Flow Control
To protect browser performance against event cascades and network bursts:
- **Window Initialization**: Connection starts with `windowSize = 10` messages.
- **Additive Increase**: On client acknowledgment (`ack`), increment window size by 1 (`+1`), up to a maximum cap of `50`.
- **Multiplicative Decrease**: On acknowledgment timeout or backpressure, halve the window size (`windowSize = max(1, Math.floor(windowSize / 2))`).
- **Floor**: Window size never drops below `1`.
- **Cap**: Window size is bounded at `50`.
- **Flush Interval**: Pending event queue flushes every `200ms` as a bundled `batch:update` payload.
- **Ack Timeout**: Client has `500ms` to acknowledge receipt of batches before timeout occurs and triggers multiplicative decrease.
- **Heartbeat & Liveness**: Server periodically issues `presence:ping` `{ timestamp }`, client immediately answers with `presence:ack` `{ timestamp, clientTime }`.

#### Socket Event Map & Payloads

| Event Name | Scope / Room | Direction | Payload Shape | Description |
| :--- | :--- | :--- | :--- | :--- |
| `debt:created` | `group:<id>` | Server -> Client | `{ debt: Debt }` | New debt added to ledger |
| `debt:updated` | `group:<id>` | Server -> Client | `{ debt: Debt }` | Debt amount or status changed |
| `debt:settled` | `group:<id>` | Server -> Client | `{ debtId: string }` | Specific debt settled |
| `debt:disputed` | `group:<id>` | Server -> Client | `{ debtId: string, reason?: string }` | Debt disputed by debtor |
| `debt:confirmed` | `group:<id>` | Server -> Client | `{ debt: Debt }` | Debt confirmed by counterparty |
| `debt:rejected` | `group:<id>` | Server -> Client | `{ debtId: string }` | Debt rejected by counterparty |
| `debt:payment` | `group:<id>` | Server -> Client | `{ debt: Debt, payment: Payment }` | Payment recorded against debt |
| `settlement:batch_created` | `group:<id>` | Server -> Client | `{ batchId: string, settlement: SettlementResponse }` | Settlement proposal generated |
| `settlement:batch_confirmed` | `group:<id>` | Server -> Client | `{ batchId: string }` | Settlement batch finalized |
| `settlement:cycle_netted` | `group:<id>` | Server -> Client | `{ cycle: string[], amountNetted: number }` | Individual cycle netted |
| `risk:flagged` | `group:<id>` | Server -> Client | `{ merchantId: string, riskScore: number, riskLabel: string, reason?: string, timestamp?: string }` | Merchant transitioned to high/critical risk |
| `cycle:netted` | `group:<id>` | Server -> Client | `{ cycle: string[], amountNetted: number, remainingDebts?: DebtEdge[] }` | Pre-netting cycle cleared from network |
| `batch:update` | `group:<id>` | Server -> Client | `{ events: Array<{ type: string, payload: any, timestamp: number }>, batchSeq?: number }` | AIMD-throttled batch coalescing events |
| `presence:ping` | Direct | Server -> Client | `{ timestamp: number, serverTime?: string }` | Liveness check |
| `presence:ack` | Direct | Client -> Server | `{ timestamp: number, clientTime?: string }` | Liveness ack |
| `notification:new` | `merchant:<id>` | Server -> Client | `{ notification: Notification }` | Realtime notification delivered to recipient |

---

## 8. Phase 1: Risk Data Foundation & Statistical Engine (Slice C)

### 8.1 Statistical Endpoints (Python Service / Risk Router)

#### `POST /risk/ztest`
Performs a one-proportion hypothesis test evaluating whether a merchant's rate of adverse payment events is statistically significantly elevated relative to the baseline network delinquency rate.
- **Request Body**:
  ```json
  {
    "merchant_id": "merchant_123",
    "successes": 15,
    "trials": 40,
    "baseline_p": 0.05,
    "alpha": 0.05,
    "avg_delay_days": 14.5
  }
  ```
- **Response Shape**:
  ```json
  {
    "merchant_id": "merchant_123",
    "observed_p": 0.375,
    "baseline_p": 0.05,
    "z_score": 9.428,
    "p_value": 0.00001,
    "p_value_two_tailed": 0.00002,
    "is_significant": true,
    "sample_size": 40,
    "interpretation": "Observed proportion (0.3750) is significantly greater than baseline (0.0500) at alpha=0.05 (z=9.43, p=0.00001).",
    "composite_risk_score": 0.7412
  }
  ```

#### `POST /risk/correlation`
Calculates the Pearson correlation coefficient ($r$) and 2-tailed significance ($p$-value) with guards against short sample sizes ($n < 3$) and zero-variance series.
- **Request Body (records or series pair)**:
  ```json
  {
    "records": [
      {
        "merchant_id": "m1",
        "avg_delay": 5.2,
        "avg_amount": 12000,
        "frequency": 8,
        "late_rate": 0.12
      }
    ]
  }
  ```
  *or:*
  ```json
  {
    "series_a": [1.0, 2.0, 3.0, 4.0, 5.0],
    "series_b": [2.0, 4.0, 6.0, 8.0, 10.0]
  }
  ```
- **Response Shape**:
  ```json
  {
    "delay_vs_amount": {
      "r": 0.852,
      "p_value": 0.0012,
      "significant": true,
      "sample_size": 15,
      "interpretation": "Strong positive correlation"
    },
    "frequency_vs_late_rate": {
      "r": -0.421,
      "p_value": 0.104,
      "significant": false,
      "sample_size": 15,
      "interpretation": "Moderate negative correlation"
    },
    "custom_pair": null,
    "sample_size": 15
  }
  ```

#### Extended `POST /risk/score` (Backwards Compatible)
Existing Poisson calculation responses are enhanced with additive stats fields:
- `z_score?: float` — Standardized deviation relative to network prior rate.
- `p_value?: float` — One-tailed statistical significance.
- `risk_label?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN'` — Composite severity classification:
  - `LOW`: score < 0.33
  - `MEDIUM`: 0.33 ≤ score < 0.66
  - `HIGH`: 0.66 ≤ score ≤ 0.85
  - `CRITICAL`: score > 0.85
  - `UNKNOWN`: insufficient or uninitialized data
- `composite_score?: float` — Blended score: $0.4 \times \text{norm}(\lambda) + 0.4 \times (1 - p) + 0.2 \times \text{norm}(\text{delay})$.

### 8.2 Backend Persistence Models (MongoDB / Mongoose)

#### `PaymentEvent`
Tracks historical transaction timeliness for default probability and empirical hypothesis testing:
- **Schema**:
  - `groupId: string` (required)
  - `merchantId: string` (required)
  - `debtId: string` (required)
  - `dueDate: Date` (required)
  - `paidDate?: Date` (optional)
  - `wasLate: boolean` (default: false)
  - `delayDays: number` (default: 0)
- **Index**: `{ merchantId: 1, dueDate: -1 }`

#### `Notification`
In-app merchant notification queue:
- **Schema**:
  - `groupId: string` (required)
  - `merchantId: string` (required)
  - `type: 'SETTLEMENT_PROPOSED' | 'CYCLE_DETECTED' | 'RISK_ALERT' | 'DEBT_DISPUTED' | 'PAYMENT_RECEIVED' | 'SYSTEM'`
  - `message: string` (required)
  - `refType?: 'DEBT' | 'SETTLEMENT' | 'MERCHANT' | 'GROUP'`
  - `refId?: string`
  - `readAt?: Date` (default: null)
  - `createdAt: Date` (default: Date.now)
- **Index**: `{ merchantId: 1, readAt: 1, createdAt: -1 }`

### 8.3 Mock Adapter Domain Delegation
Frontend runtime toggling via `VITE_MOCK_DOMAINS` env var:
- `all` (default) — routes all domains to in-memory seed stores (`client/src/api/mock/`).
- `none` — delegates all domains to real backend endpoints (`client/src/api/real.ts`).
- Comma-separated list (e.g. `risk,notifications`) — mocks only specified domains while routing remainder to real axios client.



