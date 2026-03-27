const express = require('express');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { parsePagination, paginatedResponse } = require('../../lib/paginate');
const { requireRole } = require('../middleware/requireRole');
const adminLogService = require('../services/adminLogService');

const router = express.Router();

/**
 * GET /admin-api/coupons — List coupons with pagination
 */
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { active } = req.query;

    const where = {};
    if (active === 'true') where.isActive = true;
    if (active === 'false') where.isActive = false;

    const [coupons, total] = await Promise.all([
      prisma.adminCoupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.adminCoupon.count({ where }),
    ]);

    res.json(paginatedResponse(coupons, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/coupons — Create a coupon
 */
router.post('/', requireRole('gerente'), async (req, res, next) => {
  try {
    const { code, type, value, maxRedemptions, validUntil } = req.body;

    if (!code || !type || value === undefined) {
      throw new AppError('code, type e value sao obrigatorios.', 400, 'MISSING_FIELDS');
    }

    if (!['percentage', 'fixed'].includes(type)) {
      throw new AppError('type deve ser "percentage" ou "fixed".', 400, 'INVALID_TYPE');
    }

    const existing = await prisma.adminCoupon.findUnique({ where: { code: code.toUpperCase() } });
    if (existing) {
      throw new AppError('Codigo de cupom ja existe.', 409, 'COUPON_EXISTS');
    }

    const coupon = await prisma.adminCoupon.create({
      data: {
        code: code.toUpperCase(),
        type,
        value: parseFloat(value),
        maxRedemptions: maxRedemptions ? parseInt(maxRedemptions) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
      },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'create_coupon',
      entity: 'admin_coupon',
      entityId: coupon.id,
      details: { code: coupon.code, type, value },
      ipAddress: req.ip,
    });

    res.status(201).json({ coupon });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/coupons/:id/deactivate — Deactivate a coupon
 */
router.post('/:id/deactivate', requireRole('gerente'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    const coupon = await prisma.adminCoupon.findUnique({ where: { id } });
    if (!coupon) {
      throw new AppError('Cupom nao encontrado.', 404, 'COUPON_NOT_FOUND');
    }

    const updated = await prisma.adminCoupon.update({
      where: { id },
      data: { isActive: false },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'deactivate_coupon',
      entity: 'admin_coupon',
      entityId: id,
      details: { code: coupon.code },
      ipAddress: req.ip,
    });

    res.json({ coupon: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
