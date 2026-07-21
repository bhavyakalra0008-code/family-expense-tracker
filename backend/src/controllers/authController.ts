import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { generateToken } from '../utils/jwt.js';
import { recordFailedPinAttempt, resetPinAttempts } from '../middleware/rateLimiter.js';

// Validation Schemas
const RegisterAdminSchema = z.object({
  familyName: z.string().min(2, 'Family name must be at least 2 characters'),
  name: z.string().min(2, 'Admin name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const AdminLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const ChildLoginSchema = z.object({
  childId: z.string().min(1, 'Child ID is required'),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
});

export async function registerAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { familyName, name, email, password } = RegisterAdminSchema.parse(req.body);

    const existingAdmin = await prisma.adminUser.findUnique({ where: { email } });
    if (existingAdmin) {
      res.status(400).json({ success: false, message: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const family = await prisma.family.create({
      data: {
        name: familyName,
        adminUsers: {
          create: {
            name,
            email,
            passwordHash,
          },
        },
      },
      include: {
        adminUsers: true,
      },
    });

    const admin = family.adminUsers[0];
    const token = generateToken({
      id: admin.id,
      familyId: family.id,
      role: 'admin',
      name: admin.name,
      email: admin.email,
    });

    res.status(201).json({
      success: true,
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
      },
      family: {
        id: family.id,
        name: family.name,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function adminLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = AdminLoginSchema.parse(req.body);

    const admin = await prisma.adminUser.findUnique({
      where: { email },
      include: { family: true },
    });

    if (!admin) {
      res.status(401).json({ success: false, message: 'Invalid email or password.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid email or password.' });
      return;
    }

    const token = generateToken({
      id: admin.id,
      familyId: admin.familyId,
      role: 'admin',
      name: admin.name,
      email: admin.email,
    });

    res.status(200).json({
      success: true,
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
      },
      family: {
        id: admin.family.id,
        name: admin.family.name,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getChildProfiles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const familyId = req.query.familyId as string | undefined;

    const children = await prisma.child.findMany({
      where: familyId ? { familyId } : {},
      select: {
        id: true,
        name: true,
        familyId: true,
        accountLast4: true,
        monthlyLimit: true,
        colorTag: true,
        createdAt: true,
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

export async function childLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { childId, pin } = ChildLoginSchema.parse(req.body);

    const child = await prisma.child.findUnique({
      where: { id: childId },
      include: { family: true },
    });

    if (!child) {
      res.status(404).json({ success: false, message: 'Child profile not found.' });
      return;
    }

    const isPinValid = await bcrypt.compare(pin, child.pinHash);
    if (!isPinValid) {
      recordFailedPinAttempt(childId);
      res.status(401).json({ success: false, message: 'Incorrect PIN.' });
      return;
    }

    // Reset failed PIN counter on successful login
    resetPinAttempts(childId);

    const token = generateToken({
      id: child.id,
      familyId: child.familyId,
      role: 'child',
      name: child.name,
    });

    res.status(200).json({
      success: true,
      token,
      child: {
        id: child.id,
        name: child.name,
        accountLast4: child.accountLast4,
        monthlyLimit: child.monthlyLimit,
        colorTag: child.colorTag,
        familyId: child.familyId,
        familyName: child.family.name,
      },
    });
  } catch (error) {
    next(error);
  }
}
