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
- **Mechanism**: Validates the SHA-256 token hash against active sessions. On success, revokes the current session and issues a new `accessToken` and `refreshToken` within the same `familyId`.
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

### `PATCH /groups/:id/domain`
Sets or updates the tax domain for a group. Allowed only when the group's current domain is `'none'` and the group has zero existing debts. Requires `admin` or `owner` role.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <groupId>`
- **Body**: `{ "domain": "gst" | "income" | "customs" | "property" | "vehicle" }`
- **Returns**: `{ success: true, group: { _id, name, type, domain, ownerId, inviteCode, createdAt } }`
- **Errors**: `409 DOMAIN_LOCKED` if the group already has debts or domain is already set; `403 FORBIDDEN_GROUP` for regular members; `400 VALIDATION` on invalid domain.
- **Audit & Realtime**: Logs `GROUP_DOMAIN_UPDATED` audit entry; emits `group:updated` socket event to `group:<id>`.

---

## 1.2 Tenancy Header Requirement (`X-Group-Id`)
The following routes enforce strict tenant scoping via `requireGroup` middleware:
- `/api/debts` (listing, creation, updates)
- `/api/tax` (domains, rules, preview, summary)
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
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <groupId>`
- **Body (Legacy Group - domain: 'none')**:
  `{ "debtorId": "<mongo_id>", "creditorId": "<mongo_id>", "amount": 1500, "dueDate"?: string, "note"?: string }`
  - In a group with domain `'none'`, client sends `amount`. `baseAmount` equals `amount`, `taxAmount` is 0.
  - Sending tax fields (`taxType`, `taxInputs`) to a `'none'` group returns `400 DOMAIN_REQUIRED`.
- **Body (Tax Group - domain: 'gst' | 'income' | 'customs' | 'property' | 'vehicle')**:
  `{ "debtorId": "<mongo_id>", "creditorId": "<mongo_id>", "baseAmount": 10000, "taxType": "gst.intra", "taxInputs"?: { "gstRate": 18 }, "dueDate"?: string, "note"?: string }`
  - In a tax group, `baseAmount` and `taxType` are required. The server IGNORES any client-provided `amount` and computes payable as `round2(baseAmount ± taxAmount)`.
  - Automatically calculates and stores `baseAmount`, `taxType`, `taxEffect`, `taxAmount`, `taxRate`, `taxBreakup`, `taxInputs`, `taxRuleVersion`, and sets `amount` and `originalAmount` to `payable`.
  - Audit log metadata and `debt:created` socket payload include full tax calculation metadata.
- **Returns**: `{ success: true, debt: { _id, groupId, debtorId, creditorId, amount, originalAmount, baseAmount, taxType, taxEffect, taxAmount, taxRate, taxBreakup, taxInputs, taxRuleVersion, status: 'pending', ... } }`
- **Errors**: `400 INVALID_TAX_TYPE`, `400 DOMAIN_REQUIRED`, `400 VALIDATION`.

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

## 9. Tax Calculation Engine (`/api/tax`)
Tenancy-scoped tax calculation, official Indian and Maharashtra state rate slabs (as of October 2026), and transaction previews.
All tax endpoints require authentication and an active `X-Group-Id` header.

### `GET /tax/domains`
Returns all available tax domains with labels and descriptions.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <groupId>`
- **Returns (200)**:
```json
[
  { "key": "income", "label": "Income Tax (TDS)", "description": "Tax Deducted at Source under Income-tax Act 2025 on contracts, professional fees and brokerage." },
  { "key": "gst", "label": "Goods & Services Tax (GST)", "description": "Intra-state (CGST + SGST) and inter-state (IGST) standard tax slabs (0%, 5%, 18%, 40%)." },
  { "key": "customs", "label": "Customs (Import & Export)", "description": "Customs duty on imports (BCD + SWS + IGST) and export tariff lines with zero-rated IGST." },
  { "key": "property", "label": "Property & Stamp Duty", "description": "Maharashtra Stamp Duty (Mumbai & rest of MH with woman buyer concession) and capped registration fee." },
  { "key": "vehicle", "label": "Motor Vehicle Tax", "description": "Maharashtra one-time road tax slabs across Petrol, Diesel, CNG, EV (exempt) and corporate registrations." }
]
```

### `GET /tax/rules`
Fetches official tax type definitions, legal references, and input schemas for a tax domain. Defaults to the active group's domain if `domain` query parameter is omitted.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <groupId>`
- **Query Params (Optional)**: `?domain=gst|income|customs|property|vehicle`
- **Returns (200)**:
```json
{
  "domain": "gst",
  "ruleVersion": "FY2026-27",
  "types": [
    {
      "key": "gst.intra",
      "label": "Intra-State GST (CGST + SGST)",
      "effect": "add",
      "note": "Tax split equally into Central GST (rate/2) and State GST (rate/2).",
      "legalRef": "CGST/SGST Acts; GST Council 56th meeting, rates from 22 Sep 2025 (5%, 18%, 40% and nil)",
      "inputs": [
        {
          "name": "gstRate",
          "label": "GST Slab Rate (%)",
          "type": "select",
          "options": [0, 5, 18, 40],
          "default": 18
        }
      ]
    }
  ]
}
```

### `POST /tax/preview`
Computes exact tax, component breakup, and final payable amount without database modification. Uses the active group's domain.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <groupId>`
- **Body**:
```json
{
  "taxType": "gst.intra",
  "baseAmount": 10000,
  "taxInputs": { "gstRate": 18 }
}
```
- **Returns (200)**:
```json
{
  "baseAmount": 10000,
  "taxAmount": 1800,
  "effect": "add",
  "payable": 11800,
  "taxRate": 18,
  "breakup": [
    { "label": "CGST", "rate": 9, "amount": 900 },
    { "label": "SGST", "rate": 9, "amount": 900 }
  ],
  "legalRef": "CGST/SGST Acts; GST Council 56th meeting, rates from 22 Sep 2025 (5%, 18%, 40% and nil)",
  "ruleVersion": "FY2026-27"
}
```
- **Errors**: `400 INVALID_TAX_TYPE` if taxType is invalid for active group's domain; `400 VALIDATION` on invalid inputs or negative baseAmount; `403 FORBIDDEN_GROUP` for outsiders.

### `GET /tax/summary`
Aggregates tax totals grouped by taxType and grand totals across the tenancy.
- **Headers**: `Authorization: Bearer <token>`, `X-Group-Id: <groupId>`
- **Permissions**:
  - `admin` / `owner`: Whole group aggregate across all non-cancelled tax debts.
  - `member`: Scoped only to debts where caller is either debtor or creditor.
- **Returns (200)**:
```json
{
  "domain": "gst",
  "totals": [
    {
      "taxType": "gst.intra",
      "label": "Intra-State GST (CGST + SGST)",
      "count": 1,
      "baseTotal": 10000,
      "taxTotal": 1800,
      "effect": "add"
    }
  ],
  "grandBase": 10000,
  "grandTax": 1800,
  "grandPayable": 11800
}
```


---

### 9.1 Supported Tax Domains & Statutory Rules Table (`FY2026-27`)

| Domain | Tax Type Key | Effect | Inputs | Statutory Reference & Rates |
|---|---|---|---|---|
| `income` | `income.tds_contractor_individual` | `deduct` | None | Income-tax Act 2025, s.393 (194C) — 1% deduction on individual/HUF contractors. |
| `income` | `income.tds_contractor_other` | `deduct` | None | Income-tax Act 2025, s.393 (194C) — 2% deduction on corporate/other contractors. |
| `income` | `income.tds_professional` | `deduct` | None | Income-tax Act 2025, s.393 (194J) — 10% deduction on professional fees. |
| `income` | `income.tds_commission` | `deduct` | None | Income-tax Act 2025, s.393 (194H) — 2% deduction on commission/brokerage. |
| `gst` | `gst.intra` | `add` | `gstRate`: [0, 5, 18, 40] | CGST Act / SGST Act — split equally into CGST (rate/2) and SGST (rate/2). |
| `gst` | `gst.inter` | `add` | `gstRate`: [0, 5, 18, 40] | IGST Act — 100% Integrated GST. |
| `customs` | `customs.import` | `add` | `bcdRate`: [0, 5, 7.5, 10, 15, 20], `igstRate`: [0, 5, 18, 40] | Customs Tariff Act 1975 & Finance Act 2018: BCD + SWS (10% of BCD) + IGST on (base + BCD + SWS). |
| `customs` | `customs.export` | `add` | `exportDutyRate`: [0, 5, 10, 15, 20] | Customs Tariff Act — export duty applied to base; export supplies are zero-rated for IGST (0%). |
| `property` | `property.stamp_mumbai` | `add` | `womanBuyer`: boolean | Maharashtra Stamp Act (Mumbai City & Suburban) — 6% (5% duty + 1% metro cess); 5% if woman purchaser. |
| `property` | `property.stamp_other_mh` | `add` | `womanBuyer`: boolean | Maharashtra Stamp Act (Rest of Maharashtra) — 7% (includes metro cess & LBT); 6% if woman purchaser. |
| `property` | `property.registration` | `add` | None | Maharashtra Registration Rules — 1% of agreement value capped at ₹30,000 max. |
| `vehicle` | `vehicle.petrol` | `add` | None | Maharashtra Motor Vehicles Tax Act 1958 — One-time tax: ≤10L: 11%, 10L-20L: 12%, >20L: 13%. |
| `vehicle` | `vehicle.diesel` | `add` | None | Maharashtra Motor Vehicles Tax Act 1958 — One-time tax: ≤10L: 13%, 10L-20L: 14%, >20L: 15%. |
| `vehicle` | `vehicle.cng` | `add` | None | Maharashtra Motor Vehicles Tax Act 1958 — One-time tax: ≤10L: 12%, 10L-20L: 13%, >20L: 14%. |
| `vehicle` | `vehicle.ev` | `add` | None | Maharashtra EV Policy — 0% road tax (Exempt). |
| `vehicle` | `vehicle.company_or_import` | `add` | None | Maharashtra Motor Vehicles Tax Act 1958 — Flat 20% on company-registered or imported vehicles. |

---

### 9.2 Simplification Note & Arithmetic Precision
1. **Half-Up Rounding to Two Decimals**: Every tax component amount is rounded to two decimal places using standard half-up arithmetic (`round2 = Math.round((n + EPSILON) * 100) / 100`) before summation or deduction.
2. **Statutory Calculation Formula**:
   - For `taxEffect = 'add'`: amount = round2(baseAmount + taxAmount)
   - For `taxEffect = 'deduct'`: amount = round2(baseAmount - taxAmount)
3. **Payable Amount Invariant**: Existing graph traversal, Warshall transitive closure, cycle detection, cash settlement, and risk assessment engines continue to operate strictly on the payable `amount`. The tax module is purely additive and encapsulates tax metadata without altering clearing logic.

---

### 9.3 How to Add a New Tax Type (Developer Guide)
To introduce a new statutory tax type:
1. **Define Schema & Rule in `apps/server/src/tax/rules.ts`**:
   Add an entry into `TAX_RULES` with:
   - `domain`: One of `'income' | 'gst' | 'customs' | 'property' | 'vehicle'`.
   - `key`: Namespaced identifier (e.g. `gst.composition`).
   - `effect`: `'add'` or `'deduct'`.
   - `inputs`: Array of input definitions (`select`, `number`, or `boolean`).
   - `compute`: Pure computation function returning `{ taxAmount, taxRate, breakup }`.
2. **Sync Frontend Definitions in `client/src/tax/rules.ts`**:
   Mirror the rule definition in the client package for optimistic client-side calculations and previews.
3. **Write Hand-Computed Test Vectors**:
   Add test vectors to `apps/server/tests/tax.test.ts` and `client/src/tax/__tests__/taxRules.test.ts` asserting exact penny precision.

---

### 9.4 Academic Course Concepts Mapping

- **DBMS (Database Management Systems)**:
  - **Schema Evolution & Normalization**: Additive migration adding `baseAmount`, `taxType`, `taxAmount`, `taxEffect`, `taxRate`, `taxBreakup`, and `taxRuleVersion` to debts without breaking existing rows.
  - **Performance Indexing**: Compound index `DebtSchema.index({ groupId: 1, taxType: 1, status: 1 })` optimizes tenant-isolated statutory aggregations and excludes settled/cancelled records.
  - **Optimistic Concurrency Control (OCC)**: `casUpdate` enforces CAS version increments on debt mutations and prevents concurrent partial payment conflicts or double edits.
- **DAA (Design & Analysis of Algorithms)**:
  - **O(1) Pure Tax Calculation**: Tax calculations run in constant time O(1) per debt transaction.
  - **Invariant Graph Algorithms**: Graph cycles, Warshall reachability matrix, and greedy bipartite debt minimization algorithms operate directly on payable balances (net sum = 0), maintaining theoretical complexity guarantees.
- **SE (Software Engineering)**:
  - **Additive Interface Contracts**: Legacy groups (`domain: 'none'`) operate identically without breaking backward compatibility.
  - **Strict Multi-Tenant Isolation**: Circle-scoped domain locking (`409 DOMAIN_LOCKED`) prevents cross-domain contamination and ensures statutory compliance.
