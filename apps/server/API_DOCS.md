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

---

## 1.1 Tenant Groups (`/api/groups`)
Tenant coalitions provide strict data isolation for debts, risk, and settlements.
Scoped requests must pass the `X-Group-Id: <groupId>` header.

### `POST /groups`
Creates a new tenant group. The creator is automatically assigned the `owner` role.
- **Body**: `{ "name": "Crawford Market Circle", "type": "market" | "supply_chain" | "friends" | "other" }`
- **Returns**: `{ success: true, group: { _id, name, type, ownerId, inviteCode, createdAt } }`

### `GET /groups`
Lists all groups where the authenticated merchant is a member, including their role.
- **Returns**: `{ success: true, count: number, groups: [{ _id, name, type, ownerId, inviteCode, createdAt, role }] }`

### `POST /groups/join`
Joins a group using an alphanumeric invite code.
- **Body**: `{ "inviteCode": "CRAWFORD2026" }`
- **Returns**: `{ success: true, membership: { _id, groupId, merchantId, role, joinedAt } }`

### `GET /groups/:id/members`
Fetches all merchants belonging to the group (caller must be a group member).
- **Returns**: `{ success: true, count: number, members: [{ _id, groupId, merchantId: {...}, role, joinedAt }] }`

### `PATCH /groups/:id/members/:merchantId`
Updates a member's role within the group. Requires `admin` or `owner` role.
- **Body**: `{ "role": "admin" | "member" }`
- **Returns**: `{ success: true, membership: {...} }`

### `DELETE /groups/:id/members/:merchantId`
Removes a member from the group. Can be performed by admins/owners, or by a member leaving the group. Group owner cannot leave without transferring ownership.
- **Returns**: `{ success: true, message: "Member removed from group" }`

### `POST /groups/:id/invite-code/rotate`
Generates a new random invite code for the group, invalidating the previous code. Requires `admin` or `owner` role.
- **Returns**: `{ success: true, inviteCode: string }`

---

## 1.2 Tenancy Header Requirement (`X-Group-Id`)
The following routes enforce strict tenant scoping via `requireGroup` middleware:
- `/api/debts` (listing, creation, updates)
- `/api/merchants` (scoping to group members)
- `/api/settlement` (`/`, `/cycles`, `/net-cycle`, `/confirm/:batchId`)
- `/api/risk/group`, `/api/risk/merchant/:id`, `/api/risk/recompute`, `/api/risk/contagion`

If `X-Group-Id` is missing or the merchant is not a member of the group, a `403 FORBIDDEN_GROUP` error is returned.

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
List all members in the group with their roles.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Returns (200)**:
```json
{
  "success": true,
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

#### `GET /debts?scope=mine|all&status=&page=&limit=`
Fetch debts in the current tenant group.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Role Rules**: `all` is admin-only; `member` can only query `scope=mine`.
- **Returns (200)**:
```json
{
  "success": true,
  "count": 1,
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
  "note": "UPI payment #992812"
}
```
- **Returns (201)**:
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

---

### 7.7 Audit Log Endpoints (`/api/audit`)

#### `GET /audit?entityId=&page=&limit=`
Retrieves tenant-isolated audit log entries.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <id>`
- **Role Rules**: `admin` / `owner` sees all group audit logs; `member` sees logs where they are the actor or entity party.
- **Returns (200)**:
```json
{
  "success": true,
  "count": 1,
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

### 8.3 Realtime Socket Architecture & AIMD Throttling

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


