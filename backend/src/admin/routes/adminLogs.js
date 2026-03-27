const express = require('express');
const prisma = require('../../lib/prisma');
const { parsePagination, paginatedResponse } = require('../../lib/paginate');

const router = express.Router();

/**
 * GET /admin-api/logs/activity — Activity logs (info severity)
 * Query: ?tab=all|auth|mutations|system&page=1&limit=20
 */
router.get('/activity', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { tab, adminId, entity } = req.query;

    const where = { severity: 'info' };

    // Tab filters
    if (tab === 'auth') {
      where.action = { in: ['login_success', 'logout', 'change_password'] };
    } else if (tab === 'mutations') {
      where.action = {
        in: [
          'create_plan', 'update_plan', 'deactivate_plan', 'sync_plan_to_stripe',
          'create_coupon', 'deactivate_coupon',
          'create_terms', 'update_terms', 'publish_terms',
          'create_faq', 'update_faq', 'delete_faq',
          'create_admin', 'deactivate_admin',
          'approve_commission', 'mark_commission_paid',
          'extend_trial', 'cancel_subscription',
          'update_config',
        ],
      };
    } else if (tab === 'system') {
      where.action = { in: ['impersonate_store', 'update_config', 'sync_plan_to_stripe'] };
    }

    if (adminId) where.adminId = parseInt(adminId);
    if (entity) where.entity = entity;

    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.adminLog.count({ where }),
    ]);

    res.json(paginatedResponse(logs, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/logs/errors — Error and warning logs
 * Query: ?tab=all|errors|warnings|security&page=1&limit=20
 */
router.get('/errors', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { tab } = req.query;

    const where = {};

    if (tab === 'errors') {
      where.severity = 'error';
    } else if (tab === 'warnings') {
      where.severity = 'warning';
    } else if (tab === 'security') {
      where.OR = [
        { severity: 'warning', action: { in: ['login_failed', 'impersonate_store'] } },
        { severity: 'error' },
      ];
    } else {
      // All non-info logs
      where.severity = { in: ['warning', 'error'] };
    }

    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.adminLog.count({ where }),
    ]);

    res.json(paginatedResponse(logs, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
