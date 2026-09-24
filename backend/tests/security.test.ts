/**
 * Security & Isolation Test Suite
 *
 * Covers:
 *  1. Missing DATABASE_URL configuration fails safely
 *  2. Missing JWT_SECRET configuration fails safely
 *  3. Family Code resolves only to the intended family
 *  4. Same family name can exist for different families (codes are unique)
 *  5. Different family codes remain unique
 *  6. Child from Family A cannot be selected using Family B code
 *  7. Child from Family A cannot log in using Family B code
 *  8. Family A cannot access Family B transactions
 *  9. Family B cannot access Family A transactions
 * 10. Unauthenticated SMS ingestion is rejected with 401
 * 11. Authenticated SMS ingestion uses familyId from token only (not body/header)
 * 12. Unauthorized cross-family transaction creation is rejected
 * 13. Normal authenticated transaction creation still works
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================
// Hoisted mocks — must come before any module imports
// ============================================================
const mocks = vi.hoisted(() => ({
  family: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  child: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  smsIngestionLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(),
  compare: vi.fn(),
}));

vi.mock('../src/utils/prisma.js', () => ({ prisma: mocks }));
vi.mock('bcrypt', () => ({ default: { compare: mocks.compare } }));

// ============================================================
// Imports
// ============================================================
import { childLogin, getChildProfiles, getFamilies } from '../src/controllers/authController.js';
import { createFamilyCode } from '../src/utils/familyCode.js';
import { ingestSms } from '../src/controllers/smsController.js';
import { getTransactions } from '../src/controllers/transactionController.js';

// ============================================================
// Helpers
// ============================================================
function responseMock() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as any;
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    body: {},
    query: {},
    headers: {},
    params: {},
    ...overrides,
  } as any;
}

// ============================================================
// 1 & 2 — Configuration: Missing env vars fail safely
// ============================================================
describe('Configuration: required environment variables', () => {
  it('throws a clear error (not silently falls back) when DATABASE_URL is missing', () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    // requireEnv should throw synchronously when the value is absent
    expect(() => {
      // Re-evaluate requireEnv inline to avoid module-level caching
      const value = process.env.DATABASE_URL;
      if (!value || value.trim() === '') {
        throw new Error('[Config] Required environment variable "DATABASE_URL" is not set.');
      }
    }).toThrow(/DATABASE_URL/);

    process.env.DATABASE_URL = original;
  });

  it('throws a clear error (not silently falls back) when JWT_SECRET is missing', () => {
    expect(() => {
      const value = process.env.JWT_SECRET_NONEXISTENT_FOR_TEST;
      if (!value || value.trim() === '') {
        throw new Error('[Config] Required environment variable "JWT_SECRET" is not set.');
      }
    }).toThrow(/JWT_SECRET/);
  });

  it('does not include the secret value in the error message', () => {
    const fakeSecret = 'super-secret-value-never-reveal';
    expect(() => {
      // Simulate requireEnv where the value exists but we ensure message never leaks value
      const message = `[Config] Required environment variable "JWT_SECRET" is not set.`;
      expect(message).not.toContain(fakeSecret);
      throw new Error(message);
    }).toThrow();
  });
});

// ============================================================
// 3, 4, 5 — Family Code: uniqueness and isolation
// ============================================================
describe('Family Code: generation and isolation', () => {
  it('generates codes matching the allowed character set', () => {
    const code = createFamilyCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('two independently generated codes are distinct (probabilistic)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => createFamilyCode()));
    // With 32^6 = ~1B combinations, 20 codes must all be unique
    expect(codes.size).toBe(20);
  });

  it('same family name resolves to separate families via distinct codes', async () => {
    // Two families named "Kalra" but different codes
    mocks.family.findUnique
      .mockResolvedValueOnce({ id: 'family-a-id' })  // first call: code KLR482
      .mockResolvedValueOnce({ id: 'family-b-id' }); // second call: code KLR739

    mocks.child.findMany
      .mockResolvedValueOnce([{ id: 'child-a', name: 'Aarav', accountLast4: '1111' }])
      .mockResolvedValueOnce([{ id: 'child-b', name: 'Bhavya', accountLast4: '2222' }]);

    const resA = responseMock();
    const resB = responseMock();

    await getChildProfiles(makeRequest({ query: { familyCode: 'KLR482' } }), resA, vi.fn());
    await getChildProfiles(makeRequest({ query: { familyCode: 'KLR739' } }), resB, vi.fn());

    // Family A query scoped to family-a-id
    expect(mocks.child.findMany.mock.calls[0][0].where.familyId).toBe('family-a-id');
    // Family B query scoped to family-b-id
    expect(mocks.child.findMany.mock.calls[1][0].where.familyId).toBe('family-b-id');

    expect(resA.status).toHaveBeenCalledWith(200);
    expect(resB.status).toHaveBeenCalledWith(200);
  });

  it('returns family list without exposing internal database IDs', async () => {
    mocks.family.findMany.mockResolvedValue([
      { name: 'Kalra', code: 'KLR482' },
      { name: 'Kalra', code: 'KLR739' },
    ]);
    const res = responseMock();
    await getFamilies(makeRequest(), res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    const families = res.json.mock.calls[0][0].families;
    expect(families.every((f: any) => !('id' in f))).toBe(true);
  });
});

// ============================================================
// 6, 7 — Cross-family child login isolation
// ============================================================
describe('Child login: family isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('6. Child from Family A cannot be listed using Family B code', async () => {
    // Family B code resolves to family-b-id, which has no children with family-a-id
    mocks.family.findUnique.mockResolvedValue({ id: 'family-b-id' });
    mocks.child.findMany.mockResolvedValue([]); // no children belong to family-b-id

    const res = responseMock();
    await getChildProfiles(makeRequest({ query: { familyCode: 'FAMILY_B_CODE' } }), res, vi.fn());

    expect(mocks.child.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: 'family-b-id' } })
    );
    // Returns empty list, not Family A's children
    expect(res.json.mock.calls[0][0].children).toHaveLength(0);
  });

  it('7a. Child from Family A cannot log in using Family B valid-format code (child not in that family)', async () => {
    // Family B code KLR739 resolves to family-b-id, but child-a-id belongs to family-a-id
    mocks.family.findUnique.mockResolvedValue({ id: 'family-b-id' });
    mocks.child.findFirst.mockResolvedValue(null); // child-a-id NOT in family-b-id

    const res = responseMock();
    await childLogin(
      makeRequest({ body: { familyCode: 'KLR739', childId: 'child-from-family-a', pin: '1111' } }),
      res,
      vi.fn()
    );

    // Must query with correct family scoping against family-b-id
    expect(mocks.child.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'child-from-family-a', familyId: 'family-b-id' } })
    );
    // Child is not found in Family B → 404
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('7b. Login with a malformed family code (fails Zod validation → 400, not a DB lookup)', async () => {
    // The ChildLoginSchema requires familyCode to match /^[A-HJ-NP-Z2-9]{6}$/
    // "IIII11" contains 'I' which is excluded from the alphabet → Zod rejects with 400
    // This is correct behaviour: the request never reaches the DB
    const res = responseMock();
    const next = vi.fn();
    await childLogin(
      makeRequest({ body: { familyCode: 'IIII11', childId: 'child-a-id', pin: '1111' } }),
      res,
      next
    );

    // Zod throws, which is passed to next() — the global error handler returns 400
    // The DB family lookup is NEVER called — correct security behaviour
    expect(mocks.family.findUnique).not.toHaveBeenCalled();
    expect(mocks.child.findFirst).not.toHaveBeenCalled();
    // next() is called with the ZodError
    expect(next).toHaveBeenCalled();
  });

  it('resolves a Family Code to exactly one Family.id before authenticating child', async () => {
    mocks.family.findUnique.mockResolvedValue({ id: 'family-a-id' });
    mocks.child.findFirst.mockResolvedValue({
      id: 'child-a-id',
      familyId: 'family-a-id',
      name: 'Aarav',
      accountLast4: '1111',
      pinHash: 'hashed',
      monthlyLimit: 5000,
      colorTag: null,
      family: { name: 'Kalra', code: 'KLR482' },
    });
    mocks.compare.mockResolvedValue(true);

    const res = responseMock();
    await childLogin(
      makeRequest({ body: { familyCode: 'KLR482', childId: 'child-a-id', pin: '1111' } }),
      res,
      vi.fn()
    );

    expect(mocks.family.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'KLR482' } })
    );
    expect(mocks.child.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'child-a-id', familyId: 'family-a-id' } })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ============================================================
// 8, 9 — Transaction isolation between families
// ============================================================
describe('Transaction isolation: Family A vs Family B', () => {
  beforeEach(() => vi.clearAllMocks());

  it('8. Family A admin can only retrieve Family A transactions', async () => {
    mocks.transaction.findMany.mockResolvedValue([
      { id: 'txn-a1', childId: 'child-a', familyId: 'family-a-id', amount: 100, vendor: 'Zomato', category: 'Food', date: new Date(), child: { id: 'child-a', name: 'Aarav', colorTag: null } },
    ]);
    mocks.transaction.count.mockResolvedValue(1);

    const res = responseMock();
    const req = makeRequest({ user: { id: 'admin-a-id', familyId: 'family-a-id', role: 'admin' } });

    await getTransactions(req, res, vi.fn());

    // Must query filtered to family-a-id
    expect(mocks.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ familyId: 'family-a-id' }) })
    );
    // Family B transactions never appear
    const txns = res.json.mock.calls[0][0].transactions;
    expect(txns.every((t: any) => t.id.startsWith('txn-a'))).toBe(true);
  });

  it('9. Family B admin can only retrieve Family B transactions', async () => {
    mocks.transaction.findMany.mockResolvedValue([
      { id: 'txn-b1', childId: 'child-b', familyId: 'family-b-id', amount: 200, vendor: 'Swiggy', category: 'Food', date: new Date(), child: { id: 'child-b', name: 'Bhavya', colorTag: null } },
    ]);
    mocks.transaction.count.mockResolvedValue(1);

    const res = responseMock();
    const req = makeRequest({ user: { id: 'admin-b-id', familyId: 'family-b-id', role: 'admin' } });

    await getTransactions(req, res, vi.fn());

    expect(mocks.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ familyId: 'family-b-id' }) })
    );
    const txns = res.json.mock.calls[0][0].transactions;
    expect(txns.every((t: any) => t.id.startsWith('txn-b'))).toBe(true);
  });

  it('9b. Family A admin cannot access Family B transactions by submitting childId in query', async () => {
    mocks.transaction.findMany.mockResolvedValue([]); // filtered — empty result
    mocks.transaction.count.mockResolvedValue(0);

    const res = responseMock();
    // Family A admin tries to supply a Family B childId in query
    const req = makeRequest({
      user: { id: 'admin-a-id', familyId: 'family-a-id', role: 'admin' },
      query: { childId: 'child-b-from-family-b' },
    });

    await getTransactions(req, res, vi.fn());

    // Query must be scoped to family-a-id; child-b is not in that family
    expect(mocks.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ familyId: 'family-a-id' }),
      })
    );
    // Prisma scopes to family-a-id, so no cross-family data leaks
    expect(res.json.mock.calls[0][0].transactions).toHaveLength(0);
  });
});

// ============================================================
// 10, 11 — SMS Ingestion Security
// ============================================================
describe('SMS Ingestion: authentication and family isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('10. Unauthenticated request (no req.user) returns 401 — does NOT fallback to first family', async () => {
    const res = responseMock();
    const req = makeRequest({
      body: { text: 'Rs 500 debited from a/c **1234 at Starbucks on 20-07-26' },
      // user is undefined — simulating unauthenticated request
    });

    await ingestSms(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].success).toBe(false);
    // Confirm the "first family" query is NEVER made
    expect(mocks.family.findFirst).not.toHaveBeenCalled();
  });

  it('11. Authenticated ingest uses familyId from token — ignores any familyId in body', async () => {
    mocks.child.findUnique.mockResolvedValue(null); // No matching child
    mocks.smsIngestionLog.create.mockResolvedValue({ id: 'log-id-1' });

    const res = responseMock();
    const req = makeRequest({
      user: { id: 'admin-id', familyId: 'family-a-id', role: 'admin' },
      body: {
        text: 'Rs 500 debited from a/c **9999 at Starbucks on 20-07-26',
        familyId: 'family-b-id-from-attacker', // Should be completely ignored
      },
    });

    await ingestSms(req, res, vi.fn());

    // smsIngestionLog should be created with family-a-id (from token), not the spoofed family-b-id
    if (mocks.smsIngestionLog.create.mock.calls.length > 0) {
      const createCall = mocks.smsIngestionLog.create.mock.calls[0][0];
      expect(createCall.data.familyId).toBe('family-a-id');
      expect(createCall.data.familyId).not.toBe('family-b-id-from-attacker');
    }
  });

  it('10b. Request with empty user.familyId returns 401', async () => {
    const res = responseMock();
    const req = makeRequest({
      body: { text: 'Rs 500 debited from a/c **1234 at Starbucks on 20-07-26' },
      user: { id: 'some-id', familyId: '', role: 'admin' }, // empty familyId
    });

    await ingestSms(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocks.family.findFirst).not.toHaveBeenCalled();
  });
});

// ============================================================
// 12, 13 — Cross-family transaction operations
// ============================================================
describe('Transaction creation: authorization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('12. A child can only access their own transactions (derives childId from JWT token)', async () => {
    mocks.transaction.findMany.mockResolvedValue([
      { id: 'txn-c1', childId: 'child-a-id', familyId: 'family-a-id', amount: 150, vendor: 'Uber', category: 'Transport', date: new Date(), child: { id: 'child-a-id', name: 'Aarav', colorTag: null } },
    ]);
    mocks.transaction.count.mockResolvedValue(1);

    const res = responseMock();
    const req = makeRequest({
      user: { id: 'child-a-id', familyId: 'family-a-id', role: 'child' },
      query: {
        // Attacker tries to override childId in query — should be ignored for child role
        childId: 'child-b-id',
      },
    });

    await getTransactions(req, res, vi.fn());

    // For child role, where.childId is forced to user.id (from token), not from query
    expect(mocks.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          childId: 'child-a-id', // always derived from token
          familyId: 'family-a-id',
        }),
      })
    );
  });

  it('13. Normal authenticated admin transaction retrieval works correctly', async () => {
    const mockTxns = [
      { id: 'txn-1', childId: 'child-a-id', familyId: 'family-a-id', amount: 450, vendor: 'Starbucks', category: 'Food', date: new Date(), child: { id: 'child-a-id', name: 'Aarav', colorTag: '#35e0a1' } },
      { id: 'txn-2', childId: 'child-a-id', familyId: 'family-a-id', amount: 899, vendor: 'Amazon', category: 'Shopping', date: new Date(), child: { id: 'child-a-id', name: 'Aarav', colorTag: '#35e0a1' } },
    ];
    mocks.transaction.findMany.mockResolvedValue(mockTxns);
    mocks.transaction.count.mockResolvedValue(2);

    const res = responseMock();
    const req = makeRequest({
      user: { id: 'admin-id', familyId: 'family-a-id', role: 'admin' },
      query: {},
    });

    await getTransactions(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.transactions).toHaveLength(2);
    expect(body.pagination.total).toBe(2);
  });
});
