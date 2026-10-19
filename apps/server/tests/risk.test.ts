import 'dotenv/config';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { Merchant } from '../src/models/Merchant';
import axios from 'axios';
import { createMemoryServer } from './setup';

jest.mock('../src/realtime/socket', () => ({
  getIO: () => ({
    emit: jest.fn(),
  }),
}));

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const app = createApp();
let mongoServer: MongoMemoryServer;
let accessToken: string;
let merchantId: string;

jest.setTimeout(60000);

beforeAll(async () => {
  mongoServer = await createMemoryServer();
  await mongoose.connect(mongoServer.getUri());

  const merchant = await Merchant.create({
    name: 'Vendor_D',
    email: 'vendor.d@demo.com',
    passwordHash: 'hash123',
  });
  merchantId = (merchant._id as mongoose.Types.ObjectId).toString();

  const res = await request(app).post('/api/auth/register').send({
    name: 'Admin_User',
    email: 'admin.risk@demo.com',
    password: 'password123',
  });
  accessToken = res.body.accessToken;
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});



describe('Risk API', () => {
  it('POST /api/risk/score/:merchantId - computes and saves merchant risk score', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        merchant_id: 'Vendor_D',
        months_observed: 6,
        late_payment_events: 3,
        default_events: 0,
        lambda_rate: 0.5,
        risk_score: 0.3935,
        risk_category: 'MEDIUM',
        model: 'Poisson',
        cold_start: false,
      },
    });

    const res = await request(app)
      .post(`/api/risk/score/${merchantId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        history: [
          { late: true, default: false },
          { late: true, default: false },
          { late: false, default: false },
          { late: false, default: false },
          { late: true, default: false },
          { late: false, default: false },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.assessment.risk_score).toBe(0.3935);
    expect(res.body.assessment.risk_category).toBe('MEDIUM');
    expect(res.body.assessmentId).toBeDefined();

    // Verify merchant document updated
    const updated = await Merchant.findById(merchantId);
    expect(updated?.riskProfile.riskScore).toBe(0.3935);
    expect(updated?.riskProfile.riskCategory).toBe('MEDIUM');
  });

  it('GET /api/risk/score/:merchantId - retrieves latest risk assessment', async () => {
    const res = await request(app)
      .get(`/api/risk/score/${merchantId}`)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.merchant.id).toBe(merchantId);
    expect(res.body.latestAssessment.riskScore).toBe(0.3935);
    expect(res.body.latestAssessment.riskCategory).toBe('MEDIUM');
  });

  it('POST /api/risk/portfolio - scores full portfolio', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        merchants: 2,
        portfolio_average_risk: 0.25,
        profiles: [
          {
            merchant_id: 'Vendor_D',
            months_observed: 6,
            late_payment_events: 3,
            default_events: 0,
            lambda_rate: 0.5,
            risk_score: 0.3935,
            risk_category: 'MEDIUM',
            model: 'Poisson',
            cold_start: false,
          },
        ],
      },
    });

    const res = await request(app)
      .post('/api/risk/portfolio')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.portfolio.portfolio_average_risk).toBe(0.25);
  });

  it('BE-07: correctly persists CRITICAL risk category from Python engine', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        merchant_id: 'Vendor_D',
        months_observed: 12,
        late_payment_events: 10,
        default_events: 4,
        lambda_rate: 1.8,
        risk_score: 0.95,
        risk_category: 'CRITICAL',
        model: 'Poisson',
        cold_start: false,
      },
    });

    const res = await request(app)
      .post(`/api/risk/score/${merchantId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        history: [
          { late: true, default: true },
          { late: true, default: false },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.assessment.risk_category).toBe('CRITICAL');

    const updated = await Merchant.findById(merchantId);
    expect(updated?.riskProfile.riskCategory).toBe('CRITICAL');
  });
});
