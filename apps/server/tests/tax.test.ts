import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { createMemoryServer } from './setup';
import { applyTax, round2, TAX_RULE_VERSION, TAX_DOMAINS } from '../src/tax';
import { Debt, ensureBaseAmount } from '../src/models/Debt';
import { AuditLog } from '../src/models/AuditLog';
import { emitToGroup } from '../src/realtime/socket';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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

jest.setTimeout(60000);

describe('Tax Engine — Pure Compute & Hand-Computed Test Vectors (§2.4)', () => {
  // Vector 1: GST intra 18%
  it('computes GST intra 18% correctly (Vector 1)', () => {
    const res = applyTax('gst', 'gst.intra', 10000, { gstRate: 18 });
    expect(res.taxAmount).toBe(1800);
    expect(res.payable).toBe(11800);
    expect(res.effect).toBe('add');
    expect(res.taxRate).toBe(18);
    expect(res.ruleVersion).toBe(TAX_RULE_VERSION);
    expect(res.breakup).toEqual([
      { label: 'CGST', rate: 9, amount: 900 },
      { label: 'SGST', rate: 9, amount: 900 },
    ]);
  });

  // Vector 2: GST inter 5%
  it('computes GST inter 5% correctly (Vector 2)', () => {
    const res = applyTax('gst', 'gst.inter', 20000, { gstRate: 5 });
    expect(res.taxAmount).toBe(1000);
    expect(res.payable).toBe(21000);
    expect(res.effect).toBe('add');
    expect(res.taxRate).toBe(5);
    expect(res.breakup).toEqual([{ label: 'IGST', rate: 5, amount: 1000 }]);
  });

  // Vector 3: Customs import (BCD 7.5%, IGST 18%)
  it('computes Customs import correctly (Vector 3)', () => {
    const res = applyTax('customs', 'customs.import', 500000, {
      bcdRate: 7.5,
      igstRate: 18,
    });
    expect(res.taxAmount).toBe(138675);
    expect(res.payable).toBe(638675);
    expect(res.effect).toBe('add');
    expect(res.breakup).toEqual([
      { label: 'Basic Customs Duty (BCD)', rate: 7.5, amount: 37500 },
      { label: 'Social Welfare Surcharge (SWS 10%)', rate: 10, amount: 3750 },
      { label: 'Integrated GST on Import', rate: 18, amount: 97425 },
    ]);
  });

  // Vector 4: Customs export default
  it('computes Customs export default duty=0 correctly (Vector 4)', () => {
    const res = applyTax('customs', 'customs.export', 100000, { exportDutyRate: 0 });
    expect(res.taxAmount).toBe(0);
    expect(res.payable).toBe(100000);
    expect(res.effect).toBe('add');
    expect(res.taxRate).toBe(0);
    expect(res.breakup).toEqual([
      { label: 'Export Duty', rate: 0, amount: 0 },
      { label: 'IGST (Export Zero-Rated)', rate: 0, amount: 0 },
    ]);
  });

  // Vector 5: Customs export duty 10%
  it('computes Customs export duty 10% correctly (Vector 5)', () => {
    const res = applyTax('customs', 'customs.export', 100000, { exportDutyRate: 10 });
    expect(res.taxAmount).toBe(10000);
    expect(res.payable).toBe(110000);
    expect(res.effect).toBe('add');
    expect(res.taxRate).toBe(10);
    expect(res.breakup).toEqual([
      { label: 'Export Duty', rate: 10, amount: 10000 },
      { label: 'IGST (Export Zero-Rated)', rate: 0, amount: 0 },
    ]);
  });

  // Vector 6: Income TDS professional 10%
  it('computes Income TDS professional correctly (Vector 6)', () => {
    const res = applyTax('income', 'income.tds_professional', 100000);
    expect(res.taxAmount).toBe(10000);
    expect(res.payable).toBe(90000);
    expect(res.effect).toBe('deduct');
    expect(res.taxRate).toBe(10);
  });

  // Vector 7: Income TDS contractor other 2%
  it('computes Income TDS contractor other correctly (Vector 7)', () => {
    const res = applyTax('income', 'income.tds_contractor_other', 200000);
    expect(res.taxAmount).toBe(4000);
    expect(res.payable).toBe(196000);
    expect(res.effect).toBe('deduct');
    expect(res.taxRate).toBe(2);
  });

  // Vector 8: Stamp Mumbai standard & woman concession
  it('computes Stamp Mumbai standard correctly (Vector 8a)', () => {
    const res = applyTax('property', 'property.stamp_mumbai', 5000000, {
      womanBuyer: false,
    });
    expect(res.taxAmount).toBe(300000);
    expect(res.payable).toBe(5300000);
    expect(res.taxRate).toBe(6);
    expect(res.breakup).toEqual([
      { label: 'Stamp Duty (Mumbai)', rate: 5, amount: 250000 },
      { label: 'Metro Cess', rate: 1, amount: 50000 },
    ]);
  });

  it('computes Stamp Mumbai woman concession correctly (Vector 8b)', () => {
    const res = applyTax('property', 'property.stamp_mumbai', 5000000, {
      womanBuyer: true,
    });
    expect(res.taxAmount).toBe(250000);
    expect(res.payable).toBe(5250000);
    expect(res.taxRate).toBe(5);
    expect(res.breakup).toEqual([
      { label: 'Stamp Duty (Mumbai - Woman Concession)', rate: 4, amount: 200000 },
      { label: 'Metro Cess', rate: 1, amount: 50000 },
    ]);
  });

  // Vector 9: Registration capped at ₹30,000
  it('computes Registration fee capped at 30,000 (Vector 9)', () => {
    const res = applyTax('property', 'property.registration', 5000000);
    expect(res.taxAmount).toBe(30000);
    expect(res.payable).toBe(5030000);
    expect(res.effect).toBe('add');
  });

  // Vector 10: Registration small (< 30,000 cap)
  it('computes Registration small correctly (Vector 10)', () => {
    const res = applyTax('property', 'property.registration', 2000000);
    expect(res.taxAmount).toBe(20000);
    expect(res.payable).toBe(2020000);
    expect(res.effect).toBe('add');
  });

  // Vector 11: Vehicle petrol (slab 10L to 20L = 12%)
  it('computes Vehicle petrol correctly (Vector 11)', () => {
    const res = applyTax('vehicle', 'vehicle.petrol', 1200000);
    expect(res.taxAmount).toBe(144000);
    expect(res.payable).toBe(1344000);
    expect(res.taxRate).toBe(12);
  });

  // Vector 12: Vehicle diesel (slab <= 10L = 13%)
  it('computes Vehicle diesel correctly (Vector 12)', () => {
    const res = applyTax('vehicle', 'vehicle.diesel', 800000);
    expect(res.taxAmount).toBe(104000);
    expect(res.payable).toBe(904000);
    expect(res.taxRate).toBe(13);
  });

  // Vector 13: Vehicle CNG (slab <= 10L = 12%)
  it('computes Vehicle CNG correctly (Vector 13)', () => {
    const res = applyTax('vehicle', 'vehicle.cng', 900000);
    expect(res.taxAmount).toBe(108000);
    expect(res.payable).toBe(1008000);
    expect(res.taxRate).toBe(12);
  });

  // Vector 14: Vehicle EV (0% exempt)
  it('computes Vehicle EV exemption correctly (Vector 14)', () => {
    const res = applyTax('vehicle', 'vehicle.ev', 1500000);
    expect(res.taxAmount).toBe(0);
    expect(res.payable).toBe(1500000);
    expect(res.taxRate).toBe(0);
  });

  // Vector 15: Vehicle company / import (flat 20%)
  it('computes Vehicle company correctly (Vector 15)', () => {
    const res = applyTax('vehicle', 'vehicle.company_or_import', 2500000);
    expect(res.taxAmount).toBe(500000);
    expect(res.payable).toBe(3000000);
    expect(res.taxRate).toBe(20);
  });

  // Edge cases & validation
  it('rejects invalid tax type for the domain with INVALID_TAX_TYPE', () => {
    expect(() => {
      applyTax('gst', 'income.tds_professional', 10000);
    }).toThrow(expect.objectContaining({ code: 'INVALID_TAX_TYPE', statusCode: 400 }));

    expect(() => {
      applyTax('none', 'gst.intra', 10000);
    }).toThrow(expect.objectContaining({ code: 'INVALID_TAX_TYPE', statusCode: 400 }));
  });

  it('rejects unknown select option with VALIDATION', () => {
    expect(() => {
      applyTax('gst', 'gst.intra', 10000, { gstRate: 28 }); // 28 is not an option
    }).toThrow(expect.objectContaining({ code: 'VALIDATION', statusCode: 400 }));
  });

  it('rejects negative or non-finite base amount with VALIDATION', () => {
    expect(() => {
      applyTax('gst', 'gst.intra', -500, { gstRate: 18 });
    }).toThrow(expect.objectContaining({ code: 'VALIDATION', statusCode: 400 }));

    expect(() => {
      applyTax('gst', 'gst.intra', Infinity, { gstRate: 18 });
    }).toThrow(expect.objectContaining({ code: 'VALIDATION', statusCode: 400 }));
  });
});

describe('Tax API Endpoints, Groups, Debts & Domain Locking', () => {
  let ownerToken: string;
  let adminToken: string;
  let memberToken: string;
  let outsiderToken: string;
  let ownerId: string;
  let adminId: string;
  let memberId: string;

  let noneGroupId: string;
  let gstGroupId: string;

  beforeAll(async () => {
    mongoServer = await createMemoryServer();
    await mongoose.connect(mongoServer.getUri());

    // Register test merchants
    const oRes = await request(app).post('/api/auth/register').send({
      name: 'Owner Merchant',
      email: 'owner@tax-test.com',
      password: 'password123',
    });
    ownerToken = oRes.body.accessToken;
    ownerId = oRes.body.merchant.id || oRes.body.merchant._id;

    const aRes = await request(app).post('/api/auth/register').send({
      name: 'Admin Merchant',
      email: 'admin@tax-test.com',
      password: 'password123',
    });
    adminToken = aRes.body.accessToken;
    adminId = aRes.body.merchant.id || aRes.body.merchant._id;

    const mRes = await request(app).post('/api/auth/register').send({
      name: 'Member Merchant',
      email: 'member@tax-test.com',
      password: 'password123',
    });
    memberToken = mRes.body.accessToken;
    memberId = mRes.body.merchant.id || mRes.body.merchant._id;

    const outRes = await request(app).post('/api/auth/register').send({
      name: 'Outsider Merchant',
      email: 'outsider@tax-test.com',
      password: 'password123',
    });
    outsiderToken = outRes.body.accessToken;

    // Create a group with default domain 'none'
    const noneGroupRes = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'None Group', type: 'market' });
    noneGroupId = noneGroupRes.body.group._id;

    // Add admin and member to noneGroup
    await request(app)
      .post('/api/groups/join')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inviteCode: noneGroupRes.body.group.inviteCode });
    await request(app)
      .patch(`/api/groups/${noneGroupId}/members/${adminId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Group-Id', noneGroupId)
      .send({ role: 'admin' });

    await request(app)
      .post('/api/groups/join')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ inviteCode: noneGroupRes.body.group.inviteCode });

    // Create a group with domain 'gst'
    const gstGroupRes = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'GST Group', type: 'market', domain: 'gst' });
    gstGroupId = gstGroupRes.body.group._id;

    // Add member to gstGroup
    await request(app)
      .post('/api/groups/join')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ inviteCode: gstGroupRes.body.group.inviteCode });
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe('GET /api/tax/domains', () => {
    it('returns all tax domains', async () => {
      const res = await request(app)
        .get('/api/tax/domains')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', gstGroupId);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(TAX_DOMAINS.length);
      expect(res.body[0]).toHaveProperty('key');
      expect(res.body[0]).toHaveProperty('label');
      expect(res.body[0]).toHaveProperty('description');
    });

    it('rejects without group context', async () => {
      const res = await request(app)
        .get('/api/tax/domains')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });
  });

  describe('GET /api/tax/rules', () => {
    it('returns rules for active group domain (gst) by default', async () => {
      const res = await request(app)
        .get('/api/tax/rules')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', gstGroupId);

      expect(res.status).toBe(200);
      expect(res.body.domain).toBe('gst');
      expect(res.body.ruleVersion).toBe(TAX_RULE_VERSION);
      expect(res.body.types.length).toBeGreaterThan(0);
      expect(res.body.types.every((t: any) => t.key.startsWith('gst.'))).toBe(true);
    });

    it('returns rules for queried domain (income)', async () => {
      const res = await request(app)
        .get('/api/tax/rules?domain=income')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', gstGroupId);

      expect(res.status).toBe(200);
      expect(res.body.domain).toBe('income');
      expect(res.body.types.every((t: any) => t.key.startsWith('income.'))).toBe(true);
    });
  });

  describe('POST /api/tax/preview & Group Isolation', () => {
    it('previews tax using active group domain (gst)', async () => {
      const res = await request(app)
        .post('/api/tax/preview')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', gstGroupId)
        .send({
          taxType: 'gst.intra',
          baseAmount: 10000,
          taxInputs: { gstRate: 18 },
        });

      expect(res.status).toBe(200);
      expect(res.body.baseAmount).toBe(10000);
      expect(res.body.taxAmount).toBe(1800);
      expect(res.body.payable).toBe(11800);
      expect(res.body.breakup).toHaveLength(2);
    });

    it('rejects preview with taxType from a different domain (isolation)', async () => {
      const res = await request(app)
        .post('/api/tax/preview')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', gstGroupId)
        .send({
          taxType: 'income.tds_professional', // Income rule in a GST group
          baseAmount: 10000,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_TAX_TYPE');
    });

    it('rejects preview from outsider not belonging to the group (isolation)', async () => {
      const res = await request(app)
        .post('/api/tax/preview')
        .set('Authorization', `Bearer ${outsiderToken}`)
        .set('X-Group-Id', gstGroupId)
        .send({
          taxType: 'gst.intra',
          baseAmount: 10000,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });
  });

  describe('PATCH /api/groups/:id/domain (Domain Locking Rules)', () => {
    let freshGroupId: string;

    beforeEach(async () => {
      // Create a fresh group with domain 'none'
      const freshRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Fresh Group', type: 'market' });
      freshGroupId = freshRes.body.group._id;

      // Add admin and member
      await request(app)
        .post('/api/groups/join')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ inviteCode: freshRes.body.group.inviteCode });
      await request(app)
        .patch(`/api/groups/${freshGroupId}/members/${adminId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', freshGroupId)
        .send({ role: 'admin' });

      await request(app)
        .post('/api/groups/join')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ inviteCode: freshRes.body.group.inviteCode });
    });

    it('allows admin/owner to configure domain on a fresh circle with zero debts', async () => {
      (emitToGroup as jest.Mock).mockClear();

      const res = await request(app)
        .patch(`/api/groups/${freshGroupId}/domain`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Group-Id', freshGroupId)
        .send({ domain: 'property' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.group.domain).toBe('property');

      // Verify audit log
      const audit = await AuditLog.findOne({
        groupId: freshGroupId,
        action: 'GROUP_DOMAIN_UPDATED',
      });
      expect(audit).not.toBeNull();
      expect(audit?.meta).toEqual(
        expect.objectContaining({ previousDomain: 'none', newDomain: 'property' }),
      );

      // Verify socket emission
      expect(emitToGroup).toHaveBeenCalledWith(
        freshGroupId,
        'group:updated',
        expect.objectContaining({ group: expect.anything() }),
      );
    });

    it('rejects domain change by a regular member with 403', async () => {
      const res = await request(app)
        .patch(`/api/groups/${freshGroupId}/domain`)
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Group-Id', freshGroupId)
        .send({ domain: 'vehicle' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_GROUP');
    });

    it('rejects domain change if domain is already set (not none) with 409 DOMAIN_LOCKED', async () => {
      // First update to 'income'
      await request(app)
        .patch(`/api/groups/${freshGroupId}/domain`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', freshGroupId)
        .send({ domain: 'income' });

      // Second update attempt must fail
      const res = await request(app)
        .patch(`/api/groups/${freshGroupId}/domain`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', freshGroupId)
        .send({ domain: 'gst' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DOMAIN_LOCKED');
    });

    it('rejects domain change if group already has debts with 409 DOMAIN_LOCKED', async () => {
      // Create a legacy debt in freshGroupId
      await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', freshGroupId)
        .send({
          debtorId: memberId,
          creditorId: ownerId,
          amount: 5000,
        });

      // Attempt to change domain
      const res = await request(app)
        .patch(`/api/groups/${freshGroupId}/domain`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', freshGroupId)
        .send({ domain: 'customs' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DOMAIN_LOCKED');
    });
  });

  describe('Debt Creation & Tax Domain Rules', () => {
    it('creates legacy debt in domain=none group unchanged (baseAmount = amount)', async () => {
      const res = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', noneGroupId)
        .send({
          debtorId: memberId,
          creditorId: ownerId,
          amount: 2500,
          note: 'Legacy debt test',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.debt.amount).toBe(2500);
      expect(res.body.debt.originalAmount).toBe(2500);
      expect(res.body.debt.baseAmount).toBe(2500);
      expect(res.body.debt.taxAmount).toBe(0);
    });

    it('rejects tax debt in a domain=none group with 400 DOMAIN_REQUIRED', async () => {
      const res = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', noneGroupId)
        .send({
          debtorId: memberId,
          creditorId: ownerId,
          baseAmount: 10000,
          taxType: 'gst.intra',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('DOMAIN_REQUIRED');
    });

    it('creates tax debt in gst group, ignores client amount, sets payable and stores tax metadata', async () => {
      const res = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', gstGroupId)
        .send({
          debtor: memberId,
          creditor: ownerId,
          baseAmount: 10000,
          taxType: 'gst.intra',
          taxInputs: { gstRate: 18 },
          amount: 999999, // Client amount must be IGNORED by server
          note: 'Tax invoice 001',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const debt = res.body.debt;
      expect(debt.amount).toBe(11800); // 10000 + 1800
      expect(debt.originalAmount).toBe(11800);
      expect(debt.baseAmount).toBe(10000);
      expect(debt.taxType).toBe('gst.intra');
      expect(debt.taxEffect).toBe('add');
      expect(debt.taxAmount).toBe(1800);
      expect(debt.taxRate).toBe(18);
      expect(debt.taxRuleVersion).toBe(TAX_RULE_VERSION);
      expect(debt.taxBreakup).toHaveLength(2);

      // Verify audit log meta includes tax fields
      const audit = await AuditLog.findOne({ entityId: new mongoose.Types.ObjectId(debt._id), action: 'DEBT_CREATED' });
      expect(audit).not.toBeNull();
      expect(audit?.meta).toEqual(
        expect.objectContaining({
          baseAmount: 10000,
          taxType: 'gst.intra',
          taxAmount: 1800,
          taxRate: 18,
          taxEffect: 'add',
        }),
      );
    });

    it('treats missing baseAmount as amount when reading legacy debt (migration helper)', async () => {
      // Create a document directly in Mongo without baseAmount
      const legacyDoc = await Debt.create({
        groupId: new mongoose.Types.ObjectId(noneGroupId),
        debtorId: new mongoose.Types.ObjectId(memberId),
        creditorId: new mongoose.Types.ObjectId(ownerId),
        amount: 7500,
        originalAmount: 7500,
        status: 'active',
        version: 0,
      });

      // Clear baseAmount field directly to simulate old document
      await Debt.collection.updateOne(
        { _id: legacyDoc._id },
        { $unset: { baseAmount: '' } },
      );

      // Query via Mongoose findById
      const fetched = await Debt.findById(legacyDoc._id);
      expect(fetched).not.toBeNull();
      expect(fetched?.baseAmount).toBe(7500);

      // Plain object helper
      const plainObj = { amount: 3300 };
      const migrated = ensureBaseAmount(plainObj);
      expect(migrated.baseAmount).toBe(3300);
    });
  });

  describe('GET /api/tax/summary', () => {
    it('returns tax summary with admin seeing whole group and member seeing own debts', async () => {
      // GST group already has 1 debt: base 10000, tax 1800, payable 11800 between member and owner

      // Admin/Owner requests summary
      const adminRes = await request(app)
        .get('/api/tax/summary')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', gstGroupId);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.domain).toBe('gst');
      expect(adminRes.body.grandBase).toBe(10000);
      expect(adminRes.body.grandTax).toBe(1800);
      expect(adminRes.body.grandPayable).toBe(11800);
      expect(adminRes.body.totals).toHaveLength(1);
      expect(adminRes.body.totals[0]).toEqual(
        expect.objectContaining({
          taxType: 'gst.intra',
          count: 1,
          baseTotal: 10000,
          taxTotal: 1800,
          effect: 'add',
        }),
      );

      // Member (party to the debt) requests summary
      const memberRes = await request(app)
        .get('/api/tax/summary')
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Group-Id', gstGroupId);

      expect(memberRes.status).toBe(200);
      expect(memberRes.body.grandBase).toBe(10000);

      // Summary for none group returns zero totals
      const noneRes = await request(app)
        .get('/api/tax/summary')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', noneGroupId);

      expect(noneRes.status).toBe(200);
      expect(noneRes.body.domain).toBe('none');
      expect(noneRes.body.totals).toEqual([]);
      expect(noneRes.body.grandBase).toBe(0);
    });
  });

  describe('PATCH /api/debts/:id — Tax Debt Edit', () => {
    let incomeGroupId: string;
    let incomeGroupInviteCode: string;
    let taxDebtId: string;

    beforeAll(async () => {
      // Create income group
      const gRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Income Edit Group', type: 'market', domain: 'income' });
      incomeGroupId = gRes.body.group._id;
      incomeGroupInviteCode = gRes.body.group.inviteCode;

      // Join member
      await request(app)
        .post('/api/groups/join')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ inviteCode: incomeGroupInviteCode });

      // Create a tax debt (TDS professional 10%)
      const dRes = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', incomeGroupId)
        .send({
          debtorId: memberId,
          creditorId: ownerId,
          baseAmount: 100000,
          taxType: 'income.tds_professional',
        });
      taxDebtId = dRes.body.debt._id;
    });

    it('recomputes tax fields when baseAmount changes in a tax group', async () => {
      const res = await request(app)
        .patch(`/api/debts/${taxDebtId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', incomeGroupId)
        .send({ baseAmount: 200000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const debt = res.body.debt;
      // TDS professional 10%: payable = 200000 - 20000 = 180000
      expect(debt.baseAmount).toBe(200000);
      expect(debt.taxAmount).toBe(20000);
      expect(debt.amount).toBe(180000);
      expect(debt.taxType).toBe('income.tds_professional');
      expect(debt.taxEffect).toBe('deduct');
    });

    it('blocks tax debt edit when payments exist (409)', async () => {
      // Create a fresh debt and confirm it, then record a payment
      const dRes = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', incomeGroupId)
        .send({
          debtorId: memberId,
          creditorId: ownerId,
          baseAmount: 50000,
          taxType: 'income.tds_professional',
        });
      const paidDebtId = dRes.body.debt._id;

      // Confirm it
      await request(app)
        .post(`/api/debts/${paidDebtId}/confirm`)
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Group-Id', incomeGroupId);

      // Record a payment (partial)
      await request(app)
        .post(`/api/debts/${paidDebtId}/payments`)
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Group-Id', incomeGroupId)
        .send({ amount: 5000 });

      // Attempt to update
      const res = await request(app)
        .patch(`/api/debts/${paidDebtId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', incomeGroupId)
        .send({ baseAmount: 60000 });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('VALIDATION');
    });

    it('legacy none-group PATCH still works with amount field', async () => {
      // Create a debt in noneGroupId
      const dRes = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', noneGroupId)
        .send({
          debtorId: memberId,
          creditorId: ownerId,
          amount: 5000,
        });
      const legacyDebtId = dRes.body.debt._id;

      const res = await request(app)
        .patch(`/api/debts/${legacyDebtId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', noneGroupId)
        .send({ amount: 7500 });

      expect(res.status).toBe(200);
      expect(res.body.debt.amount).toBe(7500);
    });
  });

  describe('Payments on Tax Debts — Partial Payment Verification', () => {
    let incomeGroup2Id: string;
    let tdsDebtId: string;

    beforeAll(async () => {
      // Create income group 2
      const gRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Income Payment Group', type: 'market', domain: 'income' });
      incomeGroup2Id = gRes.body.group._id;
      const inv = gRes.body.group.inviteCode;

      await request(app)
        .post('/api/groups/join')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ inviteCode: inv });

      // Create TDS professional debt: base=100000, payable=90000
      const dRes = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', incomeGroup2Id)
        .send({
          debtorId: memberId,
          creditorId: ownerId,
          baseAmount: 100000,
          taxType: 'income.tds_professional',
        });
      tdsDebtId = dRes.body.debt._id;
      expect(dRes.body.debt.amount).toBe(90000);

      // Confirm the debt
      await request(app)
        .post(`/api/debts/${tdsDebtId}/confirm`)
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Group-Id', incomeGroup2Id);
    });

    it('partial payment reduces amount but preserves baseAmount and taxAmount', async () => {
      const res = await request(app)
        .post(`/api/debts/${tdsDebtId}/payments`)
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Group-Id', incomeGroup2Id)
        .send({ amount: 40000 });

      expect(res.status).toBe(201);
      expect(res.body.debt.amount).toBe(50000); // 90000 - 40000
      expect(res.body.debt.baseAmount).toBe(100000); // unchanged
      expect(res.body.debt.taxAmount).toBe(10000); // unchanged
      expect(res.body.debt.status).toBe('active');
    });

    it('final payment settles the debt at zero', async () => {
      const res = await request(app)
        .post(`/api/debts/${tdsDebtId}/payments`)
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Group-Id', incomeGroup2Id)
        .send({ amount: 50000 });

      expect(res.status).toBe(201);
      expect(res.body.debt.amount).toBe(0);
      expect(res.body.debt.status).toBe('settled');
      expect(res.body.debt.baseAmount).toBe(100000); // still unchanged
      expect(res.body.debt.taxAmount).toBe(10000); // still unchanged
    });
  });

  describe('GET /api/tax/summary — Strict Status Exclusion', () => {
    let summaryGroupId: string;
    let summaryDebtId: string;

    beforeAll(async () => {
      const gRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Summary Test Group', type: 'market', domain: 'gst' });
      summaryGroupId = gRes.body.group._id;
      const inv = gRes.body.group.inviteCode;

      await request(app)
        .post('/api/groups/join')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ inviteCode: inv });

      // Create a GST debt
      const dRes = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', summaryGroupId)
        .send({
          debtorId: memberId,
          creditorId: ownerId,
          baseAmount: 10000,
          taxType: 'gst.intra',
          taxInputs: { gstRate: 18 },
        });
      summaryDebtId = dRes.body.debt._id;
    });

    it('includes active/pending debts in summary totals', async () => {
      const res = await request(app)
        .get('/api/tax/summary')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', summaryGroupId);

      expect(res.status).toBe(200);
      expect(res.body.domain).toBe('gst');
      expect(res.body.totals.length).toBeGreaterThan(0);
      expect(res.body.grandBase).toBe(10000);
      expect(res.body.grandTax).toBe(1800);
      expect(res.body.grandPayable).toBe(11800);
    });

    it('excludes settled debts from summary', async () => {
      // Confirm and settle the debt
      await request(app)
        .post(`/api/debts/${summaryDebtId}/confirm`)
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Group-Id', summaryGroupId);

      await request(app)
        .delete(`/api/debts/${summaryDebtId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', summaryGroupId);

      const res = await request(app)
        .get('/api/tax/summary')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', summaryGroupId);

      expect(res.status).toBe(200);
      // After settling, summary should be empty
      expect(res.body.grandBase).toBe(0);
      expect(res.body.grandTax).toBe(0);
      expect(res.body.grandPayable).toBe(0);
    });
  });

  describe('CSV Export — Tax Columns', () => {
    it('exports CSV with baseAmount, taxType, taxAmount columns', async () => {
      const res = await request(app)
        .get('/api/debts/export.csv')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', gstGroupId);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/);
      const lines = res.text.split('\n');
      const headers = lines[0].split(',');
      expect(headers).toContain('baseAmount');
      expect(headers).toContain('taxType');
      expect(headers).toContain('taxAmount');
    });
  });

  describe('CSV Import — Tax vs Non-tax Group Validation', () => {
    it('requires taxType and baseAmount when importing into tax group', async () => {
      // Attempt dryRun import with missing taxType and baseAmount
      const csvContent = `debtor,creditor,amount
${memberId},${ownerId},10000`;

      const res = await request(app)
        .post('/api/debts/import?dryRun=true')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', gstGroupId)
        .send({ csvText: csvContent });

      expect(res.status).toBe(200);
      expect(res.body.errorCount).toBeGreaterThan(0);
      const rowErrors = res.body.errors[0].errors;
      expect(rowErrors.some((e: string) => e.includes('taxType is required'))).toBe(true);
      expect(rowErrors.some((e: string) => e.includes('baseAmount is required'))).toBe(true);
    });

    it('computes payable amount server-side for valid tax row in tax group', async () => {
      const csvContent = `debtor,creditor,baseAmount,taxType
${memberId},${ownerId},10000,gst.intra`;

      const res = await request(app)
        .post('/api/debts/import?dryRun=true')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', gstGroupId)
        .send({ csvText: csvContent });

      expect(res.status).toBe(200);
      expect(res.body.errorCount).toBe(0);
      expect(res.body.validCount).toBe(1);
      // GST intra 18%: payable = 11800
      expect(res.body.preview[0].amount).toBe(11800);
      expect(res.body.preview[0].baseAmount).toBe(10000);
      expect(res.body.preview[0].taxAmount).toBe(1800);
    });
  });

  describe('Settlement Cycle Tests — Tax Debts (No Engine Changes)', () => {
    let cycleGroupId: string;
    let cycleGroupInviteCode: string;

    beforeAll(async () => {
      // Create a GST group for cycle testing
      const gRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'Cycle Test Group', type: 'market', domain: 'gst' });
      cycleGroupId = gRes.body.group._id;
      cycleGroupInviteCode = gRes.body.group.inviteCode;

      // Add admin
      await request(app)
        .post('/api/groups/join')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ inviteCode: cycleGroupInviteCode });
      await request(app)
        .patch(`/api/groups/${cycleGroupId}/members/${adminId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', cycleGroupId)
        .send({ role: 'admin' });

      // Add member
      await request(app)
        .post('/api/groups/join')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ inviteCode: cycleGroupInviteCode });
    });

    it('GST cycled debts: payable amounts reach net balance of zero after settlement', async () => {
      // Debt 1: owner owes member 10000 base => payable 11800 (18% GST intra)
      const d1Res = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', cycleGroupId)
        .send({
          debtorId: ownerId,
          creditorId: memberId,
          baseAmount: 10000,
          taxType: 'gst.intra',
          taxInputs: { gstRate: 18 },
        });
      expect(d1Res.status).toBe(201);
      expect(d1Res.body.debt.amount).toBe(11800);

      // Confirm d1
      await request(app)
        .post(`/api/debts/${d1Res.body.debt._id}/confirm`)
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Group-Id', cycleGroupId);

      // Debt 2: member owes owner 8000 base => payable 9440 (18% GST intra)
      const d2Res = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', cycleGroupId)
        .send({
          debtorId: memberId,
          creditorId: ownerId,
          baseAmount: 8000,
          taxType: 'gst.intra',
          taxInputs: { gstRate: 18 },
        });
      expect(d2Res.status).toBe(201);
      expect(d2Res.body.debt.amount).toBe(9440);

      // Confirm d2
      await request(app)
        .post(`/api/debts/${d2Res.body.debt._id}/confirm`)
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Group-Id', cycleGroupId);

      // Call settlement optimize — the engine uses PAYABLE amounts
      mockedAxios.post.mockImplementationOnce((_url: any, data: any) => {
        expect(data.debts).toEqual(
          expect.arrayContaining([
            { debtor: 'Owner Merchant', creditor: 'Member Merchant', amount: 11800 },
            { debtor: 'Member Merchant', creditor: 'Owner Merchant', amount: 9440 },
          ]),
        );
        return Promise.resolve({
          data: {
            net_balances: {
              'Owner Merchant': -2360,
              'Member Merchant': 2360,
            },
            transactions: [{ payer: 'Owner Merchant', payee: 'Member Merchant', amount: 2360 }],
            transaction_count: 1,
            total_amount_settled: 9440,
            algorithm: 'Greedy Min-Transactions',
          },
        });
      });

      const settleRes = await request(app)
        .post('/api/settlement/optimize')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', cycleGroupId);

      expect(settleRes.status).toBe(200);
      expect(settleRes.body.success).toBe(true);

      // Net: owner owes 11800 to member, member owes 9440 to owner
      // Net balance: owner net = -11800 + 9440 = -2360 (owes 2360)
      //              member net = +11800 - 9440 = +2360 (receives 2360)
      // Sum of all net balances = 0
      const balances = settleRes.body.net_balances;
      const sum = Object.values(balances as Record<string, number>).reduce((a, b) => a + b, 0);
      expect(sum).toBe(0);
      expect(balances['Owner Merchant']).toBe(-2360);
      expect(balances['Member Merchant']).toBe(2360);
    });

    it('TDS deduct debt in cycle: net balances sum to zero', async () => {
      // Create a TDS income group for this test
      const iRes = await request(app)
        .post('/api/groups')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: 'TDS Cycle Group', type: 'market', domain: 'income' });
      const tdsGroupId = iRes.body.group._id;
      const tdsInv = iRes.body.group.inviteCode;

      await request(app)
        .post('/api/groups/join')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ inviteCode: tdsInv });

      // Debt 1: owner owes member 100000 base, TDS professional 10%, payable 90000
      const d1Res = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', tdsGroupId)
        .send({
          debtorId: ownerId,
          creditorId: memberId,
          baseAmount: 100000,
          taxType: 'income.tds_professional',
        });
      expect(d1Res.body.debt.amount).toBe(90000);

      // Confirm
      await request(app)
        .post(`/api/debts/${d1Res.body.debt._id}/confirm`)
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Group-Id', tdsGroupId);

      // Debt 2: member owes owner 50000 base, TDS contractor individual 1%, payable 49500
      const d2Res = await request(app)
        .post('/api/debts')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', tdsGroupId)
        .send({
          debtorId: memberId,
          creditorId: ownerId,
          baseAmount: 50000,
          taxType: 'income.tds_contractor_individual',
        });
      expect(d2Res.body.debt.amount).toBe(49500);

      // Confirm
      await request(app)
        .post(`/api/debts/${d2Res.body.debt._id}/confirm`)
        .set('Authorization', `Bearer ${memberToken}`)
        .set('X-Group-Id', tdsGroupId);

      // Call settlement optimize
      mockedAxios.post.mockImplementationOnce((_url: any, data: any) => {
        expect(data.debts).toEqual(
          expect.arrayContaining([
            { debtor: 'Owner Merchant', creditor: 'Member Merchant', amount: 90000 },
            { debtor: 'Member Merchant', creditor: 'Owner Merchant', amount: 49500 },
          ]),
        );
        return Promise.resolve({
          data: {
            net_balances: {
              'Owner Merchant': -40500,
              'Member Merchant': 40500,
            },
            transactions: [{ payer: 'Owner Merchant', payee: 'Member Merchant', amount: 40500 }],
            transaction_count: 1,
            total_amount_settled: 49500,
            algorithm: 'Greedy Min-Transactions',
          },
        });
      });

      const settleRes = await request(app)
        .post('/api/settlement/optimize')
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('X-Group-Id', tdsGroupId);

      expect(settleRes.status).toBe(200);
      const balances = settleRes.body.net_balances;
      const sum = Object.values(balances as Record<string, number>).reduce((a, b) => a + b, 0);
      expect(sum).toBe(0);

      // Net: owner owes member 90000, member owes owner 49500
      // Net for owner = -90000 + 49500 = -40500
      // Net for member = +90000 - 49500 = +40500
      expect(balances['Owner Merchant']).toBe(-40500);
      expect(balances['Member Merchant']).toBe(40500);

      // Verify debts use PAYABLE amounts (not base amounts)
      expect(d1Res.body.debt.amount).toBe(90000);
      expect(d2Res.body.debt.amount).toBe(49500);
    });
  });
});