/**
 * hooks/useNotifications.ts — React Query hooks for Notifications domain (Slice C).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';
import { queryKeys } from '../api/keys';
import type { ListNotificationsParams } from '../api/contract';

export function useNotifications(params?: ListNotificationsParams) {
  return useQuery({
    queryKey: queryKeys.notifications.list(params),
    queryFn: () => api.notifications.list(params),
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    },
  });
}
