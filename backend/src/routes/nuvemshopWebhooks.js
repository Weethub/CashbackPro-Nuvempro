const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { createNuvemshopClient } = require('../config/nuvemshop');
const cashbackService = require('../services/cashbackService');

const router = express.Router();

/**
 * Valida o HMAC do webhook (header x-linkedstore-hmac-sha256 = HMAC-SHA256 do raw
 * body com o client_secret). Tolerante a encoding (hex ou base64) e timing-safe.
 * Retorna: true = confere | false = header presente mas NÃO confere | null = não
 * dá para verificar (sem secret/header/raw body — ex.: chamada manual/dev).
 */
function checkHmac(req) {
  const secret = process.env.NUVEMSHOP_CLIENT_SECRET;
  const header = req.headers['x-linkedstore-hmac-sha256'];
  if (!secret || !header || !req.rawBody) return null;
  const hex = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const b64 = crypto.createHmac('sha256', secret).update(req.rawBody).digest('base64');
  const safeEq = (a, b) => {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  };
  return safeEq(header, hex) || safeEq(header, b64);
}

/**
 * Webhooks da Nuvemshop. Configurados no Partner Portal apontando para estas URLs.
 * Body: { store_id, event } (JSON). Responder 200 é obrigatório para a homologação.
 *
 * HMAC (header x-linkedstore-hmac-sha256) é hardening futuro — exige raw body nesta
 * rota. Por ora processamos sem verificação estrita: as ações são não-destrutivas
 * (apenas sinalizam a desinstalação; a exclusão de dados é manual no admin).
 */

// Marca a data de desinstalação na loja. Idempotente: não sobrescreve data anterior.
async function markUninstalled(storeId) {
  if (!storeId) return;
  try {
    await prisma.store.updateMany({
      where: { nuvemshopId: String(storeId), uninstalledAt: null },
      data: { uninstalledAt: new Date() },
    });
  } catch (err) {
    console.error('[nuvemshop-webhook] markUninstalled falhou:', err.message);
  }
}

/**
 * POST /webhooks/app/uninstalled — a loja desinstalou o app.
 */
router.post('/app/uninstalled', async (req, res) => {
  if (checkHmac(req) === false) {
    console.warn('[nuvemshop] app/uninstalled com HMAC invalido — ignorado');
    return res.status(401).json({ error: 'Invalid HMAC.' });
  }
  const storeId = req.body?.store_id;
  console.log(`[nuvemshop] app/uninstalled store_id=${storeId}`);
  await markUninstalled(storeId);
  res.status(200).json({ success: true });
});

/**
 * POST /webhooks/store/redact — LGPD: solicitação de exclusão ~48h após desinstalação.
 * Também marca a desinstalação (rede de segurança caso app/uninstalled não chegue).
 */
router.post('/store/redact', async (req, res) => {
  // LGPD exige sempre 200 (homologação) — em HMAC inválido apenas logamos e
  // NÃO marcamos a desinstalação, evitando poluição por requisição forjada.
  const hmac = checkHmac(req);
  const storeId = req.body?.store_id;
  console.log(`[nuvemshop][LGPD] store/redact store_id=${storeId} hmac=${hmac}`);
  if (hmac !== false) await markUninstalled(storeId);
  res.status(200).json({ success: true });
});

/**
 * POST /webhooks/customers/redact — LGPD: exclui o saldo/histórico de pontos do
 * cliente indicado. O CashbackPro guarda e-mail + saldo em CustomerPoints
 * (diferente do template base, que não guarda PII) — precisa apagar de fato aqui.
 * NOTA: payload assumido { store_id, customer: { id } } — validar o shape real
 * assim que os webhooks forem testados com o app cadastrado no Partners Portal.
 */
router.post('/customers/redact', async (req, res) => {
  const storeId = req.body?.store_id;
  const customerId = req.body?.customer?.id || req.body?.customer_id;
  console.log(`[nuvemshop][LGPD] customers/redact store_id=${storeId} customer_id=${customerId}`);

  if (checkHmac(req) !== false && storeId && customerId) {
    try {
      const store = await prisma.store.findUnique({ where: { nuvemshopId: String(storeId) } });
      if (store) {
        await prisma.customerPoints.deleteMany({
          where: { storeId: store.id, nuvemshopCustomerId: String(customerId) },
        });
      }
    } catch (err) {
      console.error('[nuvemshop][LGPD] customers/redact falhou:', err.message);
    }
  }

  res.status(200).json({ success: true });
});

/**
 * POST /webhooks/customers/data_request — LGPD: retorna os dados de pontos
 * guardados sobre o cliente indicado. Mesmo aviso de shape do payload acima.
 */
router.post('/customers/data_request', async (req, res) => {
  const storeId = req.body?.store_id;
  const customerId = req.body?.customer?.id || req.body?.customer_id;
  console.log(`[nuvemshop][LGPD] customers/data_request store_id=${storeId} customer_id=${customerId}`);

  let data = [];
  try {
    const store = storeId
      ? await prisma.store.findUnique({ where: { nuvemshopId: String(storeId) } })
      : null;
    if (store && customerId) {
      const record = await prisma.customerPoints.findUnique({
        where: { storeId_nuvemshopCustomerId: { storeId: store.id, nuvemshopCustomerId: String(customerId) } },
      });
      if (record) data = [{ email: record.email, pointsBalance: record.pointsBalance }];
    }
  } catch (err) {
    console.error('[nuvemshop][LGPD] customers/data_request falhou:', err.message);
  }

  res.status(200).json({ success: true, data });
});

/**
 * POST /webhooks/order/paid — dispara o motor de pontos do CashbackPro.
 * Payload assumido { store_id, event, id } (id = id do pedido na Nuvemshop) — o
 * webhook só sinaliza o evento; os dados completos são buscados via API.
 */
router.post('/order/paid', async (req, res) => {
  if (checkHmac(req) === false) {
    console.warn('[nuvemshop] order/paid com HMAC invalido — ignorado');
    return res.status(401).json({ error: 'Invalid HMAC.' });
  }

  const nuvemshopStoreId = req.body?.store_id;
  const orderId = req.body?.id;
  console.log(`[nuvemshop] order/paid store_id=${nuvemshopStoreId} order_id=${orderId}`);

  try {
    if (!nuvemshopStoreId || !orderId) {
      return res.status(200).json({ success: true, skipped: 'missing_ids' });
    }

    const store = await prisma.store.findUnique({ where: { nuvemshopId: String(nuvemshopStoreId) } });
    if (!store || !store.accessToken) {
      return res.status(200).json({ success: true, skipped: 'store_not_found' });
    }

    const client = createNuvemshopClient(store.nuvemshopId, store.accessToken);
    const { data: order } = await client.get(`/orders/${orderId}`);

    const result = await cashbackService.creditPointsForOrder(store, order);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    // Webhook deve sempre responder 200 (evita reentregas em loop); erro fica só no log.
    console.error('[nuvemshop] order/paid falhou:', err.message);
    res.status(200).json({ success: true, error: 'processing_failed' });
  }
});

module.exports = router;
