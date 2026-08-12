/**
 * CashbackPro — ponte de sessão pro ícone flutuante da vitrine.
 * Carregada num iframe oculto por widget-src/index.js, hospedada na MESMA
 * origem de fidelidade.html (nosso domínio) — por isso enxerga o token salvo
 * lá pelo login (localStorage é isolado por origem, e o widget.js roda no
 * domínio da loja, não no nosso). Só devolve nível/progresso via postMessage;
 * nunca expõe o token, saldo exato ou qualquer outro dado sensível pro parent.
 */
(function () {
  var API_BASE = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'https://localhost:3001';
  var storeId = new URL(window.location.href).searchParams.get('store');

  function reply(tier, nextTier, progressPercent) {
    if (window.parent) {
      window.parent.postMessage({
        source: 'cashbackpro-widget-session',
        type: 'tier',
        tier: tier || null,
        nextTier: nextTier || null,
        progressPercent: progressPercent || 0,
      }, '*');
    }
  }

  if (!storeId) { reply(null); return; }

  var token;
  try { token = localStorage.getItem('cashbackpro_token_' + storeId); } catch (e) { token = null; }
  if (!token) { reply(null); return; }

  fetch(API_BASE + '/api/widget/me', { headers: { Authorization: 'Bearer ' + token } })
    .then(function (res) {
      if (!res.ok) throw new Error('unauthorized');
      return res.json();
    })
    .then(function (data) {
      var tier = data.currentTier || null;
      var nextTier = data.nextTier || null;
      var balance = data.balance || 0;
      // % até o próximo nível — só a fração, nunca o saldo/pontos exatos.
      var lowerBound = tier ? tier.pointsRequired : 0;
      var upperBound = nextTier ? nextTier.pointsRequired : lowerBound;
      var progressPercent = !nextTier ? 100 : upperBound > lowerBound
        ? Math.max(0, Math.min(100, ((balance - lowerBound) / (upperBound - lowerBound)) * 100))
        : 0;
      reply(tier, nextTier, progressPercent);
    })
    .catch(function () { reply(null); });
})();
