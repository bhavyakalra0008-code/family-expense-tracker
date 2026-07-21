import { Router } from 'express';
import { registerAdmin, adminLogin, getChildProfiles, childLogin } from '../controllers/authController.js';
import { checkChildPinRateLimit } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', registerAdmin);
router.post('/admin/login', adminLogin);
router.get('/child/profiles', getChildProfiles);
router.post('/child/login', checkChildPinRateLimit, childLogin);

export default router;
