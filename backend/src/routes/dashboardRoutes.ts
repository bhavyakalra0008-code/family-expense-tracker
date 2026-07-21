import { Router } from 'express';
import { getAdminDashboard, getChildDashboard } from '../controllers/dashboardController.js';
import { authenticateToken, requireAdmin, requireChild } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/admin', authenticateToken, requireAdmin, getAdminDashboard);
router.get('/child', authenticateToken, requireChild, getChildDashboard);

export default router;
