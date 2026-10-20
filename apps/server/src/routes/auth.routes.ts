import { Router } from 'express';
import {
  register,
  login,
  refresh,
  getMe,
  updateMe,
  changePassword,
  getSessions,
  revokeSession,
} from '../controllers/auth.controller';
import { protect } from '../middleware/auth.middleware';

export const authRouter = Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/refresh', refresh);
authRouter.get('/me', protect, getMe);
authRouter.patch('/me', protect, updateMe);
authRouter.post('/change-password', protect, changePassword);
authRouter.get('/sessions', protect, getSessions);
authRouter.delete('/sessions/:id', protect, revokeSession);

