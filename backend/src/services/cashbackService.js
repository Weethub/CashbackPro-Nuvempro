const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { createNuvemshopClient } = require('../config/nuvemshop');
const { sendEmail } = require('../lib/email');

const CYCLE_MONTHS = 6;

// ─── Config ───────────────────────────────────────────────────────────────

async function getOrCreateConfig(storeId) {
  const existing = await prisma.cashbackConfig.findUnique({ where: { storeId } });
  if (existing) return existing;
  return prisma.cashbackConfig.create({ data: { storeId } });
}

async function updateConfig(storeId, data) {
  const { isActive, pointsPerCurrency, welcomeMessage, redeemMessage, widgetIconPosition, widgetIconSize } = data;

  const fields = {
    ...(isActive !== undefined && { isActive: Boolean(isActive) }),
    ...(pointsPerCurrency !== undefined && { pointsPerCurrency: parseFloat(pointsPerCurrency) }),
    ...(welcomeMessage !== undefined && { welcomeMessage }),
    ...(redeemMessage !== undefined && { redeemMessage }),
    ...(widgetIconPosition !== undefined && { widgetIconPosition }),
    ...(widgetIconSize !== undefined && { widgetIconSize }),
  };

  return prisma.cashbackConfig.upsert({
    where: { storeId },
    create: { storeId, ...fields },
    update: fields,
  });
}

// ─── Níveis (tiers) ─────────────────────────────────────────────────────────

async function getTiers(storeId) {
  return prisma.cashbackTier.findMany({ where: { storeId }, orderBy: { sortOrder: 'asc' } });
}

/**
 * Substitui a lista completa de tiers da loja numa transação: atualiza os que
 * têm `id`, cria os que não têm, remove os que existiam e não vieram na lista.
 */
async function setTiers(storeId, tiers) {
  if (!Array.isArray(tiers)) {
    throw new AppError('tiers deve ser um array.', 400, 'VALIDATION_ERROR');
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.cashbackTier.findMany({ where: { storeId } });
    const keepIds = new Set();

    const result = [];
    for (let i = 0; i < tiers.length; i++) {
      const t = tiers[i];
      const data = {
        name: t.name,
        pointsRequired: parseInt(t.pointsRequired),
        couponType: t.couponType === 'amount_off' ? 'amount_off' : 'percent_off',
        couponValue: parseFloat(t.couponValue),
        sortOrder: i,
      };

      if (t.id && existing.some((e) => e.id === t.id)) {
        keepIds.add(t.id);
        result.push(await tx.cashbackTier.update({ where: { id: t.id }, data }));
      } else {
        result.push(await tx.cashbackTier.create({ data: { storeId, ...data } }));
      }
    }

    const toDelete = existing.filter((e) => !keepIds.has(e.id)).map((e) => e.id);
    if (toDelete.length > 0) {
      await tx.cashbackTier.deleteMany({ where: { id: { in: toDelete } } });
    }

    return result;
  });
}

// ─── Saldo do cliente ─────────────────────────────────────────────────────

async function getOrCreateCustomerPoints(storeId, nuvemshopCustomerId, email) {
  const id = String(nuvemshopCustomerId);
  const existing = await prisma.customerPoints.findUnique({
    where: { storeId_nuvemshopCustomerId: { storeId, nuvemshopCustomerId: id } },
  });
  if (existing) {
    // Mantém o e-mail atualizado (cliente pode editar o cadastro na loja)
    if (email && email !== existing.email) {
      return prisma.customerPoints.update({ where: { id: existing.id }, data: { email } });
    }
    return existing;
  }
  return prisma.customerPoints.create({
    data: { storeId, nuvemshopCustomerId: id, email: email || null },
  });
}

function cycleExpired(cycleStartedAt) {
  const dueDate = new Date(cycleStartedAt);
  dueDate.setMonth(dueDate.getMonth() + CYCLE_MONTHS);
  return dueDate <= new Date();
}

/**
 * Versão read-only da checagem de ciclo — usada em listagens (painel do
 * lojista, /widget/me) pra exibir o saldo correto sem escrever no banco.
 */
function computeEffectiveBalance(customerPoints) {
  if (cycleExpired(customerPoints.cycleStartedAt)) return 0;
  return customerPoints.pointsBalance;
}

/**
 * Reseta o ciclo de 6 meses se vencido. Roda DENTRO de uma transação, chamado
 * só no momento de creditar/resgatar (lazy) — nunca em listagens, evitando
 * escrita em massa. Sem cron job: o próprio próximo evento do cliente dispara
 * a checagem.
 */
async function ensureCycleFresh(tx, customerPoints) {
  if (!cycleExpired(customerPoints.cycleStartedAt)) return customerPoints;

  if (customerPoints.pointsBalance > 0) {
    await tx.pointsTransaction.create({
      data: {
        customerPointsId: customerPoints.id,
        storeId: customerPoints.storeId,
        type: 'reset',
        points: -customerPoints.pointsBalance,
        note: 'Reset de ciclo (6 meses)',
      },
    });
  }

  return tx.customerPoints.update({
    where: { id: customerPoints.id },
    data: { pointsBalance: 0, cycleStartedAt: new Date() },
  });
}

// ─── Cupom de resgate (Nuvemshop Coupons API) ──────────────────────────────
// Limitação da API: não é possível vincular um cupom a um cliente específico.
// Contorno (confirmado na proposta): código único + max_uses: 1 — funciona como
// cupom pessoal desde que só seja entregue àquele cliente.
function generateCouponCode() {
  return `CASHBACK-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function createRedemptionCoupon(store, { couponType, couponValue }) {
  const client = createNuvemshopClient(store.nuvemshopId, store.accessToken);
  const code = generateCouponCode();

  const payload = {
    code,
    type: couponType === 'amount_off' ? 'absolute' : 'percentage',
    value: String(couponValue),
    valid: true,
    max_uses: 1,
  };

  const { data } = await client.post('/coupons', payload);
  return { code: data?.code || code, nuvemshopCouponId: data?.id };
}

// ─── Motor de pontos ────────────────────────────────────────────────────────

/**
 * Credita pontos referentes a um pedido pago. Idempotente: pedidos já
 * processados (mesmo nuvemshopOrderId) são ignorados. Não gera cupom — o
 * resgate agora é uma ação explícita do cliente (ver redeemCurrentTier).
 */
async function creditPointsForOrder(store, order) {
  const config = await getOrCreateConfig(store.id);
  if (!config.isActive) return { skipped: 'inactive' };

  const customerId = order.customer?.id;
  if (!customerId) return { skipped: 'no_customer' };

  const orderTotal = parseFloat(order.total);
  if (!orderTotal || orderTotal <= 0) return { skipped: 'invalid_total' };

  const customerPoints = await getOrCreateCustomerPoints(store.id, customerId, order.customer?.email);

  const alreadyProcessed = await prisma.pointsTransaction.findFirst({
    where: { customerPointsId: customerPoints.id, type: 'earn', nuvemshopOrderId: String(order.id) },
  });
  if (alreadyProcessed) return { skipped: 'already_processed' };

  const pointsEarned = Math.floor(orderTotal * config.pointsPerCurrency);
  if (pointsEarned <= 0) return { skipped: 'zero_points' };

  const { currentTier: tierBefore } = await getTierProgress(store.id, customerPoints);

  const updated = await prisma.$transaction(async (tx) => {
    const fresh = await ensureCycleFresh(tx, customerPoints);
    await tx.pointsTransaction.create({
      data: {
        customerPointsId: fresh.id,
        storeId: store.id,
        type: 'earn',
        points: pointsEarned,
        nuvemshopOrderId: String(order.id),
      },
    });
    return tx.customerPoints.update({
      where: { id: fresh.id },
      data: { pointsBalance: { increment: pointsEarned } },
    });
  });

  if (order.customer?.email) {
    sendEmail({
      to: order.customer.email,
      subject: 'Você ganhou pontos!',
      html:
        config.welcomeMessage ||
        `<p>Você ganhou <strong>${pointsEarned} pontos</strong> nesta compra. Saldo atual: ${updated.pointsBalance} pontos.</p>`,
    });

    const { currentTier: tierAfter } = await getTierProgress(store.id, updated);
    // Só notifica em SUBIDA real de nível (não repete no mesmo nível a cada compra).
    if (tierAfter && (!tierBefore || tierAfter.pointsRequired > tierBefore.pointsRequired)) {
      const discountLabel =
        tierAfter.couponType === 'amount_off'
          ? `R$ ${tierAfter.couponValue} de desconto`
          : `${tierAfter.couponValue}% de desconto`;
      sendEmail({
        to: order.customer.email,
        subject: `Você subiu para o nível ${tierAfter.name}!`,
        html: `<p>Parabéns! Você alcançou o nível <strong>${tierAfter.name}</strong> e já pode resgatar ${discountLabel} no seu próximo pedido. Saldo atual: ${updated.pointsBalance} pontos.</p>`,
      });
    }
  }

  return { pointsEarned, balance: updated.pointsBalance };
}

/**
 * Retorna o nível atual do cliente (o maior tier cujo pointsRequired cabe no
 * saldo efetivo), o próximo nível e quantos pontos faltam pra ele.
 */
async function getTierProgress(storeId, customerPoints) {
  const tiers = await prisma.cashbackTier.findMany({
    where: { storeId },
    orderBy: { pointsRequired: 'asc' },
  });
  const balance = computeEffectiveBalance(customerPoints);

  let currentTier = null;
  let nextTier = null;
  for (const tier of tiers) {
    if (tier.pointsRequired <= balance) currentTier = tier;
    else if (!nextTier) nextTier = tier;
  }

  return {
    balance,
    currentTier,
    nextTier,
    pointsToNext: nextTier ? nextTier.pointsRequired - balance : null,
  };
}

/**
 * Resgate explícito pelo cliente: consome o maior nível alcançado, gera o
 * cupom correspondente, desconta o custo do nível do saldo (não zera o
 * restante) e envia o código só por e-mail — nunca na resposta da API.
 */
async function redeemCurrentTier(store, customerPointsId) {
  const customerPoints = await prisma.customerPoints.findUnique({ where: { id: customerPointsId } });
  if (!customerPoints) throw new AppError('Cliente não encontrado.', 404, 'CUSTOMER_NOT_FOUND');

  const fresh = await prisma.$transaction((tx) => ensureCycleFresh(tx, customerPoints));

  const tiers = await prisma.cashbackTier.findMany({
    where: { storeId: store.id },
    orderBy: { pointsRequired: 'desc' },
  });
  const tier = tiers.find((t) => t.pointsRequired <= fresh.pointsBalance);
  if (!tier) throw new AppError('Nenhum nível alcançado ainda.', 400, 'NO_TIER_REACHED');

  const { code } = await createRedemptionCoupon(store, tier);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.pointsTransaction.create({
      data: {
        customerPointsId: fresh.id,
        storeId: store.id,
        type: 'redeem',
        points: -tier.pointsRequired,
        couponCode: code,
        note: `Resgate nível ${tier.name}`,
      },
    });
    return tx.customerPoints.update({
      where: { id: fresh.id },
      data: { pointsBalance: { decrement: tier.pointsRequired } },
    });
  });

  if (fresh.email) {
    const config = await getOrCreateConfig(store.id);
    sendEmail({
      to: fresh.email,
      subject: 'Seu cupom de desconto está pronto!',
      html:
        config.redeemMessage ||
        `<p>Você resgatou o nível <strong>${tier.name}</strong>! Use o cupom <strong>${code}</strong> na sua próxima compra (uso único).</p>`,
    });
  }

  return { tierName: tier.name, balance: updated.pointsBalance };
}

// ─── Listagens (painel do lojista) ─────────────────────────────────────────

const CUSTOMER_SORT_FIELDS = new Set(['pointsBalance', 'email', 'createdAt']);

/**
 * Lista clientes da loja, paginada e ordenável. O saldo exibido é o efetivo
 * (computeEffectiveBalance — considera ciclo de 6 meses vencido), mas a
 * ordenação/paginação usa o valor bruto salvo no banco: como o reset só é
 * escrito de forma lazy (na próxima compra/resgate do cliente), clientes
 * inativos há mais de 6 meses podem aparecer fora de ordem em relação ao
 * saldo exibido — caso raro, aceito para não precisar calcular isso em SQL.
 */
async function listCustomers(storeId, { page, limit, skip, sortBy, sortDir, search }) {
  const orderField = CUSTOMER_SORT_FIELDS.has(sortBy) ? sortBy : 'pointsBalance';
  const orderDir = sortDir === 'asc' ? 'asc' : 'desc';

  const where = {
    storeId,
    ...(search && { email: { contains: search, mode: 'insensitive' } }),
  };

  const [customers, total] = await Promise.all([
    prisma.customerPoints.findMany({
      where,
      orderBy: { [orderField]: orderDir },
      skip,
      take: limit,
    }),
    prisma.customerPoints.count({ where }),
  ]);

  const ids = customers.map((c) => c.id);
  const couponsUsedByCustomer = ids.length
    ? await prisma.pointsTransaction.groupBy({
        by: ['customerPointsId'],
        where: { customerPointsId: { in: ids }, type: 'redeem' },
        _count: { _all: true },
      })
    : [];
  const couponsMap = new Map(couponsUsedByCustomer.map((c) => [c.customerPointsId, c._count._all]));

  const data = customers.map((c) => ({
    id: c.id,
    email: c.email,
    pointsBalance: computeEffectiveBalance(c),
    couponsUsed: couponsMap.get(c.id) || 0,
    createdAt: c.createdAt,
  }));

  return { data, total };
}

/**
 * Lista resgates (cupons usados) da loja, paginada, com e-mail do cliente.
 */
async function listRedemptions(storeId, { page, limit, skip }) {
  const where = { storeId, type: 'redeem' };

  const [transactions, total] = await Promise.all([
    prisma.pointsTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { customerPoints: { select: { email: true } } },
    }),
    prisma.pointsTransaction.count({ where }),
  ]);

  const data = transactions.map((t) => ({
    id: t.id,
    email: t.customerPoints?.email || null,
    points: t.points,
    couponCode: t.couponCode,
    note: t.note,
    createdAt: t.createdAt,
  }));

  return { data, total };
}

// ─── Dashboard (painel do lojista) ─────────────────────────────────────────

async function getStats(storeId) {
  const [pointsEmitted, redemptions, activeCustomers] = await Promise.all([
    prisma.pointsTransaction.aggregate({
      where: { storeId, type: 'earn' },
      _sum: { points: true },
    }),
    prisma.pointsTransaction.count({ where: { storeId, type: 'redeem' } }),
    prisma.customerPoints.count({ where: { storeId } }),
  ]);

  const pointsIssued = pointsEmitted._sum.points || 0;
  const redemptionRate = activeCustomers > 0 ? (redemptions * 100) / activeCustomers : 0;

  return {
    pointsIssued,
    couponsGenerated: redemptions,
    redemptionRate: Math.round(redemptionRate * 10) / 10,
    activeCustomers,
  };
}

module.exports = {
  getOrCreateConfig,
  updateConfig,
  getTiers,
  setTiers,
  getOrCreateCustomerPoints,
  computeEffectiveBalance,
  creditPointsForOrder,
  getTierProgress,
  redeemCurrentTier,
  listCustomers,
  listRedemptions,
  getStats,
};
