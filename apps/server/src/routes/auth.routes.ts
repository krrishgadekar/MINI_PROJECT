import { Router } from 'express';
import { register, login, refresh, getMe, updateMe } from '../controllers/auth.controller';
import { protect } from '../middleware/auth.middleware';

export const authRouter = Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/refresh', refresh);
authRouter.get('/me', protect, getMe);
authRouter.patch('/me', protect, updateMe);
