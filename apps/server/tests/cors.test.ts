import { getClientOrigins } from '../src/config/cors';

describe('CORS Configuration — getClientOrigins', () => {
  const originalEnv = process.env.CLIENT_ORIGINS;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CLIENT_ORIGINS = originalEnv;
    } else {
      delete process.env.CLIENT_ORIGINS;
    }
  });

  it('defaults to localhost:3000 and localhost:4000 when CLIENT_ORIGINS is not set', () => {
    delete process.env.CLIENT_ORIGINS;
    expect(getClientOrigins()).toEqual(['http://localhost:3000', 'http://localhost:4000']);
  });

  it('defaults when CLIENT_ORIGINS is empty string', () => {
    process.env.CLIENT_ORIGINS = '';
    expect(getClientOrigins()).toEqual(['http://localhost:3000', 'http://localhost:4000']);
  });

  it('parses single origin correctly', () => {
    process.env.CLIENT_ORIGINS = 'https://app.creditflow.io';
    expect(getClientOrigins()).toEqual(['https://app.creditflow.io']);
  });

  it('parses multiple comma-separated origins and trims whitespace', () => {
    process.env.CLIENT_ORIGINS = 'http://localhost:5173, https://app.creditflow.io,  http://localhost:3000 ';
    expect(getClientOrigins()).toEqual([
      'http://localhost:5173',
      'https://app.creditflow.io',
      'http://localhost:3000',
    ]);
  });

  it('filters out empty origin items caused by trailing or double commas', () => {
    process.env.CLIENT_ORIGINS = 'http://localhost:5173, , http://localhost:4000,';
    expect(getClientOrigins()).toEqual([
      'http://localhost:5173',
      'http://localhost:4000',
    ]);
  });
});
