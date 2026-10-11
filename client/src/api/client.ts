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

// Attach JWT token to every request (if available)
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("creditflow_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses (expired token)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("creditflow_token");
      window.location.href = "/login";
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

