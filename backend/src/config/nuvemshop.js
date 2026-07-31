const axios = require('axios');

const NUVEMSHOP_AUTH_URL = 'https://www.tiendanube.com/apps/authorize/token';
const NUVEMSHOP_API_BASE = 'https://api.tiendanube.com/v1';

/**
 * Exchange authorization code for access token via Nuvemshop OAuth.
 */
async function exchangeCodeForToken(code) {
  const response = await axios.post(NUVEMSHOP_AUTH_URL, {
    client_id: process.env.NUVEMSHOP_CLIENT_ID,
    client_secret: process.env.NUVEMSHOP_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
  });

  return {
    accessToken: response.data.access_token,
    userId: String(response.data.user_id),
    tokenType: response.data.token_type,
  };
}

/**
 * Create an authenticated Nuvemshop API client for a specific store.
 * Uses "Authentication" header as required by Nuvemshop API.
 */
function createNuvemshopClient(storeNuvemshopId, accessToken) {
  const client = axios.create({
    baseURL: `${NUVEMSHOP_API_BASE}/${storeNuvemshopId}`,
    headers: {
      'Authentication': `bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': `${process.env.APP_NAME || 'NuvemProApp'} (${process.env.APP_EMAIL || 'contato@app.com'})`,
    },
    timeout: 15000,
  });

  return client;
}

/**
 * Fetch store info from Nuvemshop API.
 */
async function fetchStoreInfo(storeNuvemshopId, accessToken) {
  const client = createNuvemshopClient(storeNuvemshopId, accessToken);
  const response = await client.get('/store');
  return response.data;
}

// customers/redact e customers/data_request (LGPD) retornam 422 "invalid event"
// nesse endpoint — a API de Webhooks por loja não aceita esses dois eventos.
// Precisam ser configurados manualmente no Partners Portal (seção de LGPD/
// compliance do app), não programaticamente por loja como os demais.
const WEBHOOK_EVENTS = ['order/paid', 'app/uninstalled'];

/**
 * Registra os webhooks da loja na Nuvemshop (não é feito automaticamente pelo
 * OAuth — precisa de POST /webhooks por evento, uma vez por loja). BACKEND_URL
 * precisa ser a URL pública real (Railway em produção); sem isso os webhooks
 * nunca chegam e todo crédito de pontos fica manual. Best-effort por evento:
 * um evento já registrado (422) não deve derrubar os outros.
 */
async function registerWebhooks(storeNuvemshopId, accessToken) {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    console.warn('[nuvemshop] BACKEND_URL nao configurado — webhooks NAO registrados.');
    return;
  }
  const client = createNuvemshopClient(storeNuvemshopId, accessToken);
  for (const event of WEBHOOK_EVENTS) {
    try {
      await client.post('/webhooks', { event, url: `${backendUrl}/webhooks/${event}` });
    } catch (err) {
      const status = err.response?.status;
      // 422 geralmente significa "já registrado para essa URL" — não é erro real.
      if (status !== 422) {
        console.error(`[nuvemshop] falha ao registrar webhook ${event}:`, err.response?.data || err.message);
      }
    }
  }
}

module.exports = {
  exchangeCodeForToken,
  createNuvemshopClient,
  fetchStoreInfo,
  registerWebhooks,
  NUVEMSHOP_AUTH_URL,
  NUVEMSHOP_API_BASE,
};
