const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { exchangeCodeForToken, fetchStoreInfo } = require('../config/nuvemshop');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

/**
 * GET /auth/callback — Nuvemshop OAuth callback
 */
router.get('/callback', authLimiter, async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) {
      throw new AppError('Codigo de autorizacao nao fornecido.', 400, 'MISSING_CODE');
    }

    // Exchange code for token
    const { accessToken, userId } = await exchangeCodeForToken(code);

    // Fetch store info from Nuvemshop
    let storeInfo;
    try {
      storeInfo = await fetchStoreInfo(userId, accessToken);
    } catch (err) {
      storeInfo = {};
    }

    // Upsert store
    const trialDays = parseInt(process.env.TRIAL_DAYS) || 7;
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    const store = await prisma.store.upsert({
      where: { nuvemshopId: userId },
      update: {
        accessToken,
        name: storeInfo.name?.pt || storeInfo.name?.es || storeInfo.name?.en || undefined,
        domain: storeInfo.original_domain || storeInfo.domain || undefined,
        email: storeInfo.email || undefined,
      },
      create: {
        nuvemshopId: userId,
        accessToken,
        name: storeInfo.name?.pt || storeInfo.name?.es || storeInfo.name?.en || null,
        domain: storeInfo.original_domain || storeInfo.domain || null,
        email: storeInfo.email || null,
        plan: 'starter',
        trialEndsAt,
      },
    });

    // Ensure subscription record exists
    await prisma.subscription.upsert({
      where: { storeId: store.id },
      update: {},
      create: { storeId: store.id, status: 'none' },
    });

    // Generate JWT
    const token = jwt.sign(
      { storeId: store.id, nuvemshopId: store.nuvemshopId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect to frontend with token
    const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback?token=${token}`;
    res.redirect(redirectUrl);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /auth/verify-token — Verify JWT and return store info
 */
router.get('/verify-token', requireAuth, async (req, res) => {
  const store = req.store;
  res.json({
    store: {
      id: store.id,
      nuvemshopId: store.nuvemshopId,
      name: store.name,
      domain: store.domain,
      email: store.email,
      plan: store.plan,
      trialEndsAt: store.trialEndsAt,
    },
    subscription: store.subscription
      ? {
          status: store.subscription.status,
          planKey: store.subscription.planKey,
          billingInterval: store.subscription.billingInterval,
          currentPeriodEnd: store.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: store.subscription.cancelAtPeriodEnd,
        }
      : null,
  });
});

/**
 * POST /auth/dev-token — Generate a dev token for testing (dev only)
 */
router.post('/dev-token', async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError('Rota disponivel apenas em desenvolvimento.', 403, 'DEV_ONLY');
    }

    const { storeId, nuvemshopId } = req.body;

    let store;
    if (storeId) {
      store = await prisma.store.findUnique({ where: { id: parseInt(storeId) } });
    } else if (nuvemshopId) {
      store = await prisma.store.findUnique({ where: { nuvemshopId: String(nuvemshopId) } });
    }

    if (!store) {
      // Create a dev store
      const trialDays = parseInt(process.env.TRIAL_DAYS) || 7;
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

      store = await prisma.store.create({
        data: {
          nuvemshopId: nuvemshopId || `dev-${Date.now()}`,
          name: 'Dev Store',
          plan: 'starter',
          trialEndsAt,
        },
      });

      await prisma.subscription.create({
        data: { storeId: store.id, status: 'none' },
      });
    }

    const token = jwt.sign(
      { storeId: store.id, nuvemshopId: store.nuvemshopId },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, store: { id: store.id, nuvemshopId: store.nuvemshopId, name: store.name } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
