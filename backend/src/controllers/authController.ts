import { Request, Response, NextFunction } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { generateToken } from '../utils/jwt.js';
import { recordFailedPinAttempt, resetPinAttempts } from '../middleware/rateLimiter.js';
import { createFamilyCode } from '../utils/familyCode.js';
import { sendPasswordResetEmail } from '../services/emailService.js';

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

const ForgotPasswordSchema = z.object({ email: z.string().email('Invalid email address') });
const ResetPasswordSchema = z.object({ token: z.string().min(1), password: z.string().min(6, 'Password must be at least 6 characters') });
const ForgotPinSchema = z.object({ familyCode: z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/), childId: z.string().min(1) });

const ChildLoginSchema = z.object({
  familyCode: z.string().trim().toUpperCase().regex(/^[A-HJ-NP-Z2-9]{6}$/, 'Invalid family code'),
  childId: z.string().min(1, 'Child ID is required'),
  pin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
});

async function generateUniqueFamilyCode(): Promise<string> {
  let code = createFamilyCode();
  while (await prisma.family.findUnique({ where: { code }, select: { id: true } })) {
    code = createFamilyCode();
  }
  return code;
}

export async function registerAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { familyName, name, email, password } = RegisterAdminSchema.parse(req.body);

    const existingAdmin = await prisma.adminUser.findUnique({ where: { email } });
    if (existingAdmin) {
      res.status(400).json({ success: false, message: 'An account with this email already exists.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const familyCode = await generateUniqueFamilyCode();

    const family = await prisma.family.create({
      data: {
        name: familyName,
        code: familyCode,
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
        name: family.name,
        code: family.code,
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
        name: admin.family.name,
        code: admin.family.code,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function requestPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = ForgotPasswordSchema.parse(req.body);
    const admin = await prisma.adminUser.findUnique({ where: { email } });

    if (admin) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await prisma.passwordResetToken.deleteMany({ where: { adminUserId: admin.id, usedAt: null } });
      await prisma.passwordResetToken.create({
        data: { adminUserId: admin.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      await sendPasswordResetEmail(admin.email, rawToken);
    }

    res.status(200).json({ success: true, message: 'If an account exists, a password reset email has been sent.' });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password } = ResetPasswordSchema.parse(req.body);
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= new Date()) {
      res.status(400).json({ success: false, message: 'Reset link is invalid or expired.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: resetToken.adminUserId }, data: { passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    ]);

    res.status(200).json({ success: true, message: 'Password reset successfully.' });
  } catch (error) {
    next(error);
  }
}

export async function getChildProfiles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const familyCode = (req.query.familyCode as string | undefined)?.trim().toUpperCase();

    if (!familyCode) {
      res.status(400).json({ success: false, message: 'Family selection is required.' });
      return;
    }

    const family = await prisma.family.findUnique({ where: { code: familyCode }, select: { id: true } });
    if (!family) {
      res.status(404).json({ success: false, message: 'Family code not found.' });
      return;
    }

    const children = await prisma.child.findMany({
      where: { familyId: family.id },
      select: {
        id: true,
        name: true,
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

export async function getFamilies(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const families = await prisma.family.findMany({
      select: { name: true, code: true },
      orderBy: { name: 'asc' },
    });

    res.status(200).json({ success: true, families });
  } catch (error) {
    next(error);
  }
}

export async function childLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { familyCode, childId, pin } = ChildLoginSchema.parse(req.body);

    const family = await prisma.family.findUnique({ where: { code: familyCode }, select: { id: true } });
    if (!family) {
      res.status(404).json({ success: false, message: 'Family code not found.' });
      return;
    }

    const child = await prisma.child.findFirst({
      where: { id: childId, familyId: family.id },
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
        familyName: child.family.name,
        familyCode,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function requestPinReset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { familyCode, childId } = ForgotPinSchema.parse(req.body);
    const family = await prisma.family.findUnique({ where: { code: familyCode }, select: { id: true } });
    const child = family ? await prisma.child.findFirst({ where: { id: childId, familyId: family.id }, select: { id: true } }) : null;

    if (!child) {
      res.status(404).json({ success: false, message: 'Child profile not found.' });
      return;
    }

    const existing = await prisma.pinResetRequest.findFirst({ where: { childId, status: 'PENDING' } });
    if (!existing) await prisma.pinResetRequest.create({ data: { childId } });
    res.status(201).json({ success: true, message: 'PIN reset request sent to the parent.' });
  } catch (error) {
    next(error);
  }
}
