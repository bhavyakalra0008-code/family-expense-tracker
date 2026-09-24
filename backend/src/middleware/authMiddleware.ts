import { Request, Response, NextFunction } from 'express';
import { verifyToken, UserTokenPayload } from '../utils/jwt.js';

export interface AuthenticatedRequest extends Request {
  user?: UserTokenPayload;
}

/**
 * Middleware to verify JWT token in Authorization header.
 * Header format: Bearer <token>
 */
export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    res.status(401).json({ success: false, message: 'Authentication token required.' });
    return;
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid or expired authentication token.' });
    return;
  }
}

/**
 * Middleware to enforce Admin role.
 */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Forbidden: Admin access required.' });
    return;
  }
  next();
}

/**
 * Middleware to enforce Child role.
 */
export function requireChild(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'child') {
    res.status(403).json({ success: false, message: 'Forbidden: Child access required.' });
    return;
  }
  next();
}
