import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('❌ Error caught by global handler:', err);

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const issues = err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: issues,
    });
    return;
  }

  // Handle Prisma Database errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation (e.g. email or last4 in family)
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[]) || [];
      res.status(409).json({
        success: false,
        message: `Conflict error: Unique constraint failed on field(s): ${target.join(', ')}`,
      });
      return;
    }
  }

  // Default response
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
  });
}
