const prisma = require('../../lib/prisma');
const { stripe } = require('../../config/stripe');
const { AppError } = require('../../lib/errors');

const adminPlanService = {
  /**
   * List all plans for an app.
   */
  async list(appId) {
    return prisma.adminPlan.findMany({
      where: { appId },
      orderBy: { sortOrder: 'asc' },
    });
  },

  /**
   * Create a new plan.
   */
  async create(data) {
    return prisma.adminPlan.create({ data });
  },

  /**
   * Update an existing plan.
   */
  async update(id, data) {
    const plan = await prisma.adminPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new AppError('Plano nao encontrado.', 404, 'PLAN_NOT_FOUND');
    }
    return prisma.adminPlan.update({ where: { id }, data });
  },

  /**
   * Deactivate a plan (soft delete).
   */
  async deactivate(id) {
    const plan = await prisma.adminPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new AppError('Plano nao encontrado.', 404, 'PLAN_NOT_FOUND');
    }
    return prisma.adminPlan.update({
      where: { id },
      data: { isActive: false },
    });
  },

  /**
   * Sync plan prices to Stripe — creates Stripe Products and Prices.
   * Updates stripePriceIds in the database.
   */
  async syncToStripe(id) {
    const plan = await prisma.adminPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new AppError('Plano nao encontrado.', 404, 'PLAN_NOT_FOUND');
    }

    const prices = plan.price || {};
    const appName = process.env.APP_NAME || 'MeuApp';
    const appSlug = process.env.APP_SLUG || plan.appId;

    // Create or find Stripe product
    const productName = `${appName} - ${plan.name.charAt(0).toUpperCase() + plan.name.slice(1)}`;

    let product;
    const existingProducts = await stripe.products.search({
      query: `metadata['admin_plan_id']:'${plan.id}'`,
    });

    if (existingProducts.data.length > 0) {
      product = existingProducts.data[0];
      // Update metadata to keep in sync
      await stripe.products.update(product.id, {
        name: productName,
        metadata: {
          plan_key: plan.name,
          admin_plan_id: String(plan.id),
          app_id: plan.appId,
          app_name: appName,
          app_slug: appSlug,
        },
      });
    } else {
      product = await stripe.products.create({
        name: productName,
        metadata: {
          plan_key: plan.name,
          admin_plan_id: String(plan.id),
          app_id: plan.appId,
          app_name: appName,
          app_slug: appSlug,
        },
      });
    }

    const intervalMap = {
      monthly: { interval: 'month', interval_count: 1 },
      semestral: { interval: 'month', interval_count: 6 },
      annual: { interval: 'year', interval_count: 1 },
    };

    const stripePriceIds = { ...(plan.stripePriceIds || {}) };

    for (const [key, config] of Object.entries(intervalMap)) {
      const amount = prices[key];
      if (!amount || amount <= 0) continue;

      // Only create if no existing price ID
      if (stripePriceIds[key]) continue;

      const stripePrice = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(amount * 100),
        currency: 'brl',
        recurring: {
          interval: config.interval,
          interval_count: config.interval_count,
        },
        metadata: {
          plan_key: plan.name,
          admin_plan_id: String(plan.id),
          app_id: plan.appId,
          app_slug: appSlug,
          billing_interval: key,
        },
      });

      stripePriceIds[key] = stripePrice.id;
    }

    // Update plan with new price IDs
    const updated = await prisma.adminPlan.update({
      where: { id },
      data: { stripePriceIds },
    });

    return updated;
  },

  /**
   * Verify that all Stripe price IDs in a plan are valid.
   */
  async verifyStripeIds(id) {
    const plan = await prisma.adminPlan.findUnique({ where: { id } });
    if (!plan) {
      throw new AppError('Plano nao encontrado.', 404, 'PLAN_NOT_FOUND');
    }

    const stripePriceIds = plan.stripePriceIds || {};
    const results = {};

    for (const [interval, priceId] of Object.entries(stripePriceIds)) {
      if (!priceId) {
        results[interval] = { valid: false, reason: 'No price ID configured' };
        continue;
      }

      try {
        const price = await stripe.prices.retrieve(priceId);
        results[interval] = {
          valid: price.active,
          priceId,
          amount: price.unit_amount / 100,
          currency: price.currency,
          active: price.active,
        };
      } catch (err) {
        results[interval] = { valid: false, priceId, reason: err.message };
      }
    }

    return { plan: plan.name, results };
  },
};

module.exports = adminPlanService;
