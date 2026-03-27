const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('Token nao fornecido.', 401, 'UNAUTHORIZED');
    }

    const token = header.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      throw new AppError('Token invalido ou expirado.', 401, 'INVALID_TOKEN');
    }

    const store = await prisma.store.findUnique({
      where: { id: payload.storeId },
      include: { subscription: true },
    });

    if (!store) {
      throw new AppError('Loja nao encontrada.', 401, 'STORE_NOT_FOUND');
    }

    req.store = store;
    req.storeId = store.id;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: 'Erro interno de autenticacao.', code: 'AUTH_ERROR' });
  }
}

module.exports = { requireAuth };
