const Stripe = require('stripe');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const StripeService = {
  /**
   * Get or create a Stripe customer for a store.
   */
  async getOrCreateCustomer(store) {
    if (store.stripeCustomerId) {
      try {
        const customer = await stripe.customers.retrieve(store.stripeCustomerId);
        if (!customer.deleted) return customer;
      } catch (err) {
        // Customer not found, create new one
      }
    }

    const customer = await stripe.customers.create({
      email: store.email || undefined,
      name: store.name || undefined,
      metadata: {
        storeId: String(store.id),
        nuvemshopId: store.nuvemshopId,
      },
    });

    await prisma.store.update({
      where: { id: store.id },
      data: { stripeCustomerId: customer.id },
    });

    return customer;
  },

  /**
   * Create a Stripe Checkout Session.
   * Includes plan_key in metadata for webhook processing.
   */
  async createCheckoutSession(store, priceId, planKey, billingInterval) {
    const customer = await this.getOrCreateCustomer(store);

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        storeId: String(store.id),
        plan_key: planKey,
        billingInterval: billingInterval,
      },
      subscription_data: {
        metadata: {
          storeId: String(store.id),
          plan_key: planKey,
          billingInterval: billingInterval,
        },
      },
      success_url: `${process.env.FRONTEND_URL}/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/billing?canceled=true`,
    });

    return session;
  },

  /**
   * Cancel all active subscriptions for a customer.
   */
  async cancelAllActiveSubscriptions(stripeCustomerId) {
    if (!stripeCustomerId) return;

    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'active',
    });

    for (const sub of subscriptions.data) {
      await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: true,
      });
    }
  },

  /**
   * Create a Stripe Billing Portal session.
   */
  async createPortalSession(store) {
    if (!store.stripeCustomerId) {
      throw new AppError('Nenhum cliente Stripe associado.', 400, 'NO_STRIPE_CUSTOMER');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: store.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/billing`,
    });

    return session;
  },

  /**
   * Get subscription status and sync with database.
   */
  async getSubscriptionStatus(store) {
    const subscription = await prisma.subscription.findUnique({
      where: { storeId: store.id },
    });

    if (!subscription || !subscription.stripeSubscriptionId) {
      return {
        status: 'none',
        planKey: null,
        billingInterval: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    }

    // Sync with Stripe
    try {
      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);

      const updated = await prisma.subscription.update({
        where: { storeId: store.id },
        data: {
          status: stripeSub.status,
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
          currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
          currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
        },
      });

      return {
        status: updated.status,
        planKey: updated.planKey,
        billingInterval: updated.billingInterval,
        currentPeriodStart: updated.currentPeriodStart,
        currentPeriodEnd: updated.currentPeriodEnd,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
        stripeSubscriptionId: updated.stripeSubscriptionId,
      };
    } catch (err) {
      // Return cached data if Stripe is unreachable
      return {
        status: subscription.status,
        planKey: subscription.planKey,
        billingInterval: subscription.billingInterval,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      };
    }
  },
};

module.exports = { stripe, StripeService };
