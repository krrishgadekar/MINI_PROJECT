import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { createMemoryServer } from './setup';

jest.mock('../src/realtime/socket', () => ({
  getIO: () => ({
    emit: jest.fn(),
    to: jest.fn(() => ({ emit: jest.fn() })),
  }),
  emitToGroup: jest.fn(),
}));

const app = createApp();
let mongoServer: MongoMemoryServer;

jest.setTimeout(60000);

// Auth state
let ownerToken: string;
let adminToken: string;
let memberToken: string;
let outsiderToken: string;
let groupId: string;
let inviteCode: string;

beforeAll(async () => {
  mongoServer = await createMemoryServer();
  await mongoose.connect(mongoServer.getUri());

  // Register owner
  const ownerRes = await request(app).post('/api/auth/register').send({
    name: 'Owner Merchant',
    email: 'owner@groups-test.com',
    password: 'password123',
  });
  ownerToken = ownerRes.body.accessToken;

  // Register admin
  const adminRes = await request(app).post('/api/auth/register').send({
    name: 'Admin Merchant',
    email: 'admin@groups-test.com',
    password: 'password123',
  });
  adminToken = adminRes.body.accessToken;

  // Register member
  const memberRes = await request(app).post('/api/auth/register').send({
    name: 'Member Merchant',
    email: 'member@groups-test.com',
    password: 'password123',
  });
  memberToken = memberRes.body.accessToken;

  // Register outsider (not in any group)
  const outsiderRes = await request(app).post('/api/auth/register').send({
    name: 'Outsider Merchant',
    email: 'outsider@groups-test.com',
    password: 'password123',
  });
  outsiderToken = outsiderRes.body.accessToken;
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

describe('Groups API — POST /api/groups', () => {
  it('creates a new group and owner becomes owner member', async () => {
    const res = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Crawford Market Circle', type: 'market' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.group.name).toBe('Crawford Market Circle');
    expect(res.body.group.type).toBe('market');
    expect(res.body.group.inviteCode).toBeDefined();

    groupId = res.body.group._id;
    inviteCode = res.body.group.inviteCode;
  });

  it('rejects group creation without auth', async () => {
    const res = await request(app)
      .post('/api/groups')
      .send({ name: 'No Auth Group', type: 'other' });

    expect(res.status).toBe(401);
  });

  it('rejects group creation with invalid type', async () => {
    const res = await request(app)
      .post('/api/groups')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Bad Type Group', type: 'invalid_type' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });
});

describe('Groups API — GET /api/groups', () => {
  it('returns groups the user belongs to with role', async () => {
    const res = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.groups).toHaveLength(1);
    expect(res.body.groups[0].role).toBe('owner');
    expect(res.body.groups[0]._id).toBe(groupId);
  });

  it('returns empty list for outsider', async () => {
    const res = await request(app)
      .get('/api/groups')
      .set('Authorization', `Bearer ${outsiderToken}`);

    expect(res.status).toBe(200);
    expect(res.body.groups).toHaveLength(0);
  });
});

describe('Groups API — POST /api/groups/join', () => {
  it('admin joins via invite code and gets member role', async () => {
    const res = await request(app)
      .post('/api/groups/join')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inviteCode });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.membership.role).toBe('member');
  });

  it('member joins via invite code', async () => {
    const res = await request(app)
      .post('/api/groups/join')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ inviteCode });

    expect(res.status).toBe(200);
    expect(res.body.membership.role).toBe('member');
  });

  it('returns 404 for invalid invite code', async () => {
    const res = await request(app)
      .post('/api/groups/join')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ inviteCode: 'BADCODE' });

    expect(res.status).toBe(404);
  });

  it('idempotent join — returns existing membership', async () => {
    const res = await request(app)
      .post('/api/groups/join')
      .set('Authorization', `Bearer ${memberToken}`)
      .send({ inviteCode });

    expect(res.status).toBe(200);
    expect(res.body.alreadyMember).toBe(true);
  });
});

describe('Groups API — GET /api/groups/:id/members', () => {
  it('returns all members for a group member', async () => {
    const res = await request(app)
      .get(`/api/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Group-Id', groupId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // owner + admin + member = 3
    expect(res.body.members.length).toBeGreaterThanOrEqual(3);
    const owner = res.body.members.find((m: any) => m.role === 'owner');
    expect(owner).toBeDefined();
  });

  it('returns 403 for outsider trying to list members', async () => {
    const res = await request(app)
      .get(`/api/groups/${groupId}/members`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .set('X-Group-Id', groupId);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_GROUP');
  });
});

describe('Groups API — PATCH /api/groups/:id/members/:mid (role update)', () => {
  let adminMerchantId: string;

  beforeAll(async () => {
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    adminMerchantId = meRes.body.merchant.id;
  });

  it('owner can elevate a member to admin', async () => {
    const res = await request(app)
      .patch(`/api/groups/${groupId}/members/${adminMerchantId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Group-Id', groupId)
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.membership.role).toBe('admin');
  });

  it('member cannot change another member role', async () => {
    const res = await request(app)
      .patch(`/api/groups/${groupId}/members/${adminMerchantId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Group-Id', groupId)
      .send({ role: 'member' });

    expect(res.status).toBe(403);
  });
});

describe('Groups API — POST /api/groups/:id/invite-code/rotate', () => {
  it('admin can rotate invite code', async () => {
    const res = await request(app)
      .post(`/api/groups/${groupId}/invite-code/rotate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Group-Id', groupId);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.inviteCode).toBeDefined();
    expect(res.body.inviteCode).not.toBe(inviteCode);
  });

  it('member cannot rotate invite code', async () => {
    const res = await request(app)
      .post(`/api/groups/${groupId}/invite-code/rotate`)
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Group-Id', groupId);

    expect(res.status).toBe(403);
  });
});

describe('Groups API — DELETE /api/groups/:id/members/:mid (leave/remove)', () => {
  it('member can leave the group (self-remove)', async () => {
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${memberToken}`);
    const memberId = meRes.body.merchant.id;

    const res = await request(app)
      .delete(`/api/groups/${groupId}/members/${memberId}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .set('X-Group-Id', groupId);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/removed/i);
  });

  it('owner cannot leave the group', async () => {
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`);
    const ownerId = meRes.body.merchant.id;

    const res = await request(app)
      .delete(`/api/groups/${groupId}/members/${ownerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Group-Id', groupId);

    expect(res.status).toBe(400);
  });
});

describe('Auth — GET /api/auth/me includes groups', () => {
  it('returns groups array with role for authenticated user', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.groups).toBeDefined();
    expect(Array.isArray(res.body.groups)).toBe(true);
    expect(res.body.groups[0].role).toBe('owner');
  });
});

describe('Auth — PATCH /api/auth/me', () => {
  it('updates name and phone', async () => {
    const res = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Updated Owner', phone: '+91-9876543210' });

    expect(res.status).toBe(200);
    expect(res.body.merchant.name).toBe('Updated Owner');
    expect(res.body.merchant.phone).toBe('+91-9876543210');
  });
});

describe('BE-07 — CRITICAL riskCategory accepted', () => {
  it('can create a risk assessment with CRITICAL riskCategory', async () => {
    const { RiskAssessment } = require('../src/models/RiskAssessment');
    const { Merchant } = require('../src/models/Merchant');

    const m = await Merchant.create({
      name: 'BE07Merchant',
      email: 'be07@test.com',
      passwordHash: 'testhash',
      riskProfile: { riskScore: 0.95, riskCategory: 'CRITICAL' },
    });

    expect(m.riskProfile.riskCategory).toBe('CRITICAL');

    const ra = await RiskAssessment.create({
      merchantId: m._id,
      lambdaRate: 0.9,
      riskScore: 0.95,
      riskCategory: 'CRITICAL',
      riskLabel: 'CRITICAL',
      coldStart: false,
      monthsObserved: 6,
      latePaymentEvents: 5,
      defaultEvents: 2,
    });

    expect(ra.riskCategory).toBe('CRITICAL');
    expect(ra.riskLabel).toBe('CRITICAL');
  });
});
