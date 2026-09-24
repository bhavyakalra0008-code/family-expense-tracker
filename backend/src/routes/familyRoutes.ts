import { Router } from 'express';
import { getChildren, addChild, updateChild, removeChild, getPinResetRequests, resolvePinResetRequest } from '../controllers/familyController.js';
import { authenticateToken, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();

router.use(authenticateToken, requireAdmin);

router.get('/children', getChildren);
router.post('/children', addChild);
router.patch('/children/:id', updateChild);
router.delete('/children/:id', removeChild);
router.get('/pin-reset-requests', getPinResetRequests);
router.post('/pin-reset-requests/:id/resolve', resolvePinResetRequest);

export default router;
