import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

// General API rate limiter
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests from this IP, please try again later.' },
});

// Failed PIN login attempt tracker per childId
interface FailedAttemptInfo {
  count: number;
  lockoutUntil: number;
}

const failedPinAttempts = new Map<string, FailedAttemptInfo>();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes cooldown

export function checkChildPinRateLimit(req: Request, res: Response, next: NextFunction): void {
  const { childId } = req.body;
  if (!childId) {
    next();
    return;
  }

  const now = Date.now();
  const info = failedPinAttempts.get(childId);

  if (info && info.lockoutUntil > now) {
    const remainingSeconds = Math.ceil((info.lockoutUntil - now) / 1000);
    res.status(429).json({
      success: false,
      message: `Account temporarily locked due to 5 consecutive wrong PIN attempts. Please try again in ${remainingSeconds} seconds.`,
    });
    return;
  }

  next();
}

export function recordFailedPinAttempt(childId: string): void {
  const now = Date.now();
  const info = failedPinAttempts.get(childId) || { count: 0, lockoutUntil: 0 };
  info.count += 1;

  if (info.count >= MAX_FAILED_ATTEMPTS) {
    info.lockoutUntil = now + LOCKOUT_DURATION_MS;
    info.count = 0; // Reset counter after locking out
  }

  failedPinAttempts.set(childId, info);
}

export function resetPinAttempts(childId: string): void {
  failedPinAttempts.delete(childId);
}
