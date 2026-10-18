import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Notification } from '../models/Notification';
import { Types } from 'mongoose';

/**
 * GET /api/notifications
 * Paginated list of notifications for the authenticated merchant.
 * Query params: ?page=1&limit=20&unread=true
 */
export const getNotifications = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 20));
    const unreadOnly = req.query.unread === 'true';

    const merchantId = req.merchant?.id || (req as any).user?.id;
    const filter: any = {};

    if (merchantId && Types.ObjectId.isValid(merchantId)) {
      filter.merchantId = new Types.ObjectId(merchantId);
    }

    if (unreadOnly) {
      filter.readAt = null;
    }

    const [total, unreadCount, docs] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.countDocuments({
        ...(merchantId && Types.ObjectId.isValid(merchantId)
          ? { merchantId: new Types.ObjectId(merchantId) }
          : {}),
        readAt: null,
      }),
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const notifications = docs.map((doc: any) => ({
      id: doc._id.toString(),
      groupId: doc.groupId?.toString(),
      merchantId: doc.merchantId?.toString(),
      type: doc.type,
      message: doc.message,
      refType: doc.refType,
      refId: doc.refId?.toString(),
      readAt: doc.readAt,
      createdAt: doc.createdAt,
    }));

    res.json({
      success: true,
      notifications,
      total,
      unreadCount,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read.
 */
export const markNotificationRead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;
    if (!Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid notification ID' });
      return;
    }

    const notification = await Notification.findByIdAndUpdate(
      id,
      { $set: { readAt: new Date() } },
      { new: true },
    );

    if (!notification) {
      res.status(404).json({ success: false, message: 'Notification not found' });
      return;
    }

    res.json({
      success: true,
      notification: {
        id: notification._id.toString(),
        readAt: notification.readAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/notifications/read-all
 * Mark all notifications for the authenticated merchant as read.
 */
export const markAllNotificationsRead = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const merchantId = req.merchant?.id || (req as any).user?.id;
    const filter: any = { readAt: null };

    if (merchantId && Types.ObjectId.isValid(merchantId)) {
      filter.merchantId = new Types.ObjectId(merchantId);
    }

    const result = await Notification.updateMany(filter, {
      $set: { readAt: new Date() },
    });

    res.json({
      success: true,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    next(error);
  }
};
