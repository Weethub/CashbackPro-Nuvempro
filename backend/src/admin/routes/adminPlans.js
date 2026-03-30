const express = require('express');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { requireRole } = require('../middleware/requireRole');
const adminPlanService = require('../services/adminPlanService');
const adminLogService = require('../services/adminLogService');
const { stripe } = require('../../config/stripe');

const router = express.Router();

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
 * GET /admin-api/plans/stripe-account
 * Retorna informações da conta Stripe configurada:
 * modo (test/live), nome, email e país.
 * Rota definida ANTES de /:id para evitar conflito de params.
 */
router.get('/stripe-account', async (req, res, next) => {
  try {
    const key = process.env.STRIPE_SECRET_KEY || '';

    // Detecta o modo pelo prefixo da chave
    let mode = 'unknown';
    if (key.startsWith('sk_live_') || key.startsWith('rk_live_')) mode = 'live';
    else if (key.startsWith('sk_test_') || key.startsWith('rk_test_')) mode = 'test';

    // Chave não configurada (demo/placeholder)
    const isConfigured = key.length > 20 && !key.includes('CHANGE_ME') && !key.includes('demo');

    if (!isConfigured) {
      return res.json({
        configured: false,
        mode,
        accountName: null,
        email: null,
        country: null,
        accountId: null,
      });
    }

    // Consulta a conta na API Stripe
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
    // Stripe retornou erro (chave inválida, etc.)
    res.json({
      configured: false,
      mode: 'unknown',
      accountName: null,
      email: null,
      country: null,
      accountId: null,
      error: err.message,
    });
  }
});

/**
 * Normalize a plan row: expose `prices` as alias for `price` for frontend compatibility.
 */
function normalizePlan(plan) {
  return { ...plan, key: plan.name, prices: plan.price };
}

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
 */
router.post('/', requireRole('gerente'), async (req, res, next) => {
  try {
    const { name, features, prices, price, commissionRate, revenueShareRate, sortOrder } = req.body;
    const appId = process.env.APP_SLUG || 'meuapp';

    if (!name) {
      throw new AppError('Nome do plano e obrigatorio.', 400, 'MISSING_NAME');
    }

    const plan = await adminPlanService.create({
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

    res.status(201).json({ plan: normalizePlan(plan) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/plans/verify-stripe — Verify all plans Stripe price IDs at once
 * Rota definida ANTES de /:id para evitar conflito de params.
 */
router.get('/verify-stripe', async (req, res, next) => {
  try {
    const appId = process.env.APP_SLUG || 'meuapp';
    const plans = await adminPlanService.list(appId);
    const verifications = {};

    for (const plan of plans) {
      const key = plan.name; // frontend usa plan.name (ex: "growth") como chave
      const stripePriceIds = plan.stripePriceIds || {};
      const hasPrices = plan.price && Object.values(plan.price).some((v) => v > 0);
      const hasPriceIds = Object.values(stripePriceIds).some(Boolean);

      if (!hasPrices) {
        // Plano gratuito (sem preços): não precisa de Stripe
        verifications[key] = { status: 'synced', reason: 'Plano gratuito' };
      } else if (!hasPriceIds) {
        verifications[key] = { status: 'missing', reason: 'Ainda nao sincronizado com Stripe' };
      } else {
        // Verifica com o Stripe API se os IDs são válidos e os valores batem
        let allValid = true;
        let hasMismatch = false;
        for (const [interval, priceId] of Object.entries(stripePriceIds)) {
          if (!priceId) continue;
          try {
            const stripePrice = await stripe.prices.retrieve(priceId);
            if (!stripePrice.active) {
              allValid = false;
              break;
            }
            const dbAmount = Math.round(((plan.price || {})[interval] || 0) * 100);
            if (dbAmount > 0 && stripePrice.unit_amount !== dbAmount) {
              hasMismatch = true;
            }
          } catch {
            allValid = false;
            break;
          }
        }
        if (!allValid) {
          verifications[key] = { status: 'missing', reason: 'Price IDs invalidos ou inativos no Stripe' };
        } else if (hasMismatch) {
          verifications[key] = { status: 'mismatch', reason: 'Precos divergentes entre banco e Stripe' };
        } else {
          verifications[key] = { status: 'synced', stripePriceIds };
        }
      }
    }

    res.json({ verifications });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /admin-api/plans/:id — Update a plan
 * Aceita ID numérico ou planKey (nome string).
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

    const plan = await adminPlanService.update(planRecord.id, data);

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'update_plan',
      entity: 'admin_plan',
      entityId: planRecord.id,
      details: data,
      ipAddress: req.ip,
    });

    res.json({ plan: normalizePlan(plan) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/plans/:id/deactivate — Deactivate a plan
 * Aceita ID numérico ou planKey (nome string).
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
 * POST /admin-api/plans/:id/sync-stripe — Sync plan to Stripe
 * Aceita ID numérico ou planKey (nome string).
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
 * GET /admin-api/plans/:id/verify-stripe — Verify Stripe price IDs
 * Aceita ID numérico ou planKey (nome string).
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
