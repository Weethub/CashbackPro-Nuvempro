const express = require('express');
const { AppError } = require('../../lib/errors');
const { requireRole } = require('../middleware/requireRole');
const adminPlanService = require('../services/adminPlanService');
const adminLogService = require('../services/adminLogService');
const { stripe } = require('../../config/stripe');

const router = express.Router();

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
  return { ...plan, prices: plan.price };
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
      const key = plan.id;
      const stripePriceIds = plan.stripePriceIds || {};
      const hasPrices = plan.price && Object.values(plan.price).some((v) => v > 0);
      const hasPriceIds = Object.values(stripePriceIds).some(Boolean);

      if (!hasPrices) {
        verifications[key] = { status: 'missing', reason: 'Plano sem precos configurados' };
      } else if (!hasPriceIds) {
        verifications[key] = { status: 'missing', reason: 'Ainda nao sincronizado com Stripe' };
      } else {
        verifications[key] = { status: 'synced', stripePriceIds };
      }
    }

    res.json({ verifications });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /admin-api/plans/:id — Update a plan
 */
router.put('/:id', requireRole('gerente'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
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

    const plan = await adminPlanService.update(id, data);

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'update_plan',
      entity: 'admin_plan',
      entityId: id,
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
 */
router.post('/:id/deactivate', requireRole('gerente'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const plan = await adminPlanService.deactivate(id);

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'deactivate_plan',
      entity: 'admin_plan',
      entityId: id,
      ipAddress: req.ip,
    });

    res.json({ plan: normalizePlan(plan) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/plans/:id/sync-stripe — Sync plan to Stripe
 */
router.post('/:id/sync-stripe', requireRole('proprietario'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const plan = await adminPlanService.syncToStripe(id);

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'sync_plan_to_stripe',
      entity: 'admin_plan',
      entityId: id,
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
 */
router.get('/:id/verify-stripe', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const result = await adminPlanService.verifyStripeIds(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
