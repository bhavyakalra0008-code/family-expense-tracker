/**
 * DATABASE SEED SCRIPT — LOCAL DEVELOPMENT / DEMO ONLY
 *
 * ⚠️  WARNING: This script is for initial demo data setup ONLY.
 *     - Contains hardcoded demo credentials (Password123!, PINs 1111/2222/3333)
 *     - These are DEMO-ONLY values, NOT production credentials
 *     - NEVER run this script against a production database
 *     - NEVER use these credentials in a real deployment
 *
 * Run only locally:
 *   npm run db:seed
 *
 * This will DELETE all existing data and replace it with demo data.
 * For production, provision real users through the API registration endpoint.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Ledger database seed...');
  console.log('⚠️  NOTE: This inserts DEMO-ONLY data. Do not run in production.');

  // Clean existing data
  await prisma.transaction.deleteMany({});
  await prisma.smsIngestionLog.deleteMany({});
  await prisma.child.deleteMany({});
  await prisma.adminUser.deleteMany({});
  await prisma.family.deleteMany({});

  // Hash credentials
  // DEMO-ONLY: In production, users register via the API with their own credentials
  const adminPasswordHash = await bcrypt.hash('Password123!', 10);
  const pin1111 = await bcrypt.hash('1111', 10);
  const pin2222 = await bcrypt.hash('2222', 10);
  const pin3333 = await bcrypt.hash('3333', 10);

  // Create Family & Admin
  const family = await prisma.family.create({
    data: {
      name: 'The Malhotras',
      adminUsers: {
        create: {
          name: 'Priya Malhotra',
          email: 'priya@malhotra.com',
          passwordHash: adminPasswordHash,
        },
      },
    },
    include: {
      adminUsers: true,
    },
  });

  console.log(`✅ Created Family: ${family.name} (${family.id})`);
  console.log(`👤 Created Admin: ${family.adminUsers[0].name} (${family.adminUsers[0].email})`);
  console.log(`   Demo password: Password123! (DEMO ONLY — change before any real use)`);

  // Create Children
  // DEMO-ONLY: PINs 1111, 2222, 3333 are demo fixtures for development
  const kavya = await prisma.child.create({
    data: {
      familyId: family.id,
      name: 'Kavya',
      accountLast4: '1234',
      pinHash: pin1111,
      monthlyLimit: 5000,
      colorTag: '#35e0a1',
    },
  });

  const arjun = await prisma.child.create({
    data: {
      familyId: family.id,
      name: 'Arjun',
      accountLast4: '5678',
      pinHash: pin2222,
      monthlyLimit: 3500,
      colorTag: '#8b8fff',
    },
  });

  const rohan = await prisma.child.create({
    data: {
      familyId: family.id,
      name: 'Rohan',
      accountLast4: '9012',
      pinHash: pin3333,
      monthlyLimit: 4000,
      colorTag: '#ff6b6b',
    },
  });

  console.log(`👶 Created Children: Kavya (last4:1234, PIN:1111 DEMO), Arjun (last4:5678, PIN:2222 DEMO), Rohan (last4:9012, PIN:3333 DEMO)`);

  // Sample transactions matching app.js
  const sampleTransactions = [
    { childId: kavya.id, amount: 450, vendor: 'Starbucks', category: 'Food', date: new Date('2026-07-18T10:30:00Z'), rawText: 'Rs 450 debited from a/c **1234 at Starbucks on 18-07-26' },
    { childId: kavya.id, amount: 1299, vendor: 'Myntra', category: 'Shopping', date: new Date('2026-07-16T14:15:00Z'), rawText: 'Rs 1299 debited from a/c **1234 at Myntra on 16-07-26' },
    { childId: arjun.id, amount: 600, vendor: 'Uber', category: 'Transport', date: new Date('2026-07-15T18:45:00Z'), rawText: 'INR 600.00 debited from your account XX5678 towards Uber on 15-07-26' },
    { childId: arjun.id, amount: 899, vendor: 'Amazon', category: 'Shopping', date: new Date('2026-07-12T09:20:00Z'), rawText: 'INR 899.00 debited from your account XX5678 towards AMAZON on 12-07-26' },
    { childId: rohan.id, amount: 320, vendor: 'Zomato', category: 'Food', date: new Date('2026-07-11T20:10:00Z'), rawText: 'Rs 320 debited from a/c **9012 at Zomato on 11-07-26' },
    { childId: kavya.id, amount: 199, vendor: 'Netflix', category: 'Entertainment', date: new Date('2026-07-09T11:00:00Z'), rawText: 'Rs 199 debited from a/c **1234 towards Netflix on 09-07-26' },
    { childId: rohan.id, amount: 750, vendor: 'Swiggy', category: 'Food', date: new Date('2026-07-08T19:30:00Z'), rawText: 'Rs 750 debited from a/c **9012 at Swiggy on 08-07-26' },
    { childId: arjun.id, amount: 1500, vendor: 'PVR', category: 'Entertainment', date: new Date('2026-07-05T16:00:00Z'), rawText: 'Rs 1500 debited from a/c **5678 at PVR on 05-07-26' },
  ];

  for (const t of sampleTransactions) {
    const smsLog = await prisma.smsIngestionLog.create({
      data: {
        familyId: family.id,
        rawText: t.rawText,
        receivedAt: t.date,
        matched: true,
        childId: t.childId,
        amount: t.amount,
        vendor: t.vendor,
      },
    });

    await prisma.transaction.create({
      data: {
        childId: t.childId,
        familyId: family.id,
        amount: t.amount,
        vendor: t.vendor,
        category: t.category,
        date: t.date,
        rawSmsId: smsLog.id,
      },
    });
  }

  // Add an unmatched SMS log example
  await prisma.smsIngestionLog.create({
    data: {
      familyId: family.id,
      rawText: "Rs 250 debited from a/c **4444 at Domino's on 20-07-26",
      receivedAt: new Date('2026-07-20T12:00:00Z'),
      matched: false,
      childId: null,
      amount: 250,
      vendor: "Domino's",
      rejectionReason: 'No child is linked to account ending 4444.',
    },
  });

  console.log(`💳 Created ${sampleTransactions.length} demo transactions and ingestion logs.`);
  console.log(`🎉 Seeding completed successfully!`);
  console.log(`⚠️  REMINDER: All credentials above are DEMO-ONLY. Do not use in production.`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
