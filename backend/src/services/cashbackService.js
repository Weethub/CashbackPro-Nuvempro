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
        icon: t.icon || null,
        color: t.color || '#0F7A5C',
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

  // A chave de i18n do request precisa bater com um idioma real da loja (ex.:
  // "pt", "pt_BR") — um código que a loja não tem faz a API responder 422.
  // Descobrimos o idioma principal em vez de assumir "pt" fixo.
  let lang = 'pt';
  try {
    const { data: info } = await client.get('/store');
    var raw = info?.main_language
      || (Array.isArray(info?.languages) ? info.languages[0] : null);
    if (raw && typeof raw === 'object') raw = raw.code || raw.language || null;
    if (raw) lang = raw;
  } catch (err) {
    console.warn('[createCustomerPage] não obteve idioma da loja, usando "pt":', err.response?.data || err.message);
  }

  const body = {
    page: {
      publish: true,
      i18n: {
        [lang]: {
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
    // Expõe a mensagem da Nuvemshop em vez de "Erro interno do servidor".
    const detail = apiErr && (apiErr.message || apiErr.description || (typeof apiErr === 'string' ? apiErr : JSON.stringify(apiErr)));
    throw new AppError(
      'A Nuvemshop recusou a criação da página' + (detail ? ': ' + detail : '') + '.',
      502,
      'PAGE_CREATE_FAILED'
    );
  }

  const handle = (data?.handle && (data.handle[lang] || data.handle.pt || data.handle.es || data.handle.en)) || null;
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
};
