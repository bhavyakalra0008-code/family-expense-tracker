import { Router } from 'express';
import { registerAdmin, adminLogin, getFamilies, getChildProfiles, childLogin, requestPasswordReset, resetPassword, requestPinReset } from '../controllers/authController.js';
import { checkChildPinRateLimit } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', registerAdmin);
router.post('/admin/login', adminLogin);
router.post('/admin/forgot-password', requestPasswordReset);
router.post('/admin/reset-password', resetPassword);
router.get('/families', getFamilies);
router.get('/child/profiles', getChildProfiles);
router.post('/child/login', checkChildPinRateLimit, childLogin);
router.post('/child/forgot-pin', requestPinReset);

export default router;
