const express = require('express');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { requireRole } = require('../middleware/requireRole');
const adminPlanService = require('../services/adminPlanService');
const adminLogService = require('../services/adminLogService');
const { stripe } = require('../../config/stripe');

const router = express.Router();

const intervalMap = {
  monthly:   { interval: 'month', interval_count: 1 },
  semestral: { interval: 'month', interval_count: 6 },
  annual:    { interval: 'year',  interval_count: 1 },
};

/**
 * Resolve um plano pelo param da rota: aceita ID numérico ou planKey (nome string).
 */
async function resolvePlan(param) {
  const numId = parseInt(param);
  if (!isNaN(numId)) {
    const plan = await prisma.adminPlan.findUnique({ where: { id: numId } });
    if (!plan) throw new AppError('Plano nao encontrado.', 404, 'PLAN_NOT_FOUND');
    return plan;
  }
  const appId = process.env.APP_SLUG || 'meuapp';
  const plan = await prisma.adminPlan.findFirst({ where: { appId, name: param } });
  if (!plan) throw new AppError('Plano nao encontrado.', 404, 'PLAN_NOT_FOUND');
  return plan;
}

/**
 * Normalize a plan row: expose `prices` as alias for `price` for frontend compatibility.
 */
function normalizePlan(plan) {
  return { ...plan, key: plan.name, prices: plan.price };
}

/**
 * GET /admin-api/plans/stripe-account
 * Rota definida ANTES de /:id para evitar conflito de params.
 */
router.get('/stripe-account', async (req, res, next) => {
  try {
    const key = process.env.STRIPE_SECRET_KEY || '';

    let mode = 'unknown';
    if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) mode = 'live';
    else if (key.startsWith('sk_test_') || key.startsWith('rk_test_')) mode = 'test';

    const isConfigured = key.length > 20 && !key.includes('CHANGE_ME') && !key.includes('demo');

    if (!isConfigured) {
      return res.json({ configured: false, mode, accountName: null, email: null, country: null, accountId: null });
    }

    const account = await stripe.accounts.retrieve();
    res.json({
      configured: true,
      mode,
      accountName: account.settings?.dashboard?.display_name || account.business_profile?.name || null,
      email: account.email || null,
      country: account.country || null,
      accountId: account.id || null,
    });
  } catch (err) {
    res.json({ configured: false, mode: 'unknown', accountName: null, email: null, country: null, accountId: null, error: err.message });
  }
});

/**
 * GET /admin-api/plans — List all plans
 */
router.get('/', async (req, res, next) => {
  try {
    const appId = process.env.APP_SLUG || 'meuapp';
    const plans = await adminPlanService.list(appId);
    res.json({ plans: plans.map(normalizePlan) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/plans — Create a plan
 * Após criar, sincroniza automaticamente com o Stripe (se configurado).
 */
router.post('/', requireRole('gerente'), async (req, res, next) => {
  try {
    const { name, features, prices, price, commissionRate, revenueShareRate, sortOrder } = req.body;
    const appId = process.env.APP_SLUG || 'meuapp';

    if (!name) throw new AppError('Nome do plano e obrigatorio.', 400, 'MISSING_NAME');

    let plan = await adminPlanService.create({
      appId,
      name,
      features: features || {},
      price: prices || price || {},
      commissionRate: commissionRate || 0,
      revenueShareRate: revenueShareRate || 0,
      sortOrder: sortOrder || 0,
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'create_plan',
      entity: 'admin_plan',
      entityId: plan.id,
      details: { name },
      ipAddress: req.ip,
    });

    // Auto-sync com Stripe após criação
    try {
      plan = await adminPlanService.syncToStripe(plan.id);
    } catch {
      // Stripe não configurado ou erro temporário — retorna plano sem sync
    }

    res.status(201).json({ plan: normalizePlan(plan) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/plans/verify-stripe — Verifica todos os planos no Stripe
 *
 * Busca o produto Stripe de cada plano por metadata (admin_plan_id / plan_key+app_id).
 * Se encontrar o produto mas os IDs no banco estiverem errados, corrige automaticamente (auto-heal).
 * Retorna: synced | mismatch | missing para cada plano.
 *
 * Rota definida ANTES de /:id para evitar conflito de params.
 */
router.get('/verify-stripe', async (req, res, next) => {
  try {
    const appId = process.env.APP_SLUG || 'meuapp';
    const plans = await adminPlanService.list(appId);
    const verifications = {};

    for (const plan of plans) {
      const key = plan.name;
      const hasPrices = plan.price && Object.values(plan.price).some((v) => v > 0);

      if (!hasPrices) {
        verifications[key] = { status: 'synced', reason: 'Plano gratuito' };
        continue;
      }

      // Busca o produto no Stripe pela metadata do plano
      let product = null;
      try {
        const byId = await stripe.products.search({
          query: `metadata['admin_plan_id']:'${plan.id}'`,
        });
        if (byId.data.length > 0) {
          product = byId.data[0];
        } else {
          // Fallback: busca por plan_key + app_id
          const byKey = await stripe.products.search({
            query: `metadata['plan_key']:'${plan.name}' AND metadata['app_id']:'${plan.appId}'`,
          });
          if (byKey.data.length > 0) product = byKey.data[0];
        }
      } catch {
        verifications[key] = { status: 'missing', reason: 'Erro ao consultar o Stripe' };
        continue;
      }

      if (!product) {
        verifications[key] = { status: 'missing', reason: 'Produto nao encontrado no Stripe' };
        continue;
      }

      // Lista preços ativos do produto
      const activePrices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });

      let hasMismatch = false;
      let allConfigured = true;
      const foundPriceIds = {};

      for (const [intervalKey, config] of Object.entries(intervalMap)) {
        const dbAmount = (plan.price || {})[intervalKey];
        if (!dbAmount || dbAmount <= 0) continue;

        const expectedAmount = Math.round(dbAmount * 100);
        const match = activePrices.data.find(
          (p) =>
            p.recurring?.interval === config.interval &&
            p.recurring?.interval_count === config.interval_count &&
            p.currency === 'brl'
        );

        if (!match) {
          allConfigured = false;
          break;
        }

        foundPriceIds[intervalKey] = match.id;

        if (match.unit_amount !== expectedAmount) {
          hasMismatch = true;
        }
      }

      if (!allConfigured) {
        verifications[key] = { status: 'missing', reason: 'Precos nao configurados no Stripe' };
        continue;
      }

      // Auto-heal: atualiza o banco se os IDs encontrados no Stripe divergem do que está salvo
      const currentIds = plan.stripePriceIds || {};
      const idsOutdated = Object.entries(foundPriceIds).some(([k, v]) => currentIds[k] !== v);
      if (idsOutdated) {
        await prisma.adminPlan.update({
          where: { id: plan.id },
          data: { stripePriceIds: { ...currentIds, ...foundPriceIds } },
        });
      }

      if (hasMismatch) {
        verifications[key] = { status: 'mismatch', reason: 'Precos divergentes entre banco e Stripe' };
      } else {
        verifications[key] = { status: 'synced', stripePriceIds: foundPriceIds };
      }
    }

    res.json({ verifications });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /admin-api/plans/:id — Update a plan
 * Após salvar, sincroniza automaticamente com o Stripe (se configurado).
 */
router.put('/:id', requireRole('gerente'), async (req, res, next) => {
  try {
    const planRecord = await resolvePlan(req.params.id);
    const { name, features, prices, price, commissionRate, revenueShareRate, sortOrder, isActive } = req.body;

    const data = {};
    if (name !== undefined) data.name = name;
    if (features !== undefined) data.features = features;
    if (prices !== undefined) data.price = prices;
    else if (price !== undefined) data.price = price;
    if (commissionRate !== undefined) data.commissionRate = commissionRate;
    if (revenueShareRate !== undefined) data.revenueShareRate = revenueShareRate;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (isActive !== undefined) data.isActive = isActive;

    let plan = await adminPlanService.update(planRecord.id, data);

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'update_plan',
      entity: 'admin_plan',
      entityId: planRecord.id,
      details: data,
      ipAddress: req.ip,
    });

    // Se isActive mudou para false → arquiva produto/preços no Stripe (sem novas assinaturas)
    // Se isActive continua true ou foi ativado → sincroniza/cria no Stripe normalmente
    if (data.isActive === false) {
      try {
        await adminPlanService.archiveInStripe(planRecord);
      } catch {
        // Stripe não configurado ou erro temporário — ignora
      }
    } else {
      try {
        plan = await adminPlanService.syncToStripe(planRecord.id);
      } catch {
        // Stripe não configurado ou erro temporário — retorna plano sem sync
      }
    }

    res.json({ plan: normalizePlan(plan) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/plans/:id/deactivate — Deactivate a plan
 */
router.post('/:id/deactivate', requireRole('gerente'), async (req, res, next) => {
  try {
    const planRecord = await resolvePlan(req.params.id);
    const plan = await adminPlanService.deactivate(planRecord.id);

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'deactivate_plan',
      entity: 'admin_plan',
      entityId: planRecord.id,
      ipAddress: req.ip,
    });

    res.json({ plan: normalizePlan(plan) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/plans/:id/sync-stripe — Sync manual com Stripe
 */
router.post('/:id/sync-stripe', requireRole('proprietario'), async (req, res, next) => {
  try {
    const planRecord = await resolvePlan(req.params.id);
    const plan = await adminPlanService.syncToStripe(planRecord.id);

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'sync_plan_to_stripe',
      entity: 'admin_plan',
      entityId: planRecord.id,
      details: { stripePriceIds: plan.stripePriceIds },
      ipAddress: req.ip,
    });

    res.json({ plan: normalizePlan(plan) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/plans/:id/verify-stripe — Verify individual plan
 */
router.get('/:id/verify-stripe', async (req, res, next) => {
  try {
    const planRecord = await resolvePlan(req.params.id);
    const result = await adminPlanService.verifyStripeIds(planRecord.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
