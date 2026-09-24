import { Router } from 'express';
import { ingestSms, simulateSms, getIngestionFeed } from '../controllers/smsController.js';
import { authenticateToken, requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();

/**
 * POST /api/sms/ingest
 * Companion mobile app endpoint for real bank SMS ingestion.
 *
 * SECURITY: Authentication required.
 * - familyId is derived strictly from the authenticated JWT token.
 * - No unauthenticated family selection is permitted.
 * - Companion app must send: Authorization: Bearer <admin-or-companion-token>
 */
router.post('/ingest', authenticateToken, ingestSms);

// Admin-only endpoints
router.post('/simulate', authenticateToken, requireAdmin, simulateSms);
router.get('/feed', authenticateToken, requireAdmin, getIngestionFeed);

export default router;
