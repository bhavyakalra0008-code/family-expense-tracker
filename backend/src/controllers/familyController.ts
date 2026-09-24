import { Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';

const AddChildSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  limit: z.number().positive('Monthly limit must be a positive number'),
  last4: z.string().regex(/^\d{4}$/, 'Account last4 must be exactly 4 digits'),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  colorTag: z.string().optional(),
});

const UpdateChildSchema = z.object({
  name: z.string().min(2).optional(),
  limit: z.number().positive().optional(),
  colorTag: z.string().optional(),
});

export async function getChildren(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const familyId = req.user!.familyId;

    const children = await prisma.child.findMany({
      where: { familyId },
      select: {
        id: true,
        familyId: true,
        name: true,
        accountLast4: true,
        monthlyLimit: true,
        colorTag: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    res.status(200).json({
      success: true,
      children,
    });
  } catch (error) {
    next(error);
  }
}

export async function addChild(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const familyId = req.user!.familyId;
    const { name, limit, last4, pin, colorTag } = AddChildSchema.parse(req.body);

    // Check if account last4 is already linked to another child in THIS family
    const existingChild = await prisma.child.findUnique({
      where: {
        familyId_accountLast4: {
          familyId,
          accountLast4: last4,
        },
      },
    });

    if (existingChild) {
      res.status(400).json({
        success: false,
        message: `Account ending in ${last4} is already linked to another child in this family.`,
      });
      return;
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const child = await prisma.child.create({
      data: {
        familyId,
        name,
        monthlyLimit: limit,
        accountLast4: last4,
        pinHash,
        colorTag: colorTag || '#35e0a1',
      },
      select: {
        id: true,
        familyId: true,
        name: true,
        accountLast4: true,
        monthlyLimit: true,
        colorTag: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      success: true,
      child,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateChild(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const familyId = req.user!.familyId as string;
    const childId = req.params.id as string;
    const updates = UpdateChildSchema.parse(req.body);

    const child = await prisma.child.findFirst({
      where: { id: childId, familyId },
    });

    if (!child) {
      res.status(404).json({ success: false, message: 'Child profile not found in your family.' });
      return;
    }

    const updatedChild = await prisma.child.update({
      where: { id: childId },
      data: updates,
      select: {
        id: true,
        familyId: true,
        name: true,
        accountLast4: true,
        monthlyLimit: true,
        colorTag: true,
        updatedAt: true,
      },
    });

    res.status(200).json({
      success: true,
      child: updatedChild,
    });
  } catch (error) {
    next(error);
  }
}

export async function removeChild(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const familyId = req.user!.familyId as string;
    const childId = req.params.id as string;

    const child = await prisma.child.findFirst({
      where: { id: childId, familyId },
      select: { id: true, name: true },
    });

    if (!child) {
      res.status(404).json({ success: false, message: 'Child profile not found in your family.' });
      return;
    }

    await prisma.child.delete({ where: { id: child.id } });

    res.status(200).json({ success: true, message: `${child.name} was removed.` });
  } catch (error) {
    next(error);
  }
}

export async function getPinResetRequests(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const requests = await prisma.pinResetRequest.findMany({
      where: { status: 'PENDING', child: { familyId: req.user!.familyId } },
      include: { child: { select: { id: true, name: true } } },
      orderBy: { requestedAt: 'asc' },
    });
    res.status(200).json({ success: true, requests });
  } catch (error) {
    next(error);
  }
}

export async function resolvePinResetRequest(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const pin = z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits').parse(req.body.pin);
    const requestId = req.params.id as string;
    const request = await prisma.pinResetRequest.findFirst({
      where: { id: requestId, status: 'PENDING', child: { familyId: req.user!.familyId } },
      select: { id: true, childId: true },
    });

    if (!request) {
      res.status(404).json({ success: false, message: 'Pending PIN request not found.' });
      return;
    }

    const pinHash = await bcrypt.hash(pin, 10);
    await prisma.$transaction([
      prisma.child.update({ where: { id: request.childId }, data: { pinHash } }),
      prisma.pinResetRequest.update({ where: { id: request.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } }),
    ]);

    res.status(200).json({ success: true, message: 'Child PIN updated.' });
  } catch (error) {
    next(error);
  }
}
