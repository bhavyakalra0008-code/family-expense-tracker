import { Router } from 'express';
import { getChildren, addChild, updateChild } from '../controllers/familyController.js';
import { authenticateToken, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/children', getChildren);
router.post('/children', addChild);
router.patch('/children/:id', updateChild);

export default router;
