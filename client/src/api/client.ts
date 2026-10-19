/**
 * api/client.ts — Axios instance configured for Chetan's Express backend.
 *
 * This will be used once Chetan's Node.js backend is running on port 4000.
 * For now, all pages use mock data from data/seedData.ts.
 *
 * To switch from mock → real: import this client and replace the mock
 * function calls with actual API requests.
 */

import axios from "axios";

const API_BASE_URL = "http://localhost:4000/api";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach JWT token and X-Group-Id to every request (if available)
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("creditflow_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const activeGroup = localStorage.getItem("creditflow_active_group");
  if (activeGroup) {
    config.headers["X-Group-Id"] = activeGroup;
  }
  return config;
});

// Refresh token state
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Handle 401 responses with refresh token flow (once)
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (
        originalRequest.url?.includes("/auth/refresh") ||
        originalRequest.url?.includes("/auth/login")
      ) {
        return Promise.reject(error);
      }

      const refreshToken = localStorage.getItem("creditflow_refresh_token");
      if (!refreshToken) {
        localStorage.removeItem("creditflow_token");
        localStorage.removeItem("creditflow_refresh_token");
        localStorage.removeItem("creditflow_active_group");
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });
        const newAccessToken = data.accessToken;
        localStorage.setItem("creditflow_token", newAccessToken);
        if (data.refreshToken) {
          localStorage.setItem("creditflow_refresh_token", data.refreshToken);
        }
        apiClient.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem("creditflow_token");
        localStorage.removeItem("creditflow_refresh_token");
        localStorage.removeItem("creditflow_active_group");
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;

// ---------------------------------------------------------------------------
// API endpoints (connected to Chetan's Node.js backend on port 4000)
// ---------------------------------------------------------------------------

export const authAPI = {
  login: (email: string, password: string) =>
    apiClient.post("/auth/login", { email, password }),
  register: (name: string, email: string, password: string) =>
    apiClient.post("/auth/register", { name, email, password }),
  getMe: () => apiClient.get("/auth/me"),
};

export const merchantAPI = {
  getAll: () => apiClient.get("/merchants"),
  getById: (id: string) => apiClient.get(`/merchants/${id}`),
};

export const debtAPI = {
  getAll: (params?: { debtorId?: string; creditorId?: string; status?: string }) =>
    apiClient.get("/debts", { params }),
  create: (debtor: string, creditor: string, amount: number) =>
    apiClient.post("/debts", { debtor, creditor, amount }),
  update: (id: string, amount: number) =>
    apiClient.patch(`/debts/${id}`, { amount }),
  settle: (id: string) =>
    apiClient.delete(`/debts/${id}`),
};

export const settlementAPI = {
  compute: () => apiClient.post("/settlement"),
  getCycles: () => apiClient.post("/settlement/cycles"),
  netCycle: (cycle: string[]) =>
    apiClient.post("/settlement/net-cycle", { cycle }),
  confirm: (batchId: string) =>
    apiClient.post(`/settlement/confirm/${batchId}`),
};

export const riskAPI = {
  getPortfolio: () => apiClient.post("/risk/portfolio"),
  getMerchantScore: (merchantId: string) =>
    apiClient.get(`/risk/score/${merchantId}`),
  scoreMerchant: (merchantId: string, history: Array<{ late: boolean; default: boolean }>) =>
    apiClient.post(`/risk/score/${merchantId}`, { history }),
};

