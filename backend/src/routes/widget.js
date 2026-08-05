const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { createNuvemshopClient } = require('../config/nuvemshop');
const { sendEmail } = require('../lib/email');
const { requireCustomerAuth } = require('../middleware/customerAuth');
const { widgetOtpLimiter, widgetRedeemLimiter } = require('../middleware/rateLimiter');
const cashbackService = require('../services/cashbackService');

const router = express.Router();

const OTP_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const MAX_OTP_ATTEMPTS = 5;

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function findStore(storeNuvemshopId) {
  if (!storeNuvemshopId) return null;
  return prisma.store.findUnique({ where: { nuvemshopId: String(storeNuvemshopId) } });
}

/**
 * GET /api/widget/config?store=NUVEMSHOP_ID — config pública do widget.
 * Allow-list explícito: nunca retornar o CashbackConfig bruto (tem campos
 * internos como redeemMessage).
 */
router.get('/config', async (req, res, next) => {
  try {
    const store = await findStore(req.query.store);
    if (!store) return res.json({ isActive: false });

    const config = await cashbackService.getOrCreateConfig(store.id);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      isActive: config.isActive,
      iconPosition: config.widgetIconPosition,
      iconSize: config.widgetIconSize,
      brandColor: config.brandColor || '#111827',
      pageUrl: `${process.env.FRONTEND_URL}/fidelidade.html?store=${store.nuvemshopId}`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/widget/auth/request-code — { storeNuvemshopId, email }
 * Sempre responde 200 genérico (evita enumeração de e-mail cadastrado).
 * Só envia código se o e-mail corresponder a um cliente real da loja
 * (confirmado via Customers API da Nuvemshop) — evita OTP pra e-mail forjado.
 */
router.post('/auth/request-code', widgetOtpLimiter, async (req, res, next) => {
  try {
    const { storeNuvemshopId, email } = req.body || {};
    if (!storeNuvemshopId || !email) {
      throw new AppError('storeNuvemshopId e email sao obrigatorios.', 400, 'VALIDATION_ERROR');
    }

    const store = await findStore(storeNuvemshopId);
    if (!store || !store.accessToken) {
      return res.json({ ok: true });
    }

    const client = createNuvemshopClient(store.nuvemshopId, store.accessToken);
    let customer;
    try {
      const { data } = await client.get('/customers', { params: { email } });
      customer = Array.isArray(data) ? data[0] : null;
    } catch {
      // API da Nuvemshop indisponível — não abre brecha, apenas não envia código.
      return res.json({ ok: true });
    }

    if (!customer) return res.json({ ok: true });

    const code = generateCode();
    await prisma.customerOtp.deleteMany({
      where: { storeId: store.id, nuvemshopCustomerId: String(customer.id), consumedAt: null },
    });
    await prisma.customerOtp.create({
      data: {
        storeId: store.id,
        nuvemshopCustomerId: String(customer.id),
        email,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });

    sendEmail({
      to: email,
      subject: 'Seu código de acesso',
      html: `<p>Seu código de acesso é <strong>${code}</strong>. Válido por 10 minutos.</p>`,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/widget/auth/verify-code — { storeNuvemshopId, email, code }
 */
router.post('/auth/verify-code', widgetOtpLimiter, async (req, res, next) => {
  try {
    const { storeNuvemshopId, email, code } = req.body || {};
    if (!storeNuvemshopId || !email || !code) {
      throw new AppError('storeNuvemshopId, email e code sao obrigatorios.', 400, 'VALIDATION_ERROR');
    }

    const store = await findStore(storeNuvemshopId);
    if (!store) throw new AppError('Codigo invalido ou expirado.', 400, 'INVALID_CODE');

    const otp = await prisma.customerOtp.findFirst({
      where: { storeId: store.id, email, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new AppError('Codigo invalido ou expirado.', 400, 'INVALID_CODE');

    if (otp.attempts >= MAX_OTP_ATTEMPTS) {
      throw new AppError('Numero maximo de tentativas excedido. Solicite um novo codigo.', 400, 'TOO_MANY_ATTEMPTS');
    }

    if (otp.codeHash !== hashCode(code)) {
      await prisma.customerOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new AppError('Codigo invalido ou expirado.', 400, 'INVALID_CODE');
    }

    await prisma.customerOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });

    const customerPoints = await cashbackService.getOrCreateCustomerPoints(
      store.id,
      otp.nuvemshopCustomerId,
      email
    );

    // O JWT precisa do id da sessão (sid) no payload, que só existe após o create —
    // por isso o token é um placeholder único no create e sobrescrito com o JWT
    // logo abaixo. requireCustomerAuth casa o header Authorization com este campo.
    const session = await prisma.customerSession.create({
      data: {
        customerPointsId: customerPoints.id,
        storeId: store.id,
        token: crypto.randomBytes(24).toString('hex'),
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    const token = jwt.sign(
      { customerPointsId: customerPoints.id, storeId: store.id, sid: session.id },
      process.env.CUSTOMER_JWT_SECRET,
      { expiresIn: '30d' }
    );
    await prisma.customerSession.update({ where: { id: session.id }, data: { token } });

    res.json({ token, customer: { email } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/widget/me — dados do cliente logado + progresso de nível.
 */
router.get('/me', requireCustomerAuth, async (req, res, next) => {
  try {
    const [progress, tiers, config] = await Promise.all([
      cashbackService.getTierProgress(req.storeId, req.customerPoints),
      cashbackService.getTiers(req.storeId),
      cashbackService.getOrCreateConfig(req.storeId),
    ]);
    res.json({
      email: req.customerPoints.email,
      // Ano de "cliente desde" e taxa de pontos->R$ pra a página do cliente:
      // R$ = saldo / pointsPerCurrency (pointsPerCurrency = pontos por R$1).
      memberSince: req.customerPoints.createdAt,
      pointsPerCurrency: config.pointsPerCurrency,
      tiers,
      ...progress,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/widget/history — últimas 5 compras que geraram pontos (fixo, não
 * paginado — é um top-5, não uma listagem completa).
 */
router.get('/history', requireCustomerAuth, async (req, res, next) => {
  try {
    const history = await prisma.pointsTransaction.findMany({
      where: { customerPointsId: req.customerPoints.id, type: 'earn' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    res.json({
      history: history.map((h) => ({ points: h.points, createdAt: h.createdAt, orderId: h.nuvemshopOrderId })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/widget/redeem — resgata o maior nível alcançado. Nunca retorna o
 * código do cupom — ele só é entregue por e-mail.
 */
router.post('/redeem', requireCustomerAuth, widgetRedeemLimiter, async (req, res, next) => {
  try {
    const store = await prisma.store.findUnique({ where: { id: req.storeId } });
    const result = await cashbackService.redeemCurrentTier(store, req.customerPoints.id);
    res.json({ redeemed: true, tierName: result.tierName });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
