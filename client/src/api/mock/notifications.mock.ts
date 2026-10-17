/**
 * api/mock/notifications.mock.ts — Mock Implementation for Notifications Domain (Slice C)
 *
 * In-memory notification store with read/unread tracking.
 */

import type { Notification } from '../../types';
import type {
  NotificationsResponse,
  NotificationResponse,
  MarkAllReadResponse,
  ListNotificationsParams,
} from '../contract';

let inMemoryNotifications: Notification[] = [
  {
    id: 'notif-1',
    type: 'risk:flagged',
    message: 'Supplier_C has exceeded risk threshold (score: 0.527)',
    refType: 'RiskAssessment',
    refId: 'Supplier_C',
    readAt: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 mins ago
  },
  {
    id: 'notif-2',
    type: 'debt:confirmed',
    message: 'Wholesale_A confirmed ₹20,000 debt note',
    refType: 'Debt',
    refId: 'debt-3',
    readAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 'notif-3',
    type: 'cycle:netted',
    message: 'Circular cycle [Retailer_B -> Wholesale_A -> Vendor_D] netted ₹20,000',
    refType: 'Settlement',
    readAt: null,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
  },
];

export const notificationsMock = {
  list: async (params?: ListNotificationsParams): Promise<NotificationsResponse> => {
    let items = [...inMemoryNotifications];
    if (params?.unreadOnly) {
      items = items.filter((n) => !n.readAt);
    }
    const unreadCount = inMemoryNotifications.filter((n) => !n.readAt).length;

    return {
      success: true,
      count: items.length,
      unreadCount,
      notifications: items,
    };
  },

  markRead: async (id: string): Promise<NotificationResponse> => {
    const item = inMemoryNotifications.find((n) => n.id === id);
    if (item) {
      item.readAt = new Date().toISOString();
    }
    return {
      success: true,
      notification: item ?? {
        id,
        type: 'info',
        message: 'Notification marked read',
        createdAt: new Date().toISOString(),
        readAt: new Date().toISOString(),
      },
    };
  },

  markAllRead: async (): Promise<MarkAllReadResponse> => {
    let markedCount = 0;
    const now = new Date().toISOString();
    inMemoryNotifications.forEach((n) => {
      if (!n.readAt) {
        n.readAt = now;
        markedCount++;
      }
    });

    return {
      success: true,
      markedCount,
    };
  },
};
