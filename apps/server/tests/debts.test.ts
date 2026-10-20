import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { Merchant } from '../src/models/Merchant';
import { Membership } from '../src/models/Group';
import { createMemoryServer } from './setup';

jest.mock('../src/realtime/socket', () => ({
  getIO: () => ({
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  }),
  emitToGroup: jest.fn(),
  emitToMerchant: jest.fn(),
}));

const app = createApp();
let mongoServer: MongoMemoryServer;
let accessToken: string;
let debtorId: string;
let creditorId: string;
let debtId: string;
let groupId: string;

jest.setTimeout(60000);

beforeAll(async () => {
  mongoServer = await createMemoryServer();
  await mongoose.connect(mongoServer.getUri());

  // Register the test user (will be group owner)
  const adminRes = await request(app).post('/api/auth/register').send({
    name: 'Admin',
    email: 'admin@test.com',
    password: 'password123',
  });
  accessToken = adminRes.body.accessToken;
  const adminId = adminRes.body.merchant.id;

  // Create two additional merchants to use as debtor/creditor
  const debtor = await Merchant.create({
    name: 'Debtor',
    email: 'debtor@test.com',
    passwordHash: 'hash',
  });
  const creditor = await Merchant.create({
    name: 'Creditor',
    email: 'creditor@test.com',
    passwordHash: 'hash',
  });

  debtorId = (debtor._id as mongoose.Types.ObjectId).toString();
  creditorId = (creditor._id as mongoose.Types.ObjectId).toString();

  // Create a group — admin becomes owner
  const groupRes = await request(app)
    .post('/api/groups')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Test Group', type: 'market' });

  groupId = groupRes.body.group._id;

  // Add debtor and creditor as members of the group
  await Membership.create([
    { groupId: new mongoose.Types.ObjectId(groupId), merchantId: debtor._id, role: 'member' },
    { groupId: new mongoose.Types.ObjectId(groupId), merchantId: creditor._id, role: 'member' },
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('Debts API', () => {
  it('creates a new debt', async () => {
    const res = await request(app)
      .post('/api/debts')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Group-Id', groupId)
      .send({
        debtorId,
        creditorId,
        amount: 5000,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.debt.amount).toBe(5000);
    expect(res.body.debt.originalAmount).toBe(5000);
    expect(res.body.debt.groupId).toBeDefined();
    expect(res.body.debt.version).toBe(0);
    debtId = res.body.debt._id;
  });

  it('fetches all debts (scope=all for owner)', async () => {
    const res = await request(app)
      .get('/api/debts?scope=all')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Group-Id', groupId);

    expect(res.status).toBe(200);
    expect(res.body.count).toBeGreaterThanOrEqual(1);
    expect(res.body.debts[0].amount).toBe(5000);
  });

  it('returns 403 without X-Group-Id', async () => {
    const res = await request(app)
      .get('/api/debts')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_GROUP');
  });

  it('updates debt amount', async () => {
    const res = await request(app)
      .patch(`/api/debts/${debtId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Group-Id', groupId)
      .send({ amount: 4000 });

    expect(res.status).toBe(200);
    expect(res.body.debt.amount).toBe(4000);
    expect(res.body.debt.version).toBe(1); // version incremented
  });

  it('settles a debt via DELETE', async () => {
    const res = await request(app)
      .delete(`/api/debts/${debtId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Group-Id', groupId);

    expect(res.status).toBe(200);

    // Verify it was marked settled and amount zeroed
    const fetch = await request(app)
      .get('/api/debts?scope=all&status=settled')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Group-Id', groupId);

    expect(fetch.body.debts[0].status).toBe('settled');
    expect(fetch.body.debts[0].amount).toBe(0);
  });
});

describe('Debts CSV Export & Import (BE-31)', () => {
  let memberAccessToken: string;
  let otherGroupId: string;

  beforeAll(async () => {
    // Register a member login token
    const memberLogin = await request(app).post('/api/auth/login').send({
      email: 'debtor@test.com',
      password: 'hash', // note: was created directly in DB, so let's update passwordHash or register
    });

    if (memberLogin.status === 200) {
      memberAccessToken = memberLogin.body.accessToken;
    } else {
      // Create user with proper password
      const reg = await request(app).post('/api/auth/register').send({
        name: 'Real Member',
        email: 'realmember@test.com',
        password: 'password123',
      });
      memberAccessToken = reg.body.accessToken;
      await Membership.create({
        groupId: new mongoose.Types.ObjectId(groupId),
        merchantId: new mongoose.Types.ObjectId(reg.body.merchant.id),
        role: 'member',
      });
    }

    // Create a second group for cross-tenant isolation testing
    const groupB = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Group B for Isolation', type: 'other' });
    otherGroupId = groupB.body.group._id;

    // Add an active debt in Group A
    await request(app)
      .post('/api/debts')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Group-Id', groupId)
      .send({
        debtorId,
        creditorId,
        amount: 8888,
        note: 'Group A Specific Debt',
      });

    // Add an active debt in Group B
    await request(app)
      .post('/api/debts')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Group-Id', otherGroupId)
      .send({
        debtorId,
        creditorId,
        amount: 9999,
        note: 'Group B Specific Debt',
      });
  });

  describe('GET /api/debts/export.csv', () => {
    it('streams CSV with correct headers and group data for admin', async () => {
      const res = await request(app)
        .get('/api/debts/export.csv')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Group-Id', groupId);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('attachment; filename="debts_export.csv"');

      const csv = res.text;
      expect(csv).toContain('id,debtorId,debtorName,debtorEmail,creditorId,creditorName,creditorEmail,amount,remainingAmount,status,dueDate,note,createdAt');
      expect(csv).toContain('8888');
      expect(csv).toContain('Group A Specific Debt');
    });

    it('enforces cross-group isolation: does not leak Group B debts into Group A export', async () => {
      const res = await request(app)
        .get('/api/debts/export.csv')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Group-Id', groupId);

      expect(res.text).toContain('8888');
      expect(res.text).not.toContain('9999');
      expect(res.text).not.toContain('Group B Specific Debt');
    });

    it('enforces role scoping: member cannot request scope=all', async () => {
      const res = await request(app)
        .get('/api/debts/export.csv?scope=all')
        .set('Authorization', `Bearer ${memberAccessToken}`)
        .set('X-Group-Id', groupId);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });
  });

  describe('POST /api/debts/import', () => {
    it('rejects non-admin member import with 403', async () => {
      const res = await request(app)
        .post('/api/debts/import')
        .set('Authorization', `Bearer ${memberAccessToken}`)
        .set('X-Group-Id', groupId)
        .send({ csvText: 'debtor,creditor,amount\nrealmember@test.com,creditor@test.com,100' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });

    it('returns per-row errors in dry-run mode for invalid rows', async () => {
      const invalidCsv = `debtor,creditor,amount,dueDate,note
${debtorId},${debtorId},500,2026-12-01,Self debt error
nonexistent@test.com,${creditorId},1000,2026-12-01,Unknown debtor
${debtorId},${creditorId},-200,2026-12-01,Negative amount`;

      const res = await request(app)
        .post('/api/debts/import?dryRun=true')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Group-Id', groupId)
        .send({ csvText: invalidCsv });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.dryRun).toBe(true);
      expect(res.body.totalRows).toBe(3);
      expect(res.body.errorCount).toBe(3);
      expect(res.body.errors.length).toBe(3);
      expect(res.body.errors[0].row).toBe(1);
      expect(res.body.errors[0].errors[0]).toContain('same merchant');
    });

    it('returns valid preview in dry-run mode without writing to database', async () => {
      const validCsv = `debtor,creditor,amount,dueDate,note
debtor@test.com,creditor@test.com,7777,2026-12-01,Dry Run Test Note`;

      const res = await request(app)
        .post('/api/debts/import?dryRun=true')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Group-Id', groupId)
        .send({ csvText: validCsv });

      expect(res.status).toBe(200);
      expect(res.body.dryRun).toBe(true);
      expect(res.body.validCount).toBe(1);
      expect(res.body.errorCount).toBe(0);
      expect(res.body.preview[0].amount).toBe(7777);

      // Verify not inserted in DB
      const checkDb = await request(app)
        .get('/api/debts?scope=all&q=Dry Run Test Note')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Group-Id', groupId);
      expect(checkDb.body.debts.length).toBe(0);
    });

    it('successfully imports valid CSV rows creating active debts and audit logs', async () => {
      const validCsv = `debtor,creditor,amount,dueDate,note
debtor@test.com,creditor@test.com,12345,2026-12-01,Imported Active Debt Note`;

      const res = await request(app)
        .post('/api/debts/import')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Group-Id', groupId)
        .send({ csvText: validCsv });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.dryRun).toBe(false);
      expect(res.body.importedCount).toBe(1);
      expect(res.body.debts[0].status).toBe('active');
      expect(res.body.debts[0].amount).toBe(12345);
      expect(res.body.debts[0].originalAmount).toBe(12345);

      // Verify debt is active in database
      const checkDb = await request(app)
        .get('/api/debts?scope=all&q=Imported Active Debt Note')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Group-Id', groupId);

      expect(checkDb.body.debts.length).toBe(1);
      expect(checkDb.body.debts[0].status).toBe('active');

      // Verify audit log created
      const auditRes = await request(app)
        .get('/api/audit')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Group-Id', groupId);

      expect(auditRes.body.audit.some((a: any) => a.action === 'DEBT_IMPORT')).toBe(true);
    });

    it('accepts multipart form file upload', async () => {
      const csvBuffer = Buffer.from(`debtor,creditor,amount,dueDate,note\ndebtor@test.com,creditor@test.com,3333,2026-12-01,Multipart Test`);

      const res = await request(app)
        .post('/api/debts/import')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Group-Id', groupId)
        .attach('file', csvBuffer, 'debts.csv');

      expect(res.status).toBe(201);
      expect(res.body.importedCount).toBe(1);
      expect(res.body.debts[0].amount).toBe(3333);
    });
  });
});

