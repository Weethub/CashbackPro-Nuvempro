const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

/**
 * Auth do cliente final (widget na vitrine) — terceiro esquema de JWT,
 * distinto de loja (JWT_SECRET) e admin (ADMIN_JWT_SECRET). Sessão revogável
 * (CustomerSession), igual ao padrão do adminAuth: o webhook LGPD
 * customers/redact precisa matar sessões na hora, e o cascade cuida disso.
 */
async function requireCustomerAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('Token nao fornecido.', 401, 'UNAUTHORIZED');
    }

    const token = header.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, process.env.CUSTOMER_JWT_SECRET);
    } catch {
      throw new AppError('Token invalido ou expirado.', 401, 'INVALID_TOKEN');
    }

    const session = await prisma.customerSession.findFirst({
      where: {
        id: payload.sid,
        customerPointsId: payload.customerPointsId,
        token,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      include: { customerPoints: true },
    });

    if (!session) {
      throw new AppError('Sessao expirada ou invalida.', 401, 'SESSION_EXPIRED');
    }

    req.customerPoints = session.customerPoints;
    req.storeId = session.storeId;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: 'Erro interno de autenticacao.', code: 'CUSTOMER_AUTH_ERROR' });
  }
}

module.exports = { requireCustomerAuth };
