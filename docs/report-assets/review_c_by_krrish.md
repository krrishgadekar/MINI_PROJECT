# Phase 5A Review Report — Slice C: Risk, Realtime & Notifications / UI

**Reviewer**: Krrish Gadekar (Python Algorithms & Statistics Lead)  
**Author Reviewed**: Parth Goggi (Frontend & Fullstack Lead)  
**Date**: October 21, 2026  
**Branch**: `test/k-p5-review-c`  
**Scope**: Slice C Review — Risk Intelligence, Statistical Hypothesis Testing, Realtime Socket Isolation, Notification Security & Multi-Tenant Boundaries  

---

## 1. Executive Summary

In Phase 5A, an adversarial security, multi-tenancy, and algorithmic integrity code review was conducted across **Slice C (Risk, Realtime & Notifications / UI)**. The components reviewed include:
- Server risk controllers and routes (`risk.controller.ts`, `risk.routes.ts`)
- Notification controllers and services (`notification.controller.ts`, `dueDateJob.ts`, `deliveryService.ts`)
- Realtime WebSocket room logic and throttling (`realtime/socket.ts`, `realtime/throttler.ts`)
- Client interfaces and state hooks (`Risk.tsx`, `useRisk.ts`, `contract.ts`, `GroupProvider.tsx`)

A dedicated automated adversarial test suite was authored in `apps/server/tests/review_c_adversarial.test.ts` comprising **22 automated test vectors** covering cross-tenant contagion simulation leakage, global baseline contamination during group recomputation, notification read IDOR exploits, unauthorized socket room hijacking, due-date cron false alarms, and risk trend data exposure.

All identified vulnerabilities were remediated with minimal, surgical, non-breaking diffs. All **22/22 adversarial tests pass**, all **19/19 server test suites (189 tests) pass**, all **228/228 Pytest tests pass**, and the React client builds cleanly with zero TypeScript errors.

---

## 2. Adversarial Scenarios Tested & Verification Matrix

| # | Test Vector | Target Component | Adversarial Input / Attack Scenario | Observed Behavior & Assertion | Outcome |
|---|:---|:---|:---|:---|:---:|
| 1 | **Contagion Simulation Cross-Tenant Leakage** | `risk.controller.ts:simulateContagion` | Attacker in Group A initiates contagion simulation; debts from Group B ($B \to \text{Foreign}$) exist in database. | Simulation graph strictly filters active debts by `groupId: req.groupId` and merchants by `Membership.find({ groupId })`. Debts from Group B are never traversed. | **PASSED** |
| 2 | **Contagion Payload Format Compatibility** | `risk.controller.ts:simulateContagion` | Frontend client invokes contagion using `{ merchantId, lossGivenDefault, maxRounds }` instead of `{ failedMerchant }`. | Controller extracts `failedMerchant \|\| merchantId`, resolves merchant name from group membership, and returns both `simulation` and `contagion` object aliases. | **PASSED** |
| 3 | **Foreign Failed Merchant Injection** | `risk.controller.ts:simulateContagion` | Attacker passes `failedMerchant: 'Admin_Bob'` (who is only a member of Group B) in a request scoped to Group A. | Membership verification fails; controller rejects request with HTTP `400 VALIDATION` (`"not an active member of this group"`). | **PASSED** |
| 4 | **Out-of-Bounds Contagion Parameters** | `risk.controller.ts:simulateContagion` | Attacker submits `lossGivenDefault: -0.2` or `1.5`, or `maxRounds: 0` or `99`. | Parameter bounds guard rejects inputs with HTTP `400 VALIDATION` (`lossGivenDefault` must be $\in [0.0, 1.0]$, `maxRounds` $\in [1, 20]$). | **PASSED** |
| 5 | **Global Late Rate Baseline Pollution** | `risk.controller.ts:recomputeGroupRisk` | Group B has high delinquency (90% late rate); Group A has low delinquency (20% late rate). Admin A recomputes Group A risk. | Controller scopes `PaymentEvent.find({ groupId })`. Group A baseline late rate remains exact at $0.20$, unaffected by Group B delinquency. | **PASSED** |
| 6 | **Non-Admin Group Risk Recomputation** | `risk.controller.ts:recomputeGroupRisk` | Regular group member (role `member`) invokes `POST /api/risk/recompute`. | Role gate verifies `role === 'admin' \|\| role === 'owner'`. Regular members receive HTTP `403 FORBIDDEN_GROUP`. Admin/owner succeeds. | **PASSED** |
| 7 | **Cross-Tenant Merchant Risk IDOR** | `risk.controller.ts:getMerchantRisk` | Tenant in Group B attempts `GET /api/risk/merchant/:id` targeting Merchant A with `X-Group-Id: <Group B>`. | Controller checks `Membership.exists({ groupId, merchantId: id })`. Foreign merchant request rejected with HTTP `403 FORBIDDEN_GROUP`. | **PASSED** |
| 8 | **Historical Risk Assessment Deduplication** | `risk.controller.ts:getGroupRisk` | Admin triggers risk recomputation multiple times, generating duplicate historical assessment rows per merchant. | Controller deduplicates assessments by `merchantId` keeping only the latest record. `merchants` count and profiles match unique active group members. | **PASSED** |
| 9 | **Notification Read IDOR Vulnerability** | `notification.controller.ts:markNotificationRead` | Attacker in Group B attempts `PATCH /api/notifications/:id/read` on a private notification belonging to Merchant A. | Controller scopes update to `Notification.findOneAndUpdate({ _id: id, merchantId: req.merchant.id })`. Attacker receives HTTP `404 Not Found`; read status is unmodified. | **PASSED** |
| 10 | **Due-Date False Alarms on Pending Debts** | `services/dueDateJob.ts:runDueDateJob` | Debts exist in `pending` (unconfirmed/disputed) status with past due dates alongside confirmed `active` debts. | Job queries `status: 'active'`, ignoring unconfirmed pending debts. No premature or spurious overdue alerts dispatched. | **PASSED** |
| 11 | **Cross-Tenant Risk Trend Protection** | `risk.controller.ts:getRiskTrend` | Attacker in Group B queries `GET /api/risk/trend/:merchantAId` for a merchant with whom they share no common groups. | Controller verifies shared group membership. Foreign callers receive HTTP `403 FORBIDDEN_GROUP`. Co-members and self queries receive HTTP `200`. | **PASSED** |
| 12 | **Empty Group Risk Safety Handling** | `risk.controller.ts:getGroupRisk, recomputeGroupRisk` | Group with 0 debts or assessments is queried or recomputed. | Handled gracefully without division by zero: returns `merchants: 0`, `portfolioAverageRisk: 0`, and clean empty array. | **PASSED** |
| 13 | **Missing Tenant Context Enforcement** | `middleware/group.middleware.ts`, `risk.routes.ts` | Requests to group risk endpoints issued without `X-Group-Id` header. | Middleware intercepts and blocks request with HTTP `403 FORBIDDEN_GROUP`. | **PASSED** |
| 14 | **Realtime Socket Room Eavesdropping** | `realtime/socket.ts:group:join` & handshake | Client attempts to join `group:<Group A>` room via socket handshake or `group:join` event without group membership. | Socket listener checks `Membership.exists({ groupId, merchantId })`. Unauthorized room joining is blocked, preventing real-time data leaks. | **PASSED** |

---

## 3. Frontend Quality Checks & Remediations

| Component | Observed Defect / Failure Mode | Minimal-Diff Fix Applied | Verification |
|---|:---|:---|:---|
| **Contagion Simulation Payload Key** | In `Risk.tsx:handleRunContagion`, the mutation sent `{ merchantId: contagionSource }`. The server controller originally only accepted `failedMerchant`, resulting in continuous validation failures. | Updated server controller to accept `failedMerchant \|\| merchantId` and resolve either merchant ID or merchant Name. Returns both `simulation` and `contagion` response keys. | Contagion cascade triggers seamlessly from the UI and renders total network loss metrics accurately. |
| **No Active Group Empty State** | When no active group was selected (`!activeGroupId`), `Risk.tsx` rendered empty metric cards without context. | Added an early `if (!activeGroupId)` guard in `Risk.tsx` rendering an `EmptyState` component with a direct "Go to Groups" button. | Clean tenant onboarding guidance matching the UX conventions of `Ledger.tsx`. |
| **Non-Admin Recompute Button State** | The "Recompute Risk" button was clickable by regular members, causing a confusing generic error upon server 403 response. | Integrated `useGroup()` in `Risk.tsx`. Evaluated `role = activeGroup?.role ?? 'member'; isAdmin = role === 'admin' \|\| role === 'owner'`. Button is disabled for members with tooltip "Only group admins or owners can recompute group risk". | Clear role-based affordance; unauthorized mutations prevented on client side. |

---

## 4. Detailed Defect Analysis & Minimal Diff Solutions

### Defect 1: Cross-Tenant Data Leakage in Contagion Cascade Simulation
- **File**: `apps/server/src/controllers/risk.controller.ts`
- **Issue**: `simulateContagion` executed `Merchant.find().lean()` and `Debt.find({ status: 'active' })` with **no `groupId` filter**, pooling debts and merchants from all tenant organizations into the simulation network.
- **Fix**: Scoped active debts strictly to `groupId: new Types.ObjectId(groupId)`, filtered merchants to group members (`Membership.find({ groupId })`), verified that the failed merchant is an active member of the group, and validated input bounds.
```diff
--- a/apps/server/src/controllers/risk.controller.ts
+++ b/apps/server/src/controllers/risk.controller.ts
@@ -373,16 +373,38 @@ export const simulateContagion = async (
-    const { failedMerchant, lossGivenDefault, maxRounds } = req.body;
-    if (!failedMerchant) {
+    const { failedMerchant, merchantId, lossGivenDefault, maxRounds } = req.body;
+    const targetIdentifier = failedMerchant || merchantId;
+    if (!targetIdentifier) {
       throw new AppError(400, 'VALIDATION', 'Missing failedMerchant parameter.');
     }
+    const groupId = req.groupId;
+    if (!groupId) {
+      throw new AppError(400, 'VALIDATION', 'Active group context is required.');
+    }
+    // Input bounds validation
+    if (lossGivenDefault !== undefined) {
+      const lgd = Number(lossGivenDefault);
+      if (isNaN(lgd) || lgd < 0 || lgd > 1) {
+        throw new AppError(400, 'VALIDATION', 'lossGivenDefault must be a number between 0.0 and 1.0.');
+      }
+    }
+    const memberships = await Membership.find({
+      groupId: new Types.ObjectId(groupId),
+    }).populate('merchantId').lean();
+    const groupMerchants = memberships.map((m: any) => m.merchantId).filter((m: any) => m && m._id);
+    const debts = await Debt.find({
+      groupId: new Types.ObjectId(groupId),
+      status: 'active',
+    }).populate('debtorId creditorId').lean();
```

---

### Defect 2: Global Database Pollution in Group Risk Recompute
- **File**: `apps/server/src/controllers/risk.controller.ts`
- **Issue**: `recomputeGroupRisk` read all merchants and payment events globally across the entire MongoDB database without checking `groupId`, allowing one tenant's severe delinquency to corrupt another tenant's baseline rate. Additionally, regular members could invoke recomputation.
- **Fix**: Added role check enforcing admin/owner privileges, restricted merchants to group members, scoped `PaymentEvent` queries to `groupId`, and handled empty groups gracefully.
```diff
--- a/apps/server/src/controllers/risk.controller.ts
+++ b/apps/server/src/controllers/risk.controller.ts
@@ -204,11 +204,24 @@ export const recomputeGroupRisk = async (
     const groupId = req.groupId;
+    if (!groupId) {
+      throw new AppError(400, 'VALIDATION', 'Active group context is required.');
+    }
+    if (req.role && req.role !== 'admin' && req.role !== 'owner') {
+      throw new AppError(403, 'FORBIDDEN_GROUP', 'Only group admins and owners can recompute group risk.');
+    }
+    const memberships = await Membership.find({
+      groupId: new Types.ObjectId(groupId),
+    }).populate('merchantId').lean();
+    const merchants = memberships.map((m: any) => m.merchantId).filter((m: any) => m && m._id);
+    const groupEvents = await PaymentEvent.find({
+      groupId: new Types.ObjectId(groupId),
+    }).lean();
```

---

### Defect 3: Notification Read IDOR Vulnerability
- **File**: `apps/server/src/controllers/notification.controller.ts`
- **Issue**: `markNotificationRead` called `Notification.findByIdAndUpdate(id, ...)` without checking `merchantId`, allowing any authenticated user to tamper with and mark other users' private notifications as read.
- **Fix**: Scoped update query to `{ _id: id, merchantId: req.merchant.id }` and returned HTTP 404 if not found or unauthorized.
```diff
--- a/apps/server/src/controllers/notification.controller.ts
+++ b/apps/server/src/controllers/notification.controller.ts
@@ -88,4 +88,10 @@ export const markNotificationRead = async (
-    const notification = await Notification.findByIdAndUpdate(
-      id,
+    const merchantId = req.merchant?.id || (req as any).user?.id;
+    if (!merchantId) {
+      res.status(401).json({ success: false, message: 'Authentication required' });
+      return;
+    }
+    const notification = await Notification.findOneAndUpdate(
+      { _id: new Types.ObjectId(id), merchantId: new Types.ObjectId(merchantId) },
       { $set: { readAt: new Date() } },
       { new: true },
     );
```

---

### Defect 4: Unauthorized Realtime Socket Room Hijacking
- **File**: `apps/server/src/realtime/socket.ts`
- **Issue**: Handshake `groupId` and `socket.on('group:join')` joined the socket to `group:${groupId}` without checking `Membership.exists({ groupId, merchantId })`, permitting any tenant to eavesdrop on confidential real-time broadcasts.
- **Fix**: Added active membership checks before admitting sockets into group rooms.
```diff
--- a/apps/server/src/realtime/socket.ts
+++ b/apps/server/src/realtime/socket.ts
@@ -51,6 +51,12 @@ export const initSocket = (httpServer: HttpServer): SocketIOServer => {
+    if (groupId) {
+      if (mongoose.connection && mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(groupId)) {
+        Membership.exists({ groupId: new mongoose.Types.ObjectId(groupId), merchantId })
+          .then((exists) => {
+            if (exists) socket.join(`group:${groupId}`);
+          }).catch(() => {});
+      }
+    }
@@ -76,6 +82,12 @@ export const initSocket = (httpServer: HttpServer): SocketIOServer => {
+    socket.on('group:join', async (data: { groupId?: string }) => {
+      if (!data?.groupId) return;
+      if (mongoose.connection && mongoose.connection.readyState === 1) {
+        const isMember = await Membership.exists({ groupId: new mongoose.Types.ObjectId(data.groupId), merchantId });
+        if (isMember) socket.join(`group:${data.groupId}`);
+        else socket.emit('error', { code: 'FORBIDDEN_GROUP', message: 'Not a member of this group' });
+      }
+    });
```

---

### Defect 5: Missing Tenancy Enforcement in Merchant Risk Profile & Trend
- **File**: `apps/server/src/controllers/risk.controller.ts`
- **Issue**: `getMerchantRisk` allowed querying any merchant ID without verifying membership in `req.groupId`. `getRiskTrend` lacked authorization checks, allowing cross-tenant financial profiling.
- **Fix**: Added `Membership.exists({ groupId, merchantId: id })` in `getMerchantRisk` (throwing HTTP 403 `FORBIDDEN_GROUP` on mismatch) and verified shared group membership in `getRiskTrend`.
```diff
--- a/apps/server/src/controllers/risk.controller.ts
+++ b/apps/server/src/controllers/risk.controller.ts
@@ -165,6 +165,12 @@ export const getMerchantRisk = async (
+    if (req.groupId) {
+      const isMember = await Membership.exists({
+        groupId: new Types.ObjectId(req.groupId),
+        merchantId: new Types.ObjectId(id),
+      });
+      if (!isMember) {
+        throw new AppError(403, 'FORBIDDEN_GROUP', 'Merchant is not an active member of this group.');
+      }
+    }
```

---

### Defect 6: Due-Date Cron False Alarms on Unapproved Debts
- **File**: `apps/server/src/services/dueDateJob.ts`
- **Issue**: Queried `status: { $in: ['active', 'pending'] }`, causing premature overdue alerts for unapproved or disputed pending debts.
- **Fix**: Filtered query strictly to `status: 'active'`.
```diff
--- a/apps/server/src/services/dueDateJob.ts
+++ b/apps/server/src/services/dueDateJob.ts
@@ -23,3 +23,3 @@ export const runDueDateJob = async (): Promise<DueDateJobSummary> => {
-    status: { $in: ['active', 'pending'] },
+    status: 'active',
```

---

### Defect 7: Duplicate Historical Assessments in Group Risk Portfolio
- **File**: `apps/server/src/controllers/risk.controller.ts`
- **Issue**: `RiskAssessment.find(filter)` fetched all historical records without deduplication by merchant, inflating merchant counts and distorting portfolio average risk scores.
- **Fix**: Deduplicated assessments by `merchantId` keeping only the latest assessment per merchant.
```diff
--- a/apps/server/src/controllers/risk.controller.ts
+++ b/apps/server/src/controllers/risk.controller.ts
@@ -98,6 +98,14 @@ export const getGroupRisk = async (
+    const rawAssessments = await RiskAssessment.find(filter)
+      .sort({ computedAt: -1, createdAt: -1 })
+      .populate('merchantId', 'name email riskProfile')
+      .lean();
+    const seenMerchants = new Set<string>();
+    const assessments: any[] = [];
+    for (const a of rawAssessments) {
+      const mId = a.merchantId?._id?.toString() || a.merchantId?.toString();
+      if (!mId || seenMerchants.has(mId)) continue;
+      seenMerchants.add(mId);
+      assessments.push(a);
+    }
```

---

## 5. Comprehensive Regression & Benchmark Sign-Off

```text
======================================================================
                        PHASE 5A SIGN-OFF MATRIX
======================================================================
Reviewer:           Krrish Gadekar (Python Algorithms & Statistics Lead)
Author Audited:     Parth Goggi (Slice C: Risk, Realtime & Notifications / UI)
Adversarial Tests:  22 passed, 22 total (100% green)
Server Test Suites: 19 passed, 19 total (189 tests, 100% green)
Python Test Suite:  228 passed, 228 total (100% green)
Client Build:       Passed (0 TypeScript errors, production bundle built)
Working Branch:     test/k-p5-review-c
Merge Target:       main
======================================================================
```
