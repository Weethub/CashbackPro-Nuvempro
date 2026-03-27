const express = require('express');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { checkoutLimiter } = require('../middleware/rateLimiter');
const { StripeService } = require('../config/stripe');
const { getPriceId, isValidPlan, getAvailablePlans } = require('../config/plans');

const router = express.Router();

// All billing routes require auth
router.use(requireAuth);

/**
 * POST /api/billing/checkout — Create Stripe Checkout Session
 */
router.post('/checkout', checkoutLimiter, async (req, res, next) => {
  try {
    const { planKey, billingInterval } = req.body;

    if (!planKey || !billingInterval) {
      throw new AppError('planKey e billingInterval sao obrigatorios.', 400, 'MISSING_FIELDS');
    }

    if (!isValidPlan(planKey, billingInterval)) {
      throw new AppError('Plano ou intervalo invalido.', 400, 'INVALID_PLAN');
    }

    const priceId = getPriceId(planKey, billingInterval);
    if (!priceId) {
      throw new AppError('Preco nao configurado para este plano.', 400, 'PRICE_NOT_CONFIGURED');
    }

    const session = await StripeService.createCheckoutSession(
      req.store,
      priceId,
      planKey,
      billingInterval
    );

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/billing/status — Get current subscription status
 */
router.get('/status', async (req, res, next) => {
  try {
    const status = await StripeService.getSubscriptionStatus(req.store);

    res.json({
      plan: req.store.plan,
      trialEndsAt: req.store.trialEndsAt,
      subscription: status,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/billing/portal — Create Stripe Billing Portal session
 */
router.post('/portal', async (req, res, next) => {
  try {
    const session = await StripeService.createPortalSession(req.store);
    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/billing/cancel — Cancel subscription at period end
 */
router.post('/cancel', async (req, res, next) => {
  try {
    if (!req.store.stripeCustomerId) {
      throw new AppError('Nenhuma assinatura ativa.', 400, 'NO_SUBSCRIPTION');
    }

    await StripeService.cancelAllActiveSubscriptions(req.store.stripeCustomerId);

    await prisma.subscription.update({
      where: { storeId: req.store.id },
      data: { cancelAtPeriodEnd: true },
    });

    res.json({ message: 'Assinatura sera cancelada ao fim do periodo.' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/billing/plans — List available plans
 */
router.get('/plans', async (req, res, next) => {
  try {
    const appSlug = process.env.APP_SLUG || 'meuapp';

    // Get plans from database for full details
    const dbPlans = await prisma.adminPlan.findMany({
      where: { appId: appSlug, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const envPlans = getAvailablePlans();

    const plans = dbPlans.map((plan) => {
      const envPlan = envPlans.find((p) => p.key === plan.name);
      return {
        key: plan.name,
        features: plan.features,
        price: plan.price,
        intervals: envPlan ? envPlan.intervals : [],
        configured: envPlan ? envPlan.configured : false,
      };
    });

    res.json({ plans });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/billing/invoices — List store invoices
 */
router.get('/invoices', async (req, res, next) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { storeId: req.store.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ invoices });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
