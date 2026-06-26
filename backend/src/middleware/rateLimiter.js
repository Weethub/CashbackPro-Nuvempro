const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisicoes. Tente novamente em 1 minuto.', code: 'RATE_LIMIT_EXCEEDED' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Muitas tentativas. Aguarde 15 minutos.', code: 'AUTH_RATE_LIMIT' },
});

const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de checkout.', code: 'CHECKOUT_RATE_LIMIT' },
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.', code: 'ADMIN_LOGIN_RATE_LIMIT' },
});

// Anti-spam de tickets/mensagens de suporte. Chaveado por loja (req.store) quando
// disponível — deve ser usado APÓS o requireAuth — com fallback para IP.
const ticketLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.store?.id ? `store:${req.store.id}` : req.ip),
  message: { error: 'Muitas mensagens em pouco tempo. Aguarde alguns minutos.', code: 'SUPPORT_RATE_LIMIT' },
});

module.exports = { globalLimiter, authLimiter, checkoutLimiter, adminLoginLimiter, ticketLimiter };
