const express = require('express');
const cashbackService = require('../services/cashbackService');

const router = express.Router();

/**
 * Endpoint dos jobs diários, disparado pelo Railway Cron (uma vez por dia).
 * Protegido por CRON_SECRET — aceita o segredo no header `x-cron-secret` ou na
 * query `?secret=`. Sem o segredo (ou sem CRON_SECRET configurado), responde 401.
 *
 * Cron no Railway: comando `curl -fsS -X POST
 *   "$BACKEND_URL/api/cron/daily?secret=$CRON_SECRET"` numa agenda diária.
 */
router.post('/daily', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const provided = req.get('x-cron-secret') || req.query.secret;
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: 'Não autorizado.', code: 'UNAUTHORIZED' });
  }
  try {
    const summary = await cashbackService.runDailyJobs();
    res.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[cron] falha geral:', err);
    res.status(500).json({ error: 'Falha ao rodar os jobs diários.', code: 'CRON_ERROR' });
  }
});

module.exports = router;
