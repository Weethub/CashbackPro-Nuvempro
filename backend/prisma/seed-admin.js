require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL;
  const password = process.env.ADMIN_SEED_PASSWORD;
  const appSlug = process.env.APP_SLUG || 'meuapp';

  if (!email || !password) {
    console.error('ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD must be set in .env');
    process.exit(1);
  }

  if (password.length < 12) {
    console.error('ADMIN_SEED_PASSWORD must be at least 12 characters');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Upsert admin user
  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash, name: 'Administrador', role: 'proprietario' },
    create: {
      name: 'Administrador',
      email,
      passwordHash,
      role: 'proprietario',
      isActive: true,
    },
  });
  console.log(`Admin user upserted: ${admin.email} (id: ${admin.id})`);

  // Upsert 3 default plans
  const plans = [
    {
      appId: appSlug,
      name: 'starter',
      stripePriceIds: {},
      features: {
        maxProducts: 50,
        support: 'email',
        analytics: false,
        customBranding: false,
      },
      price: { monthly: 0, semestral: 0, annual: 0 },
      commissionRate: 0,
      revenueShareRate: 0,
      isActive: true,
      sortOrder: 0,
    },
    {
      appId: appSlug,
      name: 'growth',
      stripePriceIds: {
        monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY || '',
        semestral: process.env.STRIPE_PRICE_GROWTH_SEMESTRAL || '',
        annual: process.env.STRIPE_PRICE_GROWTH_ANNUAL || '',
      },
      features: {
        maxProducts: 500,
        support: 'priority',
        analytics: true,
        customBranding: false,
      },
      price: { monthly: 49.9, semestral: 39.9, annual: 29.9 },
      commissionRate: 0.20,
      revenueShareRate: 0,
      isActive: true,
      sortOrder: 1,
    },
    {
      appId: appSlug,
      name: 'scale',
      stripePriceIds: {
        monthly: process.env.STRIPE_PRICE_SCALE_MONTHLY || '',
        semestral: process.env.STRIPE_PRICE_SCALE_SEMESTRAL || '',
        annual: process.env.STRIPE_PRICE_SCALE_ANNUAL || '',
      },
      features: {
        maxProducts: -1,
        support: 'dedicated',
        analytics: true,
        customBranding: true,
      },
      price: { monthly: 99.9, semestral: 79.9, annual: 59.9 },
      commissionRate: 0.15,
      revenueShareRate: 0,
      isActive: true,
      sortOrder: 2,
    },
  ];

  for (const plan of plans) {
    const upserted = await prisma.adminPlan.upsert({
      where: { appId_name: { appId: plan.appId, name: plan.name } },
      update: {
        stripePriceIds: plan.stripePriceIds,
        features: plan.features,
        price: plan.price,
        commissionRate: plan.commissionRate,
        revenueShareRate: plan.revenueShareRate,
        isActive: plan.isActive,
        sortOrder: plan.sortOrder,
      },
      create: plan,
    });
    console.log(`Plan upserted: ${upserted.name} (id: ${upserted.id})`);
  }

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
