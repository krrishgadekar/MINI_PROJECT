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
// API endpoints (to be used once Chetan's backend is ready)
// ---------------------------------------------------------------------------

export const authAPI = {
  login: (email: string, password: string) =>
    apiClient.post("/auth/login", { email, password }),
  register: (name: string, email: string, password: string) =>
    apiClient.post("/auth/register", { name, email, password }),
};

export const debtAPI = {
  getAll: () => apiClient.get("/debts"),
  create: (debtor: string, creditor: string, amount: number) =>
    apiClient.post("/debts", { debtor, creditor, amount }),
};

export const settlementAPI = {
  compute: () => apiClient.post("/settlement"),
  getCycles: () => apiClient.get("/settlement/cycles"),
  netCycle: (cycle: string[]) =>
    apiClient.post("/settlement/net-cycle", { cycle }),
};

export const riskAPI = {
  getPortfolio: () => apiClient.get("/risk/portfolio"),
  getMerchantScore: (merchantId: string) =>
    apiClient.get(`/risk/score/${merchantId}`),
};
