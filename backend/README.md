# 💳 Ledger — Family Expense Tracker Backend API

Production-ready backend API built with **Node.js, Express, TypeScript, Prisma ORM (PostgreSQL), Zod, JWT, and Bcrypt**. Powers the **Ledger** Family Expense Tracker frontend by automatically parsing children's bank debit SMS messages and enforcing dual role-based security.

---

## 🏗️ Architecture Overview

```
backend/
├── src/
│   ├── config/             # Application environment configuration
│   ├── controllers/        # Route controllers (Auth, Family, SMS, Dashboard, Transactions)
│   ├── middleware/         # Auth verification, Role RBAC, Rate Limiting, Error handling
│   ├── routes/             # RESTful API route definitions
│   ├── services/           # Standalone SMS Parser & Vendor Category mapping
│   ├── utils/              # JWT utilities & Prisma client singleton
│   ├── app.ts              # Express application assembly (Helmet, CORS, Rate Limit)
│   └── server.ts           # HTTP server listener
├── prisma/
│   ├── schema.prisma       # Database models (Family, AdminUser, Child, Transaction, SmsIngestionLog)
│   └── seed.ts             # Demo data population script ("The Malhotras")
├── tests/
│   └── smsParser.test.ts   # Vitest unit tests for SMS parser logic
├── docker-compose.yml      # One-click PostgreSQL container startup
├── .env.example            # Environment variable template
├── tsconfig.json           # TypeScript configuration
└── vitest.config.ts        # Vitest test suite configuration
```

---

## 🚀 Quick Start Guide

### 1. Environment Setup
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 2. Start PostgreSQL Database
Using Docker Compose:
```bash
docker compose up -d
```

### 3. Install Dependencies & Generate Prisma Client
```bash
npm install
npx prisma generate
```

### 4. Push Schema & Seed Initial Demo Data
```bash
npx prisma db push
npm run db:seed
```

The seed script creates:
- **Family**: `The Malhotras`
- **Admin**: `Priya Malhotra` (`priya@malhotra.com` / `Password123!`)
- **Children**:
  - `Kavya` (Account ending **1234**, PIN **1111**, Limit ₹5,000)
  - `Arjun` (Account ending **5678**, PIN **2222**, Limit ₹3,500)
  - `Rohan` (Account ending **9012**, PIN **3333**, Limit ₹4,000)
- **Demo Transactions**: 8 transactions matching initial mock data.

### 5. Run Unit Tests
```bash
npm test
```

### 6. Start the Server
```bash
npm run dev
```
Server runs at `http://localhost:4000`.

---

## 📡 API Endpoint Reference & Examples

### 1. Authentication Endpoints

#### Register Family & Admin
```bash
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "familyName": "The Malhotras",
    "name": "Priya Malhotra",
    "email": "priya@malhotra.com",
    "password": "Password123!"
  }'
```

#### Admin Login
```bash
curl -X POST http://localhost:4000/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "priya@malhotra.com",
    "password": "Password123!"
  }'
```

#### Get Child Profiles for Picker
```bash
curl -X GET http://localhost:4000/api/auth/child/profiles
```

#### Child Profile PIN Login (Rate Limited)
```bash
curl -X POST http://localhost:4000/api/auth/child/login \
  -H "Content-Type: application/json" \
  -d '{
    "childId": "<CHILD_ID>",
    "pin": "1111"
  }'
```

---

### 2. Child Management (Admin Only)

#### List Children
```bash
curl -X GET http://localhost:4000/api/family/children \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

#### Add New Child
```bash
curl -X POST http://localhost:4000/api/family/children \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Aarav",
    "limit": 4500,
    "last4": "2468",
    "pin": "4444",
    "colorTag": "#5bc0ff"
  }'
```

#### Update Child Limit/Name
```bash
curl -X PATCH http://localhost:4000/api/family/children/<CHILD_ID> \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 6000
  }'
```

---

### 3. SMS Ingestion & Simulation

#### Simulate Bank Debit SMS (Admin Testing Panel)
```bash
curl -X POST http://localhost:4000/api/sms/simulate \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Rs 450 debited from a/c **1234 at Starbucks on 21-07-26"
  }'
```

#### Ingest Mobile Bank SMS (Companion App Endpoint)
```bash
curl -X POST http://localhost:4000/api/sms/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "text": "INR 899.00 debited from your account XX5678 towards AMAZON on 21-07-26"
  }'
```

#### Get SMS Ingestion Feed / Audit Trail
```bash
curl -X GET "http://localhost:4000/api/sms/feed?page=1&limit=10" \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

---

### 4. Dashboards & Aggregations

#### Admin Family Dashboard
```bash
curl -X GET http://localhost:4000/api/dashboard/admin \
  -H "Authorization: Bearer <ADMIN_JWT>"
```

#### Child Individual Dashboard
```bash
curl -X GET http://localhost:4000/api/dashboard/child \
  -H "Authorization: Bearer <CHILD_JWT>"
```

---

### 5. Transactions Query

#### Get Transactions (Admin or Child Scoped)
```bash
curl -X GET "http://localhost:4000/api/transactions?page=1&limit=20" \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

---

## 🔒 Security Principles

1. **Strict Server-Side Derivation**: Child endpoints derive `childId` directly from the validated Child JWT token — ignoring any client-submitted body or query parameters.
2. **Account Number Protection**: System strictly accepts, stores, and processes account last 4 digits only (`accountLast4`).
3. **Bcrypt Hashing**: All Admin passwords and 4-digit Child PINs are salted and hashed using bcrypt.
4. **Brute Force Defense**: PIN logins feature a 5-failed-attempt threshold before triggering a cooldown lockout.
