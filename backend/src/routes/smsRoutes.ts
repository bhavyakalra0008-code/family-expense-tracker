import { Router } from 'express';
import { ingestSms, simulateSms, getIngestionFeed } from '../controllers/smsController.js';
import { authenticateToken, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();

// Endpoint for mobile companion app (can be called with optional auth / familyId)
router.post('/ingest', ingestSms);

// Admin only endpoints
router.post('/simulate', authenticateToken, requireAdmin, simulateSms);
router.get('/feed', authenticateToken, requireAdmin, getIngestionFeed);

export default router;
