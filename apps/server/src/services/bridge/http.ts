import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

export const ENGINE_URL = process.env.PYTHON_ENGINE_URL ?? 'http://localhost:8000';

// ── Helper: translate 503 when Python engine is down ────────────────────────
export const handleEngineError = (error: unknown): never => {
  if (error instanceof AxiosError) {
    if (!error.response) {
      const err = new Error('Python engine is unavailable. Please start it on port 8000.') as Error & { statusCode: number };
      err.statusCode = 503;
      throw err;
    }
    const err = new Error(error.response.data?.detail ?? 'Python engine returned an error.') as Error & { statusCode: number };
    err.statusCode = error.response.status;
    throw err;
  }
  throw error;
};

// ── Create configured Axios instance with 8s timeout and single network-error retry
export const createEngineClient = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: ENGINE_URL,
    timeout: 8000,
  });

  const client = instance ?? axios;

  if (client?.interceptors?.response?.use) {
    client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const config = error?.config as (InternalAxiosRequestConfig & { _retryCount?: number }) | undefined;
        // Retry once on network error (no response received from server)
        if (!error?.response && config && (config._retryCount ?? 0) < 1) {
          config._retryCount = (config._retryCount ?? 0) + 1;
          return client.request(config);
        }
        return Promise.reject(error);
      }
    );
  }

  return client;
};

export const http: AxiosInstance = createEngineClient();
