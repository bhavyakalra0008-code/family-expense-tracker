import { Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

export async function getTransactions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user!;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);
    const skip = (page - 1) * limit;

    const vendorFilter = req.query.vendor as string | undefined;
    const startDateFilter = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDateFilter = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    // Build Prisma query condition
    const where: any = {
      familyId: user.familyId,
    };

    if (user.role === 'child') {
      // Child can ONLY view their own transactions — ALWAYS derive from token!
      where.childId = user.id;
    } else if (user.role === 'admin' && req.query.childId) {
      // Admin can optionally filter by childId
      where.childId = req.query.childId as string;
    }

    if (vendorFilter) {
      where.vendor = {
        contains: vendorFilter,
        mode: 'insensitive',
      };
    }

    if (startDateFilter || endDateFilter) {
      where.date = {};
      if (startDateFilter) where.date.gte = startDateFilter;
      if (endDateFilter) where.date.lte = endDateFilter;
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          child: {
            select: { id: true, name: true, colorTag: true },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      transactions: transactions.map((t) => ({
        id: t.id,
        childId: t.childId,
        childName: t.child.name,
        childColor: t.child.colorTag,
        amount: t.amount,
        vendor: t.vendor,
        category: t.category,
        date: t.date,
        rawSmsId: t.rawSmsId,
      })),
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
