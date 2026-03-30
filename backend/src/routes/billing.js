const express = require('express');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { checkoutLimiter } = require('../middleware/rateLimiter');
const { StripeService } = require('../config/stripe');
// plans.js (env-var based) mantido apenas para compatibilidade legada
// O checkout e o listing agora usam os IDs do banco (adminPlan.stripePriceIds)

const router = express.Router();

// All billing routes require auth
router.use(requireAuth);

/**
 * POST /api/billing/checkout — Create Stripe Checkout Session
 * Usa stripePriceIds do banco (preenchido ao sincronizar com Stripe no admin).
 */
router.post('/checkout', checkoutLimiter, async (req, res, next) => {
  try {
    const { planKey, billingInterval } = req.body;

    if (!planKey || !billingInterval) {
      throw new AppError('planKey e billingInterval sao obrigatorios.', 400, 'MISSING_FIELDS');
    }

    const appSlug = process.env.APP_SLUG || 'meuapp';
    const plan = await prisma.adminPlan.findFirst({
      where: { appId: appSlug, name: planKey, isActive: true },
    });

    if (!plan) {
      throw new AppError('Plano nao encontrado.', 400, 'PLAN_NOT_FOUND');
    }

    const stripePriceIds = plan.stripePriceIds || {};
    const priceId = stripePriceIds[billingInterval];

    if (!priceId) {
      throw new AppError(
        'Preco nao configurado para este plano. Sincronize o plano com o Stripe no painel admin.',
        400,
        'PRICE_NOT_CONFIGURED'
      );
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
 * POST /api/billing/sync — Sincroniza plano consultando o Stripe diretamente.
 * Usado como fallback quando o webhook falha (ex: secret não configurado).
 */
router.post('/sync', async (req, res, next) => {
  try {
    const { stripe } = require('../config/stripe');
    const store = req.store;

    if (!store.stripeCustomerId) {
      return res.json({ plan: store.plan, synced: false, reason: 'no_customer' });
    }

    // Busca assinaturas ativas no Stripe
    const subscriptions = await stripe.subscriptions.list({
      customer: store.stripeCustomerId,
      status: 'active',
      limit: 5,
      expand: ['data.items.data.price'],
    });

    if (subscriptions.data.length === 0) {
      return res.json({ plan: store.plan, synced: false, reason: 'no_active_subscription' });
    }

    const sub = subscriptions.data[0];
    const planKey = sub.metadata?.plan_key;
    const billingInterval = sub.metadata?.billing_interval;

    if (!planKey) {
      return res.json({ plan: store.plan, synced: false, reason: 'no_plan_metadata' });
    }

    // Atualiza store e subscription no banco
    await prisma.store.update({
      where: { id: store.id },
      data: { plan: planKey },
    });

    await prisma.subscription.upsert({
      where: { storeId: store.id },
      update: {
        stripeSubscriptionId: sub.id,
        status: sub.status,
        planKey,
        billingInterval,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
      },
      create: {
        storeId: store.id,
        stripeSubscriptionId: sub.id,
        status: sub.status,
        planKey,
        billingInterval,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
      },
    });

    console.log(`Sync manual: store ${store.id} → plano ${planKey}`);
    res.json({ plan: planKey, synced: true });
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
 * Usa dados do banco: stripePriceIds para intervals/configured, price para valores.
 */
router.get('/plans', async (req, res, next) => {
  try {
    const appSlug = process.env.APP_SLUG || 'meuapp';

    const dbPlans = await prisma.adminPlan.findMany({
      where: { appId: appSlug, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const plans = dbPlans.map((plan) => {
      // Intervalos configurados = aqueles que têm priceId no Stripe
      const stripePriceIds = plan.stripePriceIds || {};
      const configuredIntervals = Object.entries(stripePriceIds)
        .filter(([, priceId]) => priceId && priceId.length > 0)
        .map(([interval]) => interval);

      const prices = plan.price || {};
      const isFree = Object.values(prices).every((v) => !v || v === 0);

      // Normaliza features para array de strings legíveis:
      // - Array de strings: usa diretamente (formato correto)
      // - Objeto JSON: converte entradas, filtra valores false/null
      let features = [];
      if (Array.isArray(plan.features)) {
        features = plan.features.map(String).filter(Boolean);
      } else if (plan.features && typeof plan.features === 'object') {
        features = Object.entries(plan.features)
          .filter(([, v]) => v !== false && v !== null && v !== undefined && v !== '')
          .map(([k, v]) => (v === true ? k : String(v)))
          .filter(Boolean);
      }

      return {
        key: plan.name,
        features,
        price: prices,
        intervals: configuredIntervals,
        configured: isFree || configuredIntervals.length > 0,
        isFree,
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
