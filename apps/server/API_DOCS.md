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
Fetches the currently authenticated merchant's details.
- **Returns**: `{ success: true, merchant }`

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
