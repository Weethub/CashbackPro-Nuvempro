const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { createNuvemshopClient, NUVEMSHOP_API_BASE_2025 } = require('../config/nuvemshop');
const { sendEmail } = require('../lib/email');

const CYCLE_MONTHS = 6;

// ─── Config ───────────────────────────────────────────────────────────────

async function getOrCreateConfig(storeId) {
  const existing = await prisma.cashbackConfig.findUnique({ where: { storeId } });
  if (existing) return existing;
  return prisma.cashbackConfig.create({ data: { storeId } });
}

async function updateConfig(storeId, data) {
  const {
    isActive,
    pointsPerCurrency,
    welcomeMessage,
    redeemMessage,
    widgetIconPosition,
    widgetIconSize,
    customerPageHandle,
    brandColor,
    referralEnabled,
    referralPointsReferrer,
    referralPointsReferred,
    referralRules,
    welcomeBonusEnabled,
    welcomeBonusPoints,
    howItWorks,
    winbackEnabled,
    winbackDays,
    winbackPoints,
    pointsExpiryEnabled,
    pointsExpiryWarningDays,
    supportMessage,
    supportWhatsapp,
    supportEmail,
  } = data;

  const fields = {
    ...(isActive !== undefined && { isActive: Boolean(isActive) }),
    ...(pointsPerCurrency !== undefined && { pointsPerCurrency: parseFloat(pointsPerCurrency) }),
    ...(welcomeMessage !== undefined && { welcomeMessage }),
    ...(redeemMessage !== undefined && { redeemMessage }),
    ...(widgetIconPosition !== undefined && { widgetIconPosition }),
    ...(widgetIconSize !== undefined && { widgetIconSize }),
    ...(customerPageHandle !== undefined && { customerPageHandle: customerPageHandle || null }),
    ...(brandColor !== undefined && { brandColor: brandColor || '#7C3AED' }),
    ...(referralEnabled !== undefined && { referralEnabled: Boolean(referralEnabled) }),
    ...(referralPointsReferrer !== undefined && { referralPointsReferrer: Math.max(0, parseInt(referralPointsReferrer) || 0) }),
    ...(referralPointsReferred !== undefined && { referralPointsReferred: Math.max(0, parseInt(referralPointsReferred) || 0) }),
    ...(referralRules !== undefined && { referralRules: referralRules || null }),
    ...(welcomeBonusEnabled !== undefined && { welcomeBonusEnabled: Boolean(welcomeBonusEnabled) }),
    ...(welcomeBonusPoints !== undefined && { welcomeBonusPoints: Math.max(0, parseInt(welcomeBonusPoints) || 0) }),
    ...(howItWorks !== undefined && { howItWorks: howItWorks || null }),
    ...(winbackEnabled !== undefined && { winbackEnabled: Boolean(winbackEnabled) }),
    ...(winbackDays !== undefined && { winbackDays: Math.max(1, parseInt(winbackDays) || 60) }),
    ...(winbackPoints !== undefined && { winbackPoints: Math.max(0, parseInt(winbackPoints) || 0) }),
    ...(pointsExpiryEnabled !== undefined && { pointsExpiryEnabled: Boolean(pointsExpiryEnabled) }),
    ...(pointsExpiryWarningDays !== undefined && { pointsExpiryWarningDays: Math.max(1, parseInt(pointsExpiryWarningDays) || 15) }),
    ...(supportMessage !== undefined && { supportMessage: supportMessage || null }),
    // Só dígitos (com DDI) — formato exigido pelo link wa.me.
    ...(supportWhatsapp !== undefined && { supportWhatsapp: supportWhatsapp ? String(supportWhatsapp).replace(/\D/g, '') || null : null }),
    ...(supportEmail !== undefined && { supportEmail: supportEmail || null }),
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
        // Só aceita data URI de imagem — esse campo vai pro <img src> na
        // página do cliente sem processamento adicional; qualquer outro
        // formato é descartado (defesa contra injeção via valor malformado).
        icon: typeof t.icon === 'string' && /^data:image\//.test(t.icon) ? t.icon : null,
        color: t.color || '#0F7A5C',
        // Benefícios: lista de textos não-vazios. Multiplicador: >= 1.
        benefits: Array.isArray(t.benefits)
          ? t.benefits.map((b) => String(b).trim()).filter(Boolean)
          : [],
        pointsMultiplier: Math.max(1, parseFloat(t.pointsMultiplier) || 1),
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

// ─── Indique e ganhe (referral) ─────────────────────────────────────────────

function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars, ex: A1B2C3D4
}

// Garante que o cliente tem um código de indicação próprio (gera na 1ª vez).
async function ensureReferralCode(customerPoints) {
  if (customerPoints.referralCode) return customerPoints;
  for (let i = 0; i < 5; i++) {
    try {
      return await prisma.customerPoints.update({
        where: { id: customerPoints.id },
        data: { referralCode: generateReferralCode() },
      });
    } catch (err) {
      if (err.code === 'P2002') continue; // colisão de código único — tenta outro
      throw err;
    }
  }
  return customerPoints;
}

// Vincula quem indicou (chamado no login com ?ref=CODE). Idempotente e com
// travas anti-fraude: não sobrescreve, não deixa auto-indicação, exige que o
// código pertença a OUTRO cliente da mesma loja.
async function bindReferral(storeId, customerPoints, code) {
  if (!code || customerPoints.referredByCode) return customerPoints;
  if (customerPoints.referralCode === code) return customerPoints;
  const referrer = await prisma.customerPoints.findFirst({ where: { storeId, referralCode: code } });
  if (!referrer || referrer.id === customerPoints.id) return customerPoints;
  return prisma.customerPoints.update({
    where: { id: customerPoints.id },
    data: { referredByCode: code },
  });
}

// Recompensa a indicação quando o indicado faz a 1ª compra paga. Só uma vez
// (referralRewardedAt trava). Credita pontos pro indicado e pro indicador.
async function rewardReferralIfDue(store, customerPointsId) {
  const config = await getOrCreateConfig(store.id);
  if (!config.referralEnabled) return;

  const cp = await prisma.customerPoints.findUnique({ where: { id: customerPointsId } });
  if (!cp || !cp.referredByCode || cp.referralRewardedAt) return;

  const referrer = await prisma.customerPoints.findFirst({
    where: { storeId: store.id, referralCode: cp.referredByCode },
  });
  if (!referrer || referrer.id === cp.id) return;

  const toReferred = config.referralPointsReferred || 0;
  const toReferrer = config.referralPointsReferrer || 0;

  await prisma.$transaction(async (tx) => {
    // Marca primeiro pra garantir idempotência mesmo com webhooks repetidos.
    await tx.customerPoints.update({ where: { id: cp.id }, data: { referralRewardedAt: new Date() } });

    if (toReferred > 0) {
      const fresh = await ensureCycleFresh(tx, cp);
      await tx.pointsTransaction.create({
        data: { customerPointsId: fresh.id, storeId: store.id, type: 'referral', points: toReferred, note: 'Bônus de boas-vindas por indicação' },
      });
      await tx.customerPoints.update({ where: { id: fresh.id }, data: { pointsBalance: { increment: toReferred } } });
    }
    if (toReferrer > 0) {
      const freshRef = await ensureCycleFresh(tx, referrer);
      await tx.pointsTransaction.create({
        data: { customerPointsId: freshRef.id, storeId: store.id, type: 'referral', points: toReferrer, note: 'Seu amigo indicado fez a primeira compra' },
      });
      await tx.customerPoints.update({ where: { id: freshRef.id }, data: { pointsBalance: { increment: toReferrer } } });
    }
  });
}

// Bônus de boas-vindas: credita uma única vez (guarda por transação 'welcome')
// na primeira compra do cliente. Best-effort, chamado de creditPointsForOrder.
async function rewardWelcomeBonusIfDue(store, customerPointsId) {
  const config = await getOrCreateConfig(store.id);
  if (!config.welcomeBonusEnabled || !config.welcomeBonusPoints) return;

  const already = await prisma.pointsTransaction.findFirst({
    where: { customerPointsId, type: 'welcome' },
  });
  if (already) return;

  const cp = await prisma.customerPoints.findUnique({ where: { id: customerPointsId } });
  if (!cp) return;

  await prisma.$transaction(async (tx) => {
    const fresh = await ensureCycleFresh(tx, cp);
    await tx.pointsTransaction.create({
      data: { customerPointsId: fresh.id, storeId: store.id, type: 'welcome', points: config.welcomeBonusPoints, note: 'Bônus de boas-vindas' },
    });
    await tx.customerPoints.update({ where: { id: fresh.id }, data: { pointsBalance: { increment: config.welcomeBonusPoints } } });
  });
}

// Estatísticas de indicação de um cliente (pro card no dashboard).
async function getReferralStats(storeId, customerPoints, config) {
  const count = await prisma.customerPoints.count({
    where: { storeId, referredByCode: customerPoints.referralCode || '__none__', referralRewardedAt: { not: null } },
  });
  return {
    enabled: !!config.referralEnabled,
    code: customerPoints.referralCode || null,
    count,
    pointsEarned: count * (config.referralPointsReferrer || 0),
    rules: config.referralRules || null,
  };
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

  // O multiplicador é o do nível ATUAL do cliente no momento da compra (ex.:
  // Ouro com 1.2 ganha 20% a mais). Calculado antes de creditar.
  const { currentTier: tierBefore } = await getTierProgress(store.id, customerPoints);
  const multiplier = tierBefore?.pointsMultiplier || 1;

  const pointsEarned = Math.floor(orderTotal * config.pointsPerCurrency * multiplier);
  if (pointsEarned <= 0) return { skipped: 'zero_points' };

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

  // Bônus de boas-vindas (1ª compra) — best-effort.
  try {
    await rewardWelcomeBonusIfDue(store, updated.id);
  } catch (err) {
    console.error('[welcome] falha ao creditar bônus de boas-vindas (ignorado):', err.message);
  }

  // Indique e ganhe: se este cliente foi indicado, recompensa na 1ª compra
  // (best-effort — nunca derruba o crédito da compra).
  try {
    await rewardReferralIfDue(store, updated.id);
  } catch (err) {
    console.error('[referral] falha ao recompensar indicação (ignorado):', err.message);
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
 * Consulta na Nuvemshop se cada cupom gerado foi de fato usado no checkout
 * (não só emitido). Sem isso não há como saber a taxa de resgate real —
 * "cupom gerado" não é o mesmo que "cupom usado". Best-effort por cupom:
 * falha individual não derruba a lista inteira (used: null quando não dá
 * pra confirmar).
 */
async function enrichCouponsWithUsage(store, redemptions) {
  if (redemptions.length === 0) return redemptions;
  const client = createNuvemshopClient(store.nuvemshopId, store.accessToken);
  return Promise.all(
    redemptions.map(async (r) => {
      if (!r.couponCode) return { ...r, used: null };
      try {
        const { data } = await client.get('/coupons', { params: { code: r.couponCode } });
        const match = Array.isArray(data) ? data[0] : null;
        return { ...r, used: match ? match.used > 0 : null };
      } catch {
        return { ...r, used: null };
      }
    })
  );
}

/**
 * Lista resgates (cupons gerados) da loja, paginada, com e-mail do cliente e
 * status real de uso do cupom na Nuvemshop.
 */
async function listRedemptions(store, { page, limit, skip }) {
  const where = { storeId: store.id, type: 'redeem' };

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

  const data = await enrichCouponsWithUsage(
    store,
    transactions.map((t) => ({
      id: t.id,
      email: t.customerPoints?.email || null,
      points: t.points,
      couponCode: t.couponCode,
      note: t.note,
      createdAt: t.createdAt,
    }))
  );

  return { data, total };
}

// ─── Página "Minha Fidelidade" ──────────────────────────────────────────────

/**
 * Lista as páginas já existentes na loja (o lojista cria/edita a página no
 * admin da própria Nuvemshop — nós só listamos pra ele escolher qual delas é
 * a página de fidelidade em CashbackConfig.customerPageHandle). Exige o
 * escopo read_content; loja instalada antes desse escopo existir precisa
 * reinstalar o app pra conceder.
 */
async function listStorePages(store) {
  // /pages nao existe no /v1 legado (404) — só na versao atual da API.
  const client = createNuvemshopClient(store.nuvemshopId, store.accessToken, NUVEMSHOP_API_BASE_2025);
  let data;
  try {
    ({ data } = await client.get('/pages', { params: { per_page: 20 } }));
  } catch (err) {
    if (err.response?.status === 403) {
      throw new AppError(
        'O app precisa da permissão de páginas (read_content) — desinstale e reinstale o app pra conceder o escopo novo.',
        403,
        'MISSING_CONTENT_SCOPE'
      );
    }
    throw err;
  }

  // A resposta vem como { pages: { results: [...], total, page, ... } }, não
  // um array na raiz — sem isso, o dropdown sempre ficava vazio mesmo com
  // páginas reais na loja.
  const results = data?.pages?.results || [];
  return results.map((page) => ({
    handle: page.handle?.pt || page.handle?.es || page.handle?.en || null,
    name: page.name?.pt || page.name?.es || page.name?.en || '(sem título)',
  })).filter((page) => page.handle);
}

/**
 * Cria a página "Minha Fidelidade" na loja (Nuvemshop Pages API) com um
 * simples link pra `fidelidade.html` — sem <script>, então não esbarra na
 * sanitização de conteúdo de Pages. Idempotente: se já existe um handle
 * salvo, retorna ele em vez de criar duplicada. Precisa da 2025-03 (o /v1
 * legado não tem o recurso /pages).
 */
async function createCustomerPage(store) {
  const config = await getOrCreateConfig(store.id);
  const pageUrl = `${process.env.FRONTEND_URL}/fidelidade.html?store=${store.nuvemshopId}`;

  if (config.customerPageHandle) {
    return { created: false, handle: config.customerPageHandle, pageUrl };
  }

  const content =
    '<div style="text-align:center;padding:32px 16px;">' +
    '<h2>Minha Fidelidade</h2>' +
    '<p>Acompanhe seus pontos, seu nível e resgate seus cupons de desconto.</p>' +
    '<p><a href="' +
    pageUrl +
    '" style="display:inline-block;background:#0F7A5C;color:#ffffff;padding:14px 28px;border-radius:4px;text-decoration:none;font-weight:bold;">Acessar minha conta</a></p>' +
    '</div>';

  const client = createNuvemshopClient(store.nuvemshopId, store.accessToken, NUVEMSHOP_API_BASE_2025);

  // Idioma da loja: a resposta usa código curto ("pt"), mas o REQUEST de
  // criação exige o locale completo na chave de i18n ("pt_BR") — testado
  // contra a API real: chave "pt" faz o título entrar vazio -> 400. Mapeamos
  // o main_language (curto) pro locale de request.
  const LOCALE_MAP = { pt: 'pt_BR', es: 'es_AR', en: 'en_US' };
  let short = 'pt';
  try {
    const { data: info } = await client.get('/store');
    let raw = info?.main_language;
    if (raw && typeof raw === 'object') raw = raw.code || raw.language || null;
    if (raw) short = raw;
  } catch (err) {
    console.warn('[createCustomerPage] não obteve idioma da loja, usando "pt":', err.response?.data || err.message);
  }
  const locale = LOCALE_MAP[short] || short;

  // Formato correto da API 2025-03 (confirmado contra a API real): wrapper
  // { page: { publish, i18n: { <locale>: { title, content, seo_* } } } }.
  const body = {
    page: {
      publish: true,
      i18n: {
        [locale]: {
          title: 'Minha Fidelidade',
          content,
          seo_handle: 'minha-fidelidade',
          seo_title: 'Minha Fidelidade',
          seo_description: 'Acompanhe seus pontos e resgate cupons de desconto.',
        },
      },
    },
  };

  let data;
  try {
    ({ data } = await client.post('/pages', body));
  } catch (err) {
    const status = err.response?.status;
    const apiErr = err.response?.data;
    // Loga o motivo real (some no 500 genérico) pra diagnóstico no Railway.
    console.error('[createCustomerPage] POST /pages falhou', status, JSON.stringify(apiErr) || err.message);
    if (status === 401 || status === 403) {
      throw new AppError(
        'O app precisa da permissão de páginas (write_content). Reinstale o app concedendo esse escopo.',
        403,
        'MISSING_CONTENT_SCOPE'
      );
    }
    // description traz o detalhe útil da Nuvemshop (message é só "Bad Request").
    const detail = apiErr && (apiErr.description || apiErr.message || (typeof apiErr === 'string' ? apiErr : JSON.stringify(apiErr)));
    throw new AppError(
      'A Nuvemshop recusou a criação da página' + (detail ? ': ' + detail : '') + '.',
      502,
      'PAGE_CREATE_FAILED'
    );
  }

  // A resposta usa código curto na chave (handle.pt), não o locale do request.
  const handle = (data?.handle && (data.handle[short] || data.handle.pt || data.handle.es || data.handle.en)) || null;
  if (handle) {
    await prisma.cashbackConfig.update({ where: { id: config.id }, data: { customerPageHandle: handle } });
  }

  return { created: true, handle, pageUrl };
}

// ─── Dashboard (painel do lojista) ─────────────────────────────────────────

async function getStats(store) {
  const storeId = store.id;
  const [pointsEmitted, redeemTransactions, activeCustomers] = await Promise.all([
    prisma.pointsTransaction.aggregate({
      where: { storeId, type: 'earn' },
      _sum: { points: true },
    }),
    prisma.pointsTransaction.findMany({
      where: { storeId, type: 'redeem' },
      select: { couponCode: true },
    }),
    prisma.customerPoints.count({ where: { storeId } }),
  ]);

  const pointsIssued = pointsEmitted._sum.points || 0;
  const couponsGenerated = redeemTransactions.length;

  // Taxa de resgate = % dos cupons GERADOS que foram de fato USADOS no
  // checkout (dado real da Nuvemshop) — nao emitidos/clientes, que pode
  // passar de 100% se um cliente resgatar mais de uma vez.
  const enriched = await enrichCouponsWithUsage(store, redeemTransactions);
  const withKnownUsage = enriched.filter((r) => r.used !== null);
  const usedCount = withKnownUsage.filter((r) => r.used).length;
  const redemptionRate = withKnownUsage.length > 0 ? (usedCount * 100) / withKnownUsage.length : 0;

  return {
    pointsIssued,
    couponsGenerated,
    redemptionRate: Math.round(redemptionRate * 10) / 10,
    activeCustomers,
  };
}

/**
 * Série diária de pontos emitidos (earn) e resgates (redeem) dos últimos `days`
 * dias, pra gráfico de linha no dashboard. Preenche dias sem movimento com 0
 * (não pula datas) pra o eixo X do gráfico ficar contínuo.
 */
async function getStatsTimeSeries(storeId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const transactions = await prisma.pointsTransaction.findMany({
    where: { storeId, createdAt: { gte: since }, type: { in: ['earn', 'redeem'] } },
    select: { type: true, points: true, createdAt: true },
  });

  const byDay = new Map();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { date: key, pointsIssued: 0, redemptions: 0 });
  }

  for (const tx of transactions) {
    const key = tx.createdAt.toISOString().slice(0, 10);
    const bucket = byDay.get(key);
    if (!bucket) continue;
    if (tx.type === 'earn') bucket.pointsIssued += tx.points;
    else bucket.redemptions += 1;
  }

  return Array.from(byDay.values());
}

/**
 * Quantidade de clientes por nível atual (o maior tier que o saldo alcança) +
 * bucket "sem nível" pra quem ainda não bateu o primeiro tier. Pra gráfico de
 * barras/donut de distribuição no dashboard.
 */
async function getTierDistribution(storeId) {
  const [tiers, customers] = await Promise.all([
    prisma.cashbackTier.findMany({ where: { storeId }, orderBy: { pointsRequired: 'asc' } }),
    prisma.customerPoints.findMany({ where: { storeId }, select: { pointsBalance: true, cycleStartedAt: true } }),
  ]);

  const counts = tiers.map((t) => ({ name: t.name, pointsRequired: t.pointsRequired, color: t.color, count: 0 }));
  let noTier = 0;

  for (const customer of customers) {
    const balance = computeEffectiveBalance(customer);
    let reachedIndex = -1;
    tiers.forEach((t, i) => {
      if (t.pointsRequired <= balance) reachedIndex = i;
    });
    if (reachedIndex === -1) noTier += 1;
    else counts[reachedIndex].count += 1;
  }

  return { noTier, tiers: counts };
}

// ─── Jobs diários (cron) ────────────────────────────────────────────────────
// Rodados uma vez por dia pelo Railway Cron (POST /api/cron/daily). Cada tarefa
// tem trava anti-reenvio própria pra não spammar o cliente todo dia.

async function runWinbackForStore(store, config) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (config.winbackDays || 60));
  let sent = 0;

  const customers = await prisma.customerPoints.findMany({
    where: { storeId: store.id, email: { not: null } },
  });
  for (const cp of customers) {
    const lastEarn = await prisma.pointsTransaction.findFirst({
      where: { customerPointsId: cp.id, type: 'earn' },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastEarn) continue; // nunca comprou — reconquista é pra quem sumiu
    if (lastEarn.createdAt >= cutoff) continue; // ainda ativo
    // Já avisado neste período ocioso? (só reenvia depois de uma nova compra)
    if (cp.winbackSentAt && cp.winbackSentAt >= lastEarn.createdAt) continue;

    const bonus = config.winbackPoints || 0;
    if (bonus > 0) {
      await prisma.$transaction(async (tx) => {
        const fresh = await ensureCycleFresh(tx, cp);
        await tx.pointsTransaction.create({
          data: { customerPointsId: fresh.id, storeId: store.id, type: 'bonus', points: bonus, note: 'Bônus de reconquista' },
        });
        await tx.customerPoints.update({ where: { id: fresh.id }, data: { pointsBalance: { increment: bonus } } });
      });
    }
    await prisma.customerPoints.update({ where: { id: cp.id }, data: { winbackSentAt: new Date() } });

    sendEmail({
      to: cp.email,
      subject: 'Sentimos sua falta!',
      html:
        `<p>Faz um tempinho que você não aparece por aqui.</p>` +
        (bonus > 0 ? `<p>Como incentivo, você ganhou <strong>${bonus} pontos</strong> — aproveite na sua próxima compra!</p>` : `<p>Volte para aproveitar seus pontos e continuar subindo de nível.</p>`),
    });
    sent++;
  }
  return sent;
}

async function runPointsExpiryForStore(store, config) {
  const warningDays = config.pointsExpiryWarningDays || 15;
  const now = new Date();
  let warned = 0;

  const customers = await prisma.customerPoints.findMany({
    where: { storeId: store.id, email: { not: null }, pointsBalance: { gt: 0 } },
  });
  for (const cp of customers) {
    const cycleEnd = new Date(cp.cycleStartedAt);
    cycleEnd.setMonth(cycleEnd.getMonth() + CYCLE_MONTHS);
    const warnStart = new Date(cycleEnd);
    warnStart.setDate(warnStart.getDate() - warningDays);
    if (now < warnStart || now >= cycleEnd) continue; // fora da janela de aviso
    // Já avisado neste ciclo? (warnedAt depois do início do ciclo atual)
    if (cp.pointsExpiryWarnedAt && cp.pointsExpiryWarnedAt >= cp.cycleStartedAt) continue;

    await prisma.customerPoints.update({ where: { id: cp.id }, data: { pointsExpiryWarnedAt: now } });

    const daysLeft = Math.max(1, Math.ceil((cycleEnd - now) / (1000 * 60 * 60 * 24)));
    sendEmail({
      to: cp.email,
      subject: 'Seus pontos vão expirar em breve',
      html: `<p>Você tem <strong>${cp.pointsBalance} pontos</strong> que vencem em <strong>${daysLeft} dia(s)</strong>.</p><p>Resgate ou use antes que expirem!</p>`,
    });
    warned++;
  }
  return warned;
}

// Roda todas as tarefas diárias em todas as lojas ativas. Best-effort por loja:
// erro numa loja não derruba as outras.
async function runDailyJobs() {
  const stores = await prisma.store.findMany({
    where: { accessToken: { not: null } },
    select: { id: true, name: true, nuvemshopId: true, accessToken: true },
  });
  const summary = { storesChecked: 0, winbackSent: 0, expiryWarned: 0, errors: [] };
  for (const store of stores) {
    try {
      const config = await getOrCreateConfig(store.id);
      if (!config.isActive) continue;
      summary.storesChecked++;
      if (config.winbackEnabled) summary.winbackSent += await runWinbackForStore(store, config);
      if (config.pointsExpiryEnabled) summary.expiryWarned += await runPointsExpiryForStore(store, config);
    } catch (err) {
      console.error(`[cron] falha na loja ${store.id}:`, err.message);
      summary.errors.push(String(store.id));
    }
  }
  return summary;
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
  getStatsTimeSeries,
  getTierDistribution,
  listStorePages,
  createCustomerPage,
  ensureReferralCode,
  bindReferral,
  getReferralStats,
  runDailyJobs,
};
