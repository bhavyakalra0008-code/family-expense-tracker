import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export interface UserTokenPayload {
  id: string;
  familyId: string;
  role: 'admin' | 'child';
  name?: string;
  email?: string;
}

export function generateToken(payload: UserTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): UserTokenPayload {
  return jwt.verify(token, config.jwtSecret) as UserTokenPayload;
}
