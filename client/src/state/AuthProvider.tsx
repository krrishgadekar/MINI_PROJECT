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
  isSwitching: boolean;
  isAuthenticated: boolean;
  reload: () => Promise<void>;
  logout: () => void;
  switchMerchant: (email: string) => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  merchant: null,
  groups: [],
  isLoading: false,
  isSwitching: false,
  isAuthenticated: false,
  reload: async () => {},
  logout: () => {},
  switchMerchant: async () => {},
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

  const [isSwitching, setIsSwitching] = useState<boolean>(false);

  const switchMerchant = useCallback(async (email: string) => {
    try {
      setIsSwitching(true);
      const res = await apiClient.post('/auth/login', {
        email,
        password: 'CreditFlow@123',
      });
      const { accessToken, refreshToken, merchant: newMerchant } = res.data;
      if (accessToken) {
        localStorage.setItem('creditflow_token', accessToken);
        if (refreshToken) {
          localStorage.setItem('creditflow_refresh_token', refreshToken);
        }
        const meRes = await apiClient.get('/auth/me');
        const userGroups = meRes.data.groups ?? [];
        setMerchant(meRes.data.merchant ?? newMerchant ?? null);
        setGroups(userGroups);

        const crawford = userGroups.find(
          (g: any) =>
            g._id === '6ad99888e5b5dd4529e55719' ||
            g.name?.toLowerCase().includes('crawford'),
        );
        if (crawford) {
          localStorage.setItem('creditflow_active_group', crawford._id);
        } else if (userGroups.length > 0) {
          localStorage.setItem('creditflow_active_group', userGroups[0]._id);
        }
        window.dispatchEvent(new Event('creditflow:group-changed'));
      }
    } catch (err: any) {
      console.error('Failed to switch merchant:', err);
      throw err;
    } finally {
      setIsSwitching(false);
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
        isSwitching,
        isAuthenticated,
        reload: fetchMe,
        logout,
        switchMerchant,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
