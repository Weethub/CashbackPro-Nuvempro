const express = require('express');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { parsePagination, paginatedResponse } = require('../../lib/paginate');
const { requireRole } = require('../middleware/requireRole');
const adminLogService = require('../services/adminLogService');

const router = express.Router();

const STATUSES = ['open', 'answered', 'closed'];
const MSG_MAX = 5000;

/**
 * GET /admin-api/support — lista de tickets (paginada).
 * Query: ?status=open|answered|closed&search=...&page=1&limit=20
 */
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status, search } = req.query;

    const where = {};
    if (status && STATUSES.includes(status)) where.status = status;
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { store: { is: { name: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take: limit,
        include: {
          store: { select: { name: true, nuvemshopId: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { messages: true } },
        },
      }),
      prisma.supportTicket.count({ where }),
    ]);

    const data = tickets.map((tk) => ({
      id: tk.id,
      storeId: tk.storeId,
      storeName: tk.store?.name || `Loja ${tk.storeId}`,
      nuvemshopId: tk.store?.nuvemshopId || null,
      subject: tk.subject,
      status: tk.status,
      messageCount: tk._count.messages,
      lastMessage: tk.messages[0]?.body?.slice(0, 140) || '',
      lastMessageAuthor: tk.messages[0]?.author || null,
      lastMessageAt: tk.lastMessageAt,
      createdAt: tk.createdAt,
    }));

    res.json(paginatedResponse(data, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/support/stats — contagem por status (para badge no menu).
 * Definido ANTES de /:id para não casar com o param.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const grouped = await prisma.supportTicket.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const counts = { open: 0, answered: 0, closed: 0 };
    for (const g of grouped) counts[g.status] = g._count._all;
    res.json(counts);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/support/:id — detalhe do ticket (loja + thread completa).
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: {
        store: { select: { id: true, name: true, nuvemshopId: true, email: true, domain: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) throw new AppError('Ticket nao encontrado.', 404, 'TICKET_NOT_FOUND');
    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/support/:id/reply — admin responde (status -> answered).
 * Body: { message }
 */
router.post('/:id/reply', requireRole('suporte'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const message = (req.body.message || '').toString().trim();
    if (!message) throw new AppError('Mensagem e obrigatoria.', 400, 'MISSING_MESSAGE');

    const existing = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new AppError('Ticket nao encontrado.', 404, 'TICKET_NOT_FOUND');

    const now = new Date();
    await prisma.supportMessage.create({
      data: { ticketId: id, author: 'admin', body: message.slice(0, MSG_MAX) },
    });
    await prisma.supportTicket.update({
      where: { id },
      data: { status: 'answered', lastMessageAt: now },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'reply_support_ticket',
      entity: 'support_ticket',
      entityId: id,
      ipAddress: req.ip,
    });

    const updated = await prisma.supportTicket.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    res.json({ ticket: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /admin-api/support/:id/status — fecha/reabre o ticket.
 * Body: { status: open|answered|closed }
 */
router.patch('/:id/status', requireRole('suporte'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;
    if (!STATUSES.includes(status)) {
      throw new AppError('Status invalido.', 400, 'INVALID_STATUS');
    }
    const existing = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new AppError('Ticket nao encontrado.', 404, 'TICKET_NOT_FOUND');

    const ticket = await prisma.supportTicket.update({ where: { id }, data: { status } });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'set_support_ticket_status',
      entity: 'support_ticket',
      entityId: id,
      details: { status },
      ipAddress: req.ip,
    });

    res.json({ ticket });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
