import { randomInt } from 'node:crypto';

const FAMILY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FAMILY_CODE_LENGTH = 6;

export function createFamilyCode(): string {
  return Array.from({ length: FAMILY_CODE_LENGTH }, () => (
    FAMILY_CODE_ALPHABET[randomInt(FAMILY_CODE_ALPHABET.length)]
  )).join('');
}
