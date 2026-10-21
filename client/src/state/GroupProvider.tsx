/**
 * state/GroupProvider.tsx
 * Manages the active group selection and persists it in localStorage.
 * Adds X-Group-Id header to all axios requests via an interceptor.
 *
 * FE-03: Group switcher — the active group is stored in localStorage
 * and injected into every API call.
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import type { AuthGroupEntry } from './AuthProvider';

// ── Types ─────────────────────────────────────────────────────────────────────

interface GroupContextValue {
  activeGroupId: string | null;
  activeGroup: AuthGroupEntry | null;
  setActiveGroup: (groupId: string) => void;
  clearActiveGroup: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const GroupContext = createContext<GroupContextValue>({
  activeGroupId: null,
  activeGroup: null,
  setActiveGroup: () => {},
  clearActiveGroup: () => {},
});

export function useGroup() {
  return useContext(GroupContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'creditflow_active_group';

interface GroupProviderProps {
  groups: AuthGroupEntry[];
  children: React.ReactNode;
}

export function GroupProvider({ groups, children }: GroupProviderProps) {
  const [activeGroupId, setActiveGroupId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY) ?? null;
  });

  // Keep a ref to the current interceptor ID so we can eject before adding a new one
  const interceptorIdRef = useRef<number | null>(null);

  const activeGroup = groups.find((g) => g._id === activeGroupId) ?? null;

  // Auto-select first group if nothing is selected and groups are loaded
  useEffect(() => {
    if (!activeGroupId && groups.length > 0) {
      const firstId = groups[0]._id;
      setActiveGroupId(firstId);
      localStorage.setItem(STORAGE_KEY, firstId);
    }
  }, [activeGroupId, groups]);

  // Install axios interceptor for X-Group-Id header
  useEffect(() => {
    // Eject previous interceptor
    if (interceptorIdRef.current !== null) {
      apiClient.interceptors.request.eject(interceptorIdRef.current);
    }

    const id = apiClient.interceptors.request.use((config) => {
      if (activeGroupId) {
        config.headers['X-Group-Id'] = activeGroupId;
      }
      return config;
    });

    interceptorIdRef.current = id;

    return () => {
      apiClient.interceptors.request.eject(id);
    };
  }, [activeGroupId]);

  const queryClient = useQueryClient();

  const setActiveGroup = useCallback((groupId: string) => {
    setActiveGroupId(groupId);
    localStorage.setItem(STORAGE_KEY, groupId);
    queryClient.clear();
  }, [queryClient]);

  const clearActiveGroup = useCallback(() => {
    setActiveGroupId(null);
    localStorage.removeItem(STORAGE_KEY);
    queryClient.clear();
  }, [queryClient]);

  return (
    <GroupContext.Provider
      value={{ activeGroupId, activeGroup, setActiveGroup, clearActiveGroup }}
    >
      {children}
    </GroupContext.Provider>
  );
}
