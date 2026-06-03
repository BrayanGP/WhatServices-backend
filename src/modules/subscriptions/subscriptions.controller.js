const Provider = require('../providers/provider.model');
const { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID, CLIENT_URL } = require('../../config/env');
const Stripe = require('stripe');

const stripe = Stripe(STRIPE_SECRET_KEY);

const getMySubscription = async (req, res, next) => {
  try {
    const provider = await Provider.findOne({ userId: req.user.id }).select('subscription').lean();
    if (!provider) return res.status(404).json({ message: 'Provider not found' });
    res.json(provider.subscription);
  } catch (err) {
    next(err);
  }
};

const createCheckout = async (req, res, next) => {
  try {
    const provider = await Provider.findOne({ userId: req.user.id });
    if (!provider) return res.status(404).json({ message: 'Provider not found' });

    let customerId = provider.subscription?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { providerId: provider._id.toString() },
      });
      customerId = customer.id;
      provider.subscription.stripeCustomerId = customerId;
      await provider.save();
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${CLIENT_URL}/subscription/success`,
      cancel_url: `${CLIENT_URL}/subscription/cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
};

const webhook = async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return res.status(400).send('Webhook signature invalid');
  }

  const sub = event.data.object;

  switch (event.type) {
    case 'customer.subscription.updated':
    case 'customer.subscription.created':
      await Provider.findOneAndUpdate(
        { 'subscription.stripeCustomerId': sub.customer },
        {
          'subscription.status': sub.status === 'active' ? 'active' : 'suspended',
          'subscription.stripeSubscriptionId': sub.id,
          'subscription.currentPeriodEnd': new Date(sub.current_period_end * 1000),
        }
      );
      break;
    case 'customer.subscription.deleted':
      await Provider.findOneAndUpdate(
        { 'subscription.stripeCustomerId': sub.customer },
        { 'subscription.status': 'cancelled' }
      );
      break;
  }

  res.json({ received: true });
};

module.exports = { getMySubscription, createCheckout, webhook };
