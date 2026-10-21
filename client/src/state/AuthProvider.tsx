/**
 * state/AuthProvider.tsx
 * Provides authenticated merchant context throughout the app.
 * Reads the real user from GET /api/auth/me on mount and on token change.
 *
 * FE-04: Removes hardcoded 'Parth Goggi' user; reads from real API (or mock).
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Group } from '../types';
import apiClient from '../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthMerchant {
  id: string;
  name: string;
  email: string;
  phone?: string;
  businessName?: string;
  riskProfile?: {
    riskScore: number;
    riskCategory: string;
    lastUpdated: string;
  };
}

export interface AuthGroupEntry extends Omit<Group, '_id'> {
  _id: string;
  role: 'owner' | 'admin' | 'member';
}

interface AuthContextValue {
  merchant: AuthMerchant | null;
  groups: AuthGroupEntry[];
  isLoading: boolean;
  isAuthenticated: boolean;
  reload: () => void;
  logout: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  merchant: null,
  groups: [],
  isLoading: false,
  isAuthenticated: false,
  reload: () => {},
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [merchant, setMerchant] = useState<AuthMerchant | null>(null);
  const [groups, setGroups] = useState<AuthGroupEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const isAuthenticated = !!merchant;

  const fetchMe = useCallback(async () => {
    const token = localStorage.getItem('creditflow_token');
    if (!token) {
      setMerchant(null);
      setGroups([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const res = await apiClient.get('/auth/me');
      const data = res.data;
      setMerchant(data.merchant ?? null);
      setGroups(data.groups ?? []);
    } catch {
      // Token invalid or expired — clear state
      setMerchant(null);
      setGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('creditflow_token');
    localStorage.removeItem('creditflow_refresh_token');
    localStorage.removeItem('creditflow_active_group');
    setMerchant(null);
    setGroups([]);
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Handle mid-session token expiry event
  useEffect(() => {
    const handleAuthExpired = () => {
      setMerchant(null);
      setGroups([]);
    };
    window.addEventListener('creditflow:auth-expired', handleAuthExpired);
    return () => {
      window.removeEventListener('creditflow:auth-expired', handleAuthExpired);
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        merchant,
        groups,
        isLoading,
        isAuthenticated,
        reload: fetchMe,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
