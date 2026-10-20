import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getPreferences,
  updatePreferences,
} from '../controllers/notification.controller';

const router = Router();

router.use(requireAuth);

router.get('/', getNotifications);
router.get('/preferences', getPreferences);
router.patch('/preferences', updatePreferences);
router.patch('/:id/read', markNotificationRead);
router.post('/read-all', markAllNotificationsRead);

export default router;
