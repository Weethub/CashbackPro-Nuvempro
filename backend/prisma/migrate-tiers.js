/**
 * Migração one-off: cria 1 CashbackTier a partir do redeemThreshold/couponType/
 * couponValue legado de cada CashbackConfig existente — preserva o que já foi
 * configurado antes do modelo de múltiplos níveis existir.
 *
 * Idempotente: pula lojas que já têm algum CashbackTier.
 *
 * Uso: node prisma/migrate-tiers.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const configs = await prisma.cashbackConfig.findMany();
  let created = 0;
  let skipped = 0;

  for (const config of configs) {
    const existing = await prisma.cashbackTier.findFirst({ where: { storeId: config.storeId } });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.cashbackTier.create({
      data: {
        storeId: config.storeId,
        name: 'Nível 1',
        pointsRequired: config.redeemThreshold,
        couponType: config.couponType,
        couponValue: config.couponValue,
        sortOrder: 0,
      },
    });
    created++;
  }

  console.log(`Migração concluída: ${created} tier(s) criado(s), ${skipped} loja(s) já tinham tier (pulado).`);
}

main()
  .catch((err) => {
    console.error('Migração falhou:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
