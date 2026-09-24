import { Router } from 'express';
import { getTransactions } from '../controllers/transactionController.js';
import { authenticateToken } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', authenticateToken, getTransactions);

export default router;
