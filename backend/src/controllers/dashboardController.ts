import { Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

/**
 * Returns start and end Date objects for the current calendar month.
 */
function getCurrentMonthBounds() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { startOfMonth, endOfMonth };
}

export async function getAdminDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const familyId = req.user!.familyId;
    const { startOfMonth, endOfMonth } = getCurrentMonthBounds();

    // Fetch children in family
    const children = await prisma.child.findMany({
      where: { familyId },
      select: {
        id: true,
        name: true,
        accountLast4: true,
        monthlyLimit: true,
        colorTag: true,
      },
      orderBy: { name: 'asc' },
    });

    // Fetch transactions for current calendar month
    const currentMonthTransactions = await prisma.transaction.findMany({
      where: {
        familyId,
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      include: {
        child: {
          select: { id: true, name: true, colorTag: true },
        },
      },
      orderBy: { date: 'desc' },
    });

    // Compute aggregates
    const totalFamilySpend = currentMonthTransactions.reduce((sum, t) => sum + t.amount, 0);
    const totalFamilyBudget = children.reduce((sum, c) => sum + c.monthlyLimit, 0);
    const remainingFamilyBudget = Math.max(0, totalFamilyBudget - totalFamilySpend);

    // Child spend breakdown
    const childSpendMap = new Map<string, number>();
    currentMonthTransactions.forEach((t) => {
      childSpendMap.set(t.childId, (childSpendMap.get(t.childId) || 0) + t.amount);
    });

    const childrenBreakdown = children.map((c) => {
      const spend = childSpendMap.get(c.id) || 0;
      const isOverLimit = spend > c.monthlyLimit;
      return {
        id: c.id,
        name: c.name,
        accountLast4: c.accountLast4,
        colorTag: c.colorTag,
        monthlyLimit: c.monthlyLimit,
        currentMonthSpend: spend,
        remainingLimit: Math.max(0, c.monthlyLimit - spend),
        isOverLimit,
        status: isOverLimit ? 'OVER_LIMIT' : 'ON_TRACK',
      };
    });

    // Vendor breakdown
    const vendorSpendMap = new Map<string, { totalSpend: number; category: string }>();
    currentMonthTransactions.forEach((t) => {
      const existing = vendorSpendMap.get(t.vendor) || { totalSpend: 0, category: t.category };
      existing.totalSpend += t.amount;
      vendorSpendMap.set(t.vendor, existing);
    });

    const vendorBreakdown = Array.from(vendorSpendMap.entries()).map(([vendor, data]) => ({
      vendor,
      category: data.category,
      totalSpend: data.totalSpend,
    })).sort((a, b) => b.totalSpend - a.totalSpend);

    // Category breakdown
    const categorySpendMap = new Map<string, number>();
    currentMonthTransactions.forEach((t) => {
      categorySpendMap.set(t.category, (categorySpendMap.get(t.category) || 0) + t.amount);
    });

    const categoryBreakdown = Array.from(categorySpendMap.entries()).map(([category, totalSpend]) => ({
      category,
      totalSpend,
    })).sort((a, b) => b.totalSpend - a.totalSpend);

    // Recent activity feed (latest 10)
    const recentActivityFeed = currentMonthTransactions.slice(0, 10).map((t) => ({
      id: t.id,
      childId: t.childId,
      childName: t.child.name,
      amount: t.amount,
      vendor: t.vendor,
      category: t.category,
      date: t.date,
    }));

    res.status(200).json({
      success: true,
      summary: {
        totalFamilySpend,
        totalFamilyBudget,
        remainingFamilyBudget,
        transactionCount: currentMonthTransactions.length,
        budgetUsagePercentage: totalFamilyBudget > 0 ? Math.min(100, Math.round((totalFamilySpend / totalFamilyBudget) * 100)) : 0,
      },
      childrenBreakdown,
      vendorBreakdown,
      categoryBreakdown,
      recentActivityFeed,
    });
  } catch (error) {
    next(error);
  }
}

export async function getChildDashboard(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const childId = req.user!.id; // Strictly derived from JWT token!
    const { startOfMonth, endOfMonth } = getCurrentMonthBounds();

    const child = await prisma.child.findUnique({
      where: { id: childId },
    });

    if (!child) {
      res.status(404).json({ success: false, message: 'Child profile not found.' });
      return;
    }

    const childTransactions = await prisma.transaction.findMany({
      where: {
        childId,
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      orderBy: { date: 'desc' },
    });

    const totalSpend = childTransactions.reduce((sum, t) => sum + t.amount, 0);
    const isOverLimit = totalSpend > child.monthlyLimit;
    const remainingLimit = Math.max(0, child.monthlyLimit - totalSpend);

    // Compute top vendor for child
    const vendorMap = new Map<string, number>();
    childTransactions.forEach((t) => {
      vendorMap.set(t.vendor, (vendorMap.get(t.vendor) || 0) + t.amount);
    });

    let topVendor: string | null = null;
    let maxVendorSpend = 0;
    vendorMap.forEach((spend, vendor) => {
      if (spend > maxVendorSpend) {
        maxVendorSpend = spend;
        topVendor = vendor;
      }
    });

    res.status(200).json({
      success: true,
      child: {
        id: child.id,
        name: child.name,
        accountLast4: child.accountLast4,
        monthlyLimit: child.monthlyLimit,
        colorTag: child.colorTag,
      },
      summary: {
        totalSpend,
        monthlyLimit: child.monthlyLimit,
        remainingLimit,
        isOverLimit,
        statusTag: isOverLimit ? 'Over limit' : 'On track',
        topVendor: topVendor || '—',
        transactionCount: childTransactions.length,
      },
      transactions: childTransactions.map((t) => ({
        id: t.id,
        amount: t.amount,
        vendor: t.vendor,
        category: t.category,
        date: t.date,
      })),
    });
  } catch (error) {
    next(error);
  }
}
