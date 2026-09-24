import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Log the error for server-side diagnostics.
  // SECURITY: Log only message and code, not the full error object which may contain
  // sensitive values (DATABASE_URL from Prisma errors, tokens, etc.)
  const safeLogMessage = err instanceof Error ? err.message : String(err);
  const safeCode = err.code ?? err.statusCode ?? err.status ?? 'UNKNOWN';
  console.error(`❌ [ErrorHandler] code=${safeCode} message=${safeLogMessage}`);

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
  if (err instanceof PrismaClientKnownRequestError) {
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

  // Default response — return only statusCode and a safe message string
  // SECURITY: Never reflect the raw error object or stack trace to the client
  const statusCode = err.statusCode || err.status || 500;
  const isServerError = statusCode >= 500;

  // In production, do not send internal error details to the client
  const message = isServerError && process.env.NODE_ENV === 'production'
    ? 'An internal server error occurred.'
    : (err.message || 'Internal Server Error');

  res.status(statusCode).json({
    success: false,
    message,
  });
}
