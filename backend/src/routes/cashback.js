const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { parsePagination, paginatedResponse } = require('../lib/paginate');
const cashbackService = require('../services/cashbackService');

const router = express.Router();

router.use(requireAuth);

/**
 * GET /api/cashback/config — configuração do programa desta loja.
 */
router.get('/config', async (req, res, next) => {
  try {
    const config = await cashbackService.getOrCreateConfig(req.storeId);
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/cashback/config — atualiza a configuração do programa.
 */
router.put('/config', async (req, res, next) => {
  try {
    const config = await cashbackService.updateConfig(req.storeId, req.body || {});
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cashback/stats — dashboard simples: pontos emitidos, cupons gerados,
 * taxa de resgate, clientes ativos.
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await cashbackService.getStats(req.store);
    res.json({ stats });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cashback/stats/timeseries — pontos emitidos e resgates por dia
 * (últimos N dias, default 30) pra gráfico de linha no dashboard.
 */
router.get('/stats/timeseries', async (req, res, next) => {
  try {
    const days = Math.min(90, Math.max(7, parseInt(req.query.days) || 30));
    const series = await cashbackService.getStatsTimeSeries(req.storeId, days);
    res.json({ series });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cashback/stats/tier-distribution — quantidade de clientes por nível.
 */
router.get('/stats/tier-distribution', async (req, res, next) => {
  try {
    const distribution = await cashbackService.getTierDistribution(req.storeId);
    res.json(distribution);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cashback/pages — lista as páginas já existentes na loja, pro
 * lojista escolher qual delas é a página de fidelidade (dropdown no painel).
 */
router.get('/pages', async (req, res, next) => {
  try {
    const pages = await cashbackService.listStorePages(req.store);
    res.json({ pages });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cashback/tiers — níveis de fidelidade configurados (ordenados).
 */
router.get('/tiers', async (req, res, next) => {
  try {
    const tiers = await cashbackService.getTiers(req.storeId);
    res.json({ tiers });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/cashback/tiers — substitui a lista completa de níveis.
 * Body: { tiers: [{ id?, name, pointsRequired, couponType, couponValue }] }
 */
router.put('/tiers', async (req, res, next) => {
  try {
    const tiers = await cashbackService.setTiers(req.storeId, req.body?.tiers || []);
    res.json({ tiers });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cashback/customers — lista clientes da loja, paginada e ordenável.
 * Query: page, limit, sortBy (pointsBalance|email|createdAt), sortDir (asc|desc), search (email).
 */
router.get('/customers', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { sortBy, sortDir, search } = req.query;
    const { data, total } = await cashbackService.listCustomers(req.storeId, {
      page,
      limit,
      skip,
      sortBy,
      sortDir,
      search,
    });
    res.json(paginatedResponse(data, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/cashback/redemptions — lista de cupons resgatados pelos clientes.
 */
router.get('/redemptions', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { data, total } = await cashbackService.listRedemptions(req.store, { page, limit, skip });
    res.json(paginatedResponse(data, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
