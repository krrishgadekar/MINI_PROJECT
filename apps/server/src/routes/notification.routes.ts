import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../controllers/notification.controller';

const router = Router();

router.use(requireAuth);

router.get('/', getNotifications);
router.patch('/:id/read', markNotificationRead);
router.post('/read-all', markAllNotificationsRead);

export default router;
