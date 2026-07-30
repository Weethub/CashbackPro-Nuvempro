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

// OTP do widget (login do cliente final) — chaveado por IP+email pra não deixar
// alguém esgotar a tentativa de outra pessoa nem martelar o mesmo e-mail via IPs diferentes sozinho.
const widgetOtpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
  message: { error: 'Muitas tentativas. Aguarde 15 minutos.', code: 'WIDGET_OTP_RATE_LIMIT' },
});

// Resgate do widget — chaveado por cliente autenticado (após requireCustomerAuth).
const widgetRedeemLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.customerPoints?.id ? `customer:${req.customerPoints.id}` : req.ip),
  message: { error: 'Muitas tentativas de resgate. Aguarde um minuto.', code: 'WIDGET_REDEEM_RATE_LIMIT' },
});

module.exports = {
  globalLimiter,
  authLimiter,
  checkoutLimiter,
  adminLoginLimiter,
  ticketLimiter,
  widgetOtpLimiter,
  widgetRedeemLimiter,
};
