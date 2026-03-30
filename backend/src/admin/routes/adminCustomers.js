const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { parsePagination, paginatedResponse } = require('../../lib/paginate');
const { requireRole } = require('../middleware/requireRole');
const adminLogService = require('../services/adminLogService');

const router = express.Router();

/**
 * GET /admin-api/customers/dashboard — Dashboard metrics
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const [totalStores, activeSubscriptions, trialStores, starterStores] = await Promise.all([
      prisma.store.count(),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.store.count({ where: { plan: 'starter', trialEndsAt: { gt: new Date() } } }),
      prisma.store.count({ where: { plan: 'starter' } }),
    ]);

    const recentStores = await prisma.store.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, domain: true, plan: true, createdAt: true },
    });

    res.json({
      metrics: {
        totalStores,
        activeSubscriptions,
        trialStores,
        starterStores,
      },
      recentStores,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/customers — List customers with pagination, tabs, search
 * Query: ?tab=all|active|trial|churned&search=term&page=1&limit=20
 */
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    // frontend sends ?status=  (tab key) — accept both param names
    const filter = req.query.status || req.query.tab;
    const { search } = req.query;

    const where = {};

    // Tab filters
    if (filter === 'active') {
      where.subscription = { is: { status: { in: ['active', 'trialing'] } } };
    } else if (filter === 'trial') {
      where.OR = [
        { subscription: { is: { status: 'trialing' } } },
        { trialEndsAt: { gt: new Date() } },
      ];
    } else if (filter === 'expired') {
      where.trialEndsAt = { lte: new Date() };
      where.subscription = { is: null };
    } else if (filter === 'no_plan') {
      where.subscription = { is: null };
    }

    // Search
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { nuvemshopId: { contains: search } },
      ];
    }

    const [stores, total] = await Promise.all([
      prisma.store.findMany({
        where,
        include: { subscription: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.store.count({ where }),
    ]);

    const now = new Date();

    const data = stores.map((s) => {
      // Compute a flat status for the list
      let status = 'no_plan';
      if (s.subscription) {
        const ss = s.subscription.status;
        if (ss === 'trialing') status = 'trial';
        else if (ss === 'active') status = 'active';
        else if (ss === 'past_due') status = 'past_due';
        else if (ss === 'canceled') status = 'canceled';
        else status = ss;
      } else if (s.trialEndsAt && s.trialEndsAt > now) {
        status = 'trial';
      } else if (s.trialEndsAt && s.trialEndsAt <= now) {
        status = 'expired';
      }

      return {
        id: s.id,
        nuvemshopId: s.nuvemshopId,
        name: s.name,
        domain: s.domain,
        email: s.email,
        planKey: s.subscription?.planKey || s.plan || null,
        status,
        trialEndsAt: s.trialEndsAt,
        createdAt: s.createdAt,
        subscription: s.subscription
          ? {
              status: s.subscription.status,
              planKey: s.subscription.planKey,
              billingInterval: s.subscription.billingInterval,
            }
          : null,
      };
    });

    res.json(paginatedResponse(data, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/customers/:id — Customer detail
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const store = await prisma.store.findUnique({
      where: { id },
      include: {
        subscription: true,
        profile: true,
        termsAcceptances: { include: { termsVersion: true } },
      },
    });

    if (!store) {
      throw new AppError('Loja nao encontrada.', 404, 'STORE_NOT_FOUND');
    }

    const invoices = await prisma.invoice.findMany({
      where: { storeId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({ store, invoices });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/customers/:id/impersonate — Generate impersonation token
 */
router.post('/:id/impersonate', requireRole('gerente'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const store = await prisma.store.findUnique({ where: { id } });

    if (!store) {
      throw new AppError('Loja nao encontrada.', 404, 'STORE_NOT_FOUND');
    }

    const token = jwt.sign(
      { storeId: store.id, nuvemshopId: store.nuvemshopId, impersonatedBy: req.admin.id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'impersonate_store',
      entity: 'store',
      entityId: id,
      details: { storeName: store.name },
      ipAddress: req.ip,
      severity: 'warning',
    });

    res.json({ token, expiresIn: '1h' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/customers/:id/extend-trial — Extend trial period
 */
router.post('/:id/extend-trial', requireRole('gerente'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { days } = req.body;

    if (!days || days < 1 || days > 90) {
      throw new AppError('Informe dias entre 1 e 90.', 400, 'INVALID_DAYS');
    }

    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) {
      throw new AppError('Loja nao encontrada.', 404, 'STORE_NOT_FOUND');
    }

    const baseDate = store.trialEndsAt && store.trialEndsAt > new Date()
      ? store.trialEndsAt
      : new Date();

    const newTrialEnd = new Date(baseDate);
    newTrialEnd.setDate(newTrialEnd.getDate() + days);

    const updated = await prisma.store.update({
      where: { id },
      data: { trialEndsAt: newTrialEnd },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'extend_trial',
      entity: 'store',
      entityId: id,
      details: { days, newTrialEnd },
      ipAddress: req.ip,
    });

    res.json({ trialEndsAt: updated.trialEndsAt });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
