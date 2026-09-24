import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { parseSmsText } from '../services/smsParser.js';

const IngestSmsSchema = z.object({
  text: z.string().optional(),
  rawText: z.string().optional(),
}).refine((data) => data.text || data.rawText, {
  message: 'SMS text (field "text" or "rawText") is required',
});

export async function processSmsInference(familyId: string, rawText: string) {
  const parseResult = parseSmsText(rawText);

  if (!parseResult.success) {
    const smsLog = await prisma.smsIngestionLog.create({
      data: {
        familyId,
        rawText,
        matched: false,
        rejectionReason: parseResult.reason,
      },
    });

    return {
      success: false,
      reason: parseResult.reason,
      smsLogId: smsLog.id,
    };
  }

  const { amount, last4, vendor, category } = parseResult;

  // Match child by familyId and last4 — always scoped to the authenticated family
  const matchedChild = await prisma.child.findUnique({
    where: {
      familyId_accountLast4: {
        familyId,
        accountLast4: last4!,
      },
    },
  });

  if (!matchedChild) {
    const rejectionReason = `No child is linked to account ending ${last4}.`;
    const smsLog = await prisma.smsIngestionLog.create({
      data: {
        familyId,
        rawText,
        matched: false,
        amount,
        vendor,
        rejectionReason,
      },
    });

    return {
      success: false,
      reason: rejectionReason,
      amount,
      vendor,
      last4,
      smsLogId: smsLog.id,
    };
  }

  // Record matched ingestion log & transaction atomically
  const [smsLog, transaction] = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const log = await tx.smsIngestionLog.create({
      data: {
        familyId,
        rawText,
        matched: true,
        childId: matchedChild.id,
        amount,
        vendor,
      },
    });

    const trx = await tx.transaction.create({
      data: {
        childId: matchedChild.id,
        familyId,
        amount: amount!,
        vendor: vendor!,
        category: category!,
        date: new Date(),
        rawSmsId: log.id,
      },
    });

    return [log, trx];
  });

  return {
    success: true,
    child: {
      id: matchedChild.id,
      name: matchedChild.name,
    },
    amount,
    vendor,
    category,
    last4,
    transactionId: transaction.id,
    smsLogId: smsLog.id,
  };
}

/**
 * Endpoint for companion mobile app or device ingestion.
 *
 * SECURITY: Authentication is REQUIRED.
 * - familyId is derived exclusively from the authenticated JWT token.
 * - Client-supplied familyId body fields are ignored to prevent IDOR attacks.
 * - An unauthenticated request always receives a 401 Unauthorized response.
 * - No fallback to "first family in database" is permitted.
 */
export async function ingestSms(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Authentication is enforced at the route level (authenticateToken middleware).
    // req.user is guaranteed to be set here; this guard is a belt-and-suspenders check.
    if (!req.user?.familyId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. Provide a valid Bearer token to ingest SMS.',
      });
      return;
    }

    const body = IngestSmsSchema.parse(req.body);
    const rawText = body.text || body.rawText!;

    // SECURITY: familyId comes ONLY from the authenticated token — never from client body or headers
    const familyId = req.user.familyId;

    const result = await processSmsInference(familyId, rawText);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Admin testing endpoint — In-app "Simulate SMS" panel
 */
export async function simulateSms(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = IngestSmsSchema.parse(req.body);
    const rawText = body.text || body.rawText!;
    const familyId = req.user!.familyId;

    const result = await processSmsInference(familyId, rawText);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Admin Audit Trail / Ingestion Feed
 */
export async function getIngestionFeed(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const familyId = req.user!.familyId;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.smsIngestionLog.findMany({
        where: { familyId },
        include: {
          child: {
            select: { id: true, name: true, accountLast4: true },
          },
        },
        orderBy: { receivedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.smsIngestionLog.count({ where: { familyId } }),
    ]);

    res.status(200).json({
      success: true,
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}
