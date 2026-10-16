import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import {
  handleEngineError,
  createEngineClient,
  ENGINE_URL,
} from '../src/services/bridge/http';
import * as bridge from '../src/services/bridge';
import * as pythonBridge from '../src/services/pythonBridge';

describe('Bridge HTTP Client and Error Handling', () => {
  describe('handleEngineError', () => {
    it('maps network error (no response) to 503 statusCode', () => {
      const axiosError = new AxiosError('Network Error');
      axiosError.response = undefined;

      try {
        handleEngineError(axiosError);
        fail('Expected handleEngineError to throw');
      } catch (err: any) {
        expect(err.statusCode).toBe(503);
        expect(err.message).toContain('Python engine is unavailable');
      }
    });

    it('maps server response error to response status and detail message', () => {
      const axiosError = new AxiosError('Bad Request');
      axiosError.response = {
        status: 400,
        data: { detail: 'Validation failed in engine' },
        statusText: 'Bad Request',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      try {
        handleEngineError(axiosError);
        fail('Expected handleEngineError to throw');
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.message).toBe('Validation failed in engine');
      }
    });

    it('falls back to default error message when response detail is missing', () => {
      const axiosError = new AxiosError('Internal Error');
      axiosError.response = {
        status: 500,
        data: {},
        statusText: 'Internal Server Error',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
      };

      try {
        handleEngineError(axiosError);
        fail('Expected handleEngineError to throw');
      } catch (err: any) {
        expect(err.statusCode).toBe(500);
        expect(err.message).toBe('Python engine returned an error.');
      }
    });

    it('re-throws non-Axios errors unchanged', () => {
      const standardError = new Error('Generic failure');
      expect(() => handleEngineError(standardError)).toThrow('Generic failure');
    });
  });

  describe('createEngineClient', () => {
    it('configures axios instance with 8s timeout and ENGINE_URL', () => {
      const client = createEngineClient();
      expect(client.defaults.timeout).toBe(8000);
      expect(client.defaults.baseURL).toBe(ENGINE_URL);
    });

    it('retries once on network error when request fails without response', async () => {
      const client = createEngineClient();

      let attempts = 0;
      jest.spyOn(client, 'request').mockImplementation(async (config: any) => {
        attempts++;
        if (attempts === 1) {
          const networkError = new AxiosError('Network Error');
          networkError.config = config;
          networkError.response = undefined;
          // Trigger the interceptor logic
          const errorHandler = (client.interceptors.response as any).handlers[0]?.rejected;
          if (errorHandler) {
            return errorHandler(networkError);
          }
          throw networkError;
        }
        return {
          data: { status: 'success after retry' },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        } as AxiosResponse;
      });

      const response = await client.request({ url: '/test' } as InternalAxiosRequestConfig);
      expect(attempts).toBe(2);
      expect(response.data).toEqual({ status: 'success after retry' });
    });

    it('does not retry indefinitely on consecutive network errors', async () => {
      const client = createEngineClient();

      let attempts = 0;
      jest.spyOn(client, 'request').mockImplementation(async (config: any) => {
        attempts++;
        const networkError = new AxiosError('Network Error');
        networkError.config = config;
        networkError.response = undefined;
        const errorHandler = (client.interceptors.response as any).handlers[0]?.rejected;
        if (errorHandler) {
          return errorHandler(networkError);
        }
        throw networkError;
      });

      await expect(client.request({ url: '/test' } as InternalAxiosRequestConfig)).rejects.toThrow('Network Error');
      expect(attempts).toBe(2); // Initial attempt + 1 retry
    });
  });

  describe('Bridge re-exports', () => {
    it('re-exports all bridge methods from pythonBridge.ts', () => {
      expect(pythonBridge.callSettlement).toBe(bridge.callSettlement);
      expect(pythonBridge.callCycleDetection).toBe(bridge.callCycleDetection);
      expect(pythonBridge.callNetCycle).toBe(bridge.callNetCycle);
      expect(pythonBridge.callRiskScore).toBe(bridge.callRiskScore);
      expect(pythonBridge.callPortfolioRisk).toBe(bridge.callPortfolioRisk);
      expect(pythonBridge.handleEngineError).toBe(bridge.handleEngineError);
      expect(pythonBridge.http).toBe(bridge.http);
    });
  });
});
