const express = require('express');
const { AppError } = require('../../lib/errors');
const { requireRole } = require('../middleware/requireRole');
const adminPlanService = require('../services/adminPlanService');
const adminLogService = require('../services/adminLogService');

const router = express.Router();

/**
 * GET /admin-api/plans — List all plans
 */
router.get('/', async (req, res, next) => {
  try {
    const appId = process.env.APP_SLUG || 'meuapp';
    const plans = await adminPlanService.list(appId);
    res.json({ plans });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/plans — Create a plan
 */
router.post('/', requireRole('gerente'), async (req, res, next) => {
  try {
    const { name, features, price, commissionRate, revenueShareRate, sortOrder } = req.body;
    const appId = process.env.APP_SLUG || 'meuapp';

    if (!name) {
      throw new AppError('Nome do plano e obrigatorio.', 400, 'MISSING_NAME');
    }

    const plan = await adminPlanService.create({
      appId,
      name,
      features: features || {},
      price: price || {},
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

    res.status(201).json({ plan });
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
    const { name, features, price, commissionRate, revenueShareRate, sortOrder, isActive } = req.body;

    const data = {};
    if (name !== undefined) data.name = name;
    if (features !== undefined) data.features = features;
    if (price !== undefined) data.price = price;
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

    res.json({ plan });
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

    res.json({ plan });
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

    res.json({ plan });
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
