import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  family: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  child: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  compare: vi.fn(),
}));

vi.mock('../src/utils/prisma.js', () => ({ prisma: mocks }));
vi.mock('bcrypt', () => ({ default: { compare: mocks.compare } }));

import { childLogin, getChildProfiles, getFamilies } from '../src/controllers/authController.js';
import { createFamilyCode } from '../src/utils/familyCode.js';

function responseMock() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as any;
}

describe('Family Code authentication flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows duplicate family names while keeping generated codes distinct', () => {
    const firstCode = createFamilyCode();
    const secondCode = createFamilyCode();

    expect(firstCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(secondCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(firstCode).not.toBe(secondCode);
  });

  it('returns family names and codes without exposing database IDs', async () => {
    mocks.family.findMany.mockResolvedValue([
      { name: 'Kalra', code: 'KLR482' },
      { name: 'Kalra', code: 'KLR739' },
    ]);
    const response = responseMock();

    await getFamilies({} as any, response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      families: [
        { name: 'Kalra', code: 'KLR482' },
        { name: 'Kalra', code: 'KLR739' },
      ],
    });
    expect(response.json.mock.calls[0][0].families.every((family: any) => !('id' in family))).toBe(true);
  });

  it('resolves a Family Code to one Family.id before returning children', async () => {
    mocks.family.findUnique.mockResolvedValue({ id: 'family-a-id' });
    mocks.child.findMany.mockResolvedValue([{ id: 'child-a-id', name: 'A', accountLast4: '1234' }]);
    const response = responseMock();

    await getChildProfiles({ query: { familyCode: 'KLR482' } } as any, response, vi.fn());

    expect(mocks.child.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { familyId: 'family-a-id' } }));
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it('rejects an invalid Family Code', async () => {
    mocks.family.findUnique.mockResolvedValue(null);
    const response = responseMock();

    await getChildProfiles({ query: { familyCode: 'BAD999' } } as any, response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({ success: false, message: 'Family code not found.' });
  });

  it('rejects a child selected with another family code', async () => {
    mocks.family.findUnique.mockResolvedValue({ id: 'family-a-id' });
    mocks.child.findFirst.mockResolvedValue(null);
    const response = responseMock();

    await childLogin({ body: { familyCode: 'KLR482', childId: 'child-from-family-b', pin: '1234' } } as any, response, vi.fn());

    expect(mocks.child.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'child-from-family-b', familyId: 'family-a-id' },
    }));
    expect(response.status).toHaveBeenCalledWith(404);
  });

  it('allows normal child login with the correct Family Code and PIN', async () => {
    mocks.family.findUnique.mockResolvedValue({ id: 'family-a-id' });
    mocks.child.findFirst.mockResolvedValue({
      id: 'child-a-id',
      familyId: 'family-a-id',
      name: 'A',
      accountLast4: '1234',
      pinHash: 'hashed-pin',
      monthlyLimit: 1000,
      colorTag: null,
      family: { name: 'Kalra' },
    });
    mocks.compare.mockResolvedValue(true);
    const response = responseMock();

    await childLogin({ body: { familyCode: 'KLR482', childId: 'child-a-id', pin: '1234' } } as any, response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json.mock.calls[0][0].child).toMatchObject({ familyName: 'Kalra', familyCode: 'KLR482' });
  });
});
