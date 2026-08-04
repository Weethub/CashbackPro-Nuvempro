/**
 * CashbackPro — página completa "Minha Fidelidade".
 * JS vanilla, sem dependências, buildado como IIFE (ver package.json
 * "build:widget") em public/fidelidade-page.js, carregado por
 * public/fidelidade.html?store=1234 — hospedado no nosso próprio domínio
 * (não dentro da loja), por isso não precisa de Shadow DOM: é a única coisa
 * na página, sem tema de terceiro pra isolar.
 *
 * Mesma lógica de login por e-mail+código e painel de saldo/nível/histórico/
 * resgate que já existia no modal do widget flutuante — só o layout muda de
 * popup pra página cheia.
 */
(function () {
  var API_BASE = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'https://localhost:3001';

  var storeId = new URL(window.location.href).searchParams.get('store');
  var root = document.getElementById('cashbackpro-root');
  if (!storeId || !root) return;

  var TOKEN_KEY = 'cashbackpro_token_' + storeId;

  function api(path, options) {
    options = options || {};
    var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    return fetch(API_BASE + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw Object.assign(new Error(data.error || 'Erro'), { code: data.code, status: res.status });
        return data;
      });
    });
  }

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { localStorage.removeItem(TOKEN_KEY); }
  function initials(email) { return (email || '?').trim().charAt(0).toUpperCase(); }
  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  function h(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  // Escolhe texto branco ou escuro sobre a cor da marca, conforme a
  // luminância — a cor vem do lojista (Configurações > Aparência) e pode ser
  // clara ou escura, então não dá pra fixar branco.
  function pickTextColor(hex) {
    hex = String(hex || '#111827').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(hex.substr(0, 2), 16) || 0;
    var g = parseInt(hex.substr(2, 2), 16) || 0;
    var b = parseInt(hex.substr(4, 2), 16) || 0;
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#111827' : '#ffffff';
  }

  function applyBrandColor(color) {
    var brand = color || '#111827';
    document.documentElement.style.setProperty('--cbp-primary', brand);
    document.documentElement.style.setProperty('--cbp-on-primary', pickTextColor(brand));
  }

  var state = { screen: 'login', email: '', codeSent: false, me: null, history: null, loading: false };

  function render() {
    root.innerHTML = '';
    var card = h('<div class="cbp-card"></div>');
    card.appendChild(state.screen === 'me' ? renderLoggedIn() : renderLogin());
    root.appendChild(card);
  }

  function boot() {
    fetch(API_BASE + '/api/widget/config?store=' + encodeURIComponent(storeId))
      .then(function (res) { return res.json(); })
      .then(function (cfg) { applyBrandColor(cfg.brandColor); })
      .catch(function () {});

    var token = getToken();
    if (!token) { state.screen = 'login'; render(); return; }
    state.screen = 'me';
    api('/api/widget/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (data) { state.me = data; render(); })
      .catch(function () { clearToken(); state.screen = 'login'; render(); });
  }

  // ─── Tela 1: login ──────────────────────────────────────────────────────
  function renderLogin() {
    var frag = document.createDocumentFragment();

    var banner = h(
      '<div class="cbp-banner"><div class="cbp-banner-inner">' +
        '<div class="cbp-brand">CashbackPro</div>' +
        '<p class="cbp-banner-title">' + (state.codeSent ? 'Confirme seu código' : 'Acesse sua conta') + '</p>' +
        '<p class="cbp-banner-subtitle">' +
          (state.codeSent
            ? 'Enviamos um código de 6 dígitos para o seu e-mail'
            : 'Informe seu e-mail para ver seu saldo e resgatar cupons') +
        '</p>' +
      '</div></div>'
    );
    frag.appendChild(banner);

    var body = h('<div class="cbp-body"></div>');

    if (state.loginError) {
      body.appendChild(h('<div class="cbp-error">' + state.loginError + '</div>'));
    }

    if (!state.codeSent) {
      body.appendChild(h('<label class="cbp-label">E-mail cadastrado na loja</label>'));
      var emailInput = h('<input class="cbp-input" type="email" placeholder="seu@email.com" />');
      emailInput.value = state.email;
      emailInput.oninput = function (e) { state.email = e.target.value; };
      body.appendChild(emailInput);

      var sendBtn = h('<button class="cbp-btn-primary">' + (state.loading ? 'Enviando...' : 'Enviar código') + '</button>');
      sendBtn.disabled = state.loading;
      sendBtn.onclick = function () {
        if (!state.email) return;
        state.loading = true; state.loginError = null; render();
        api('/api/widget/auth/request-code', { method: 'POST', body: { storeNuvemshopId: storeId, email: state.email } })
          .then(function () { state.codeSent = true; state.loading = false; render(); })
          .catch(function () { state.loading = false; state.loginError = 'Não foi possível enviar o código. Tente novamente.'; render(); });
      };
      body.appendChild(sendBtn);
    } else {
      body.appendChild(h('<label class="cbp-label">Código de 6 dígitos</label>'));
      var codeInput = h('<input class="cbp-input" type="text" maxlength="6" placeholder="000000" />');
      codeInput.oninput = function (e) { state.code = e.target.value; };
      body.appendChild(codeInput);

      var verifyBtn = h('<button class="cbp-btn-primary">' + (state.loading ? 'Verificando...' : 'Entrar') + '</button>');
      verifyBtn.disabled = state.loading;
      verifyBtn.onclick = function () {
        if (!state.code) return;
        state.loading = true; state.loginError = null; render();
        api('/api/widget/auth/verify-code', { method: 'POST', body: { storeNuvemshopId: storeId, email: state.email, code: state.code } })
          .then(function (data) { setToken(data.token); state.loading = false; boot(); })
          .catch(function () { state.loading = false; state.loginError = 'Código inválido ou expirado.'; render(); });
      };
      body.appendChild(verifyBtn);

      var backBtn = h('<button class="cbp-btn-secondary">Usar outro e-mail</button>');
      backBtn.onclick = function () { state.codeSent = false; state.loginError = null; render(); };
      body.appendChild(backBtn);
    }

    frag.appendChild(body);
    var wrap = document.createElement('div');
    wrap.appendChild(frag);
    return wrap;
  }

  // ─── Tela 2: logado ─────────────────────────────────────────────────────
  function renderLoggedIn() {
    var wrap = document.createElement('div');
    var banner = h(
      '<div class="cbp-banner"><div class="cbp-banner-inner">' +
        '<div class="cbp-brand">CashbackPro</div>' +
        '<p class="cbp-banner-title">Minha fidelidade</p>' +
      '</div></div>'
    );
    wrap.appendChild(banner);

    var body = h('<div class="cbp-body"></div>');
    var me = state.me;

    if (!me) {
      body.appendChild(h('<div class="cbp-skeleton"></div>'));
      wrap.appendChild(body);
      return wrap;
    }

    var headerRow = h('<div class="cbp-header-row"></div>');
    var avatarBlock = h(
      '<div class="cbp-avatar-name">' +
        '<div class="cbp-avatar">' + initials(me.email) + '</div>' +
        '<div><div class="cbp-email">' + (me.email || '') + '</div>' +
        '<div class="cbp-logout">Sair</div></div>' +
      '</div>'
    );
    avatarBlock.querySelector('.cbp-logout').onclick = function () {
      clearToken(); state.screen = 'login'; state.codeSent = false; state.email = ''; render();
    };
    headerRow.appendChild(avatarBlock);

    var historyBtn = h('<button class="cbp-link">' + (state.history ? 'Fechar histórico' : 'Ver histórico') + '</button>');
    historyBtn.onclick = function () {
      if (state.history) { state.history = null; render(); return; }
      var token = getToken();
      api('/api/widget/history', { headers: { Authorization: 'Bearer ' + token } }).then(function (data) {
        state.history = data.history || []; render();
      });
    };
    headerRow.appendChild(historyBtn);
    body.appendChild(headerRow);

    var pct = me.nextTier ? Math.min(100, Math.round((me.balance / me.nextTier.pointsRequired) * 100)) : 100;
    var balanceCard = h(
      '<div class="cbp-balance-card">' +
        '<div class="cbp-balance-row"><span class="cbp-balance-number">' + me.balance + '</span>' +
          '<span class="cbp-balance-label">pontos disponíveis</span></div>' +
        '<div class="cbp-progress-track"><div class="cbp-progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="cbp-progress-hint">' +
          (me.nextTier
            ? 'Faltam <strong>' + me.pointsToNext + ' pontos</strong> para ' + me.nextTier.name
            : me.currentTier ? 'Nível máximo alcançado.' : 'Continue comprando para desbloquear níveis.') +
        '</div>' +
      '</div>'
    );
    body.appendChild(balanceCard);

    if (me.tiers && me.tiers.length > 0) {
      var tiersSection = h('<div class="cbp-tiers-section"></div>');
      tiersSection.appendChild(h('<p class="cbp-section-label">Níveis de fidelidade</p>'));
      me.tiers.forEach(function (tier) {
        var reached = me.currentTier && tier.pointsRequired <= me.balance;
        var accentColor = tier.color || '#0F7A5C';
        var iconHtml = tier.icon
          ? '<img src="' + tier.icon + '" alt="" class="cbp-tier-icon" />'
          : '<span class="cbp-tier-icon cbp-tier-icon-dot" style="background:' + accentColor + '"></span>';
        var row = h(
          '<div class="cbp-tier-row' + (reached ? ' cbp-tier-active' : '') + '"' +
            (reached ? ' style="border-left-color:' + accentColor + '"' : '') + '>' +
            '<span class="cbp-tier-left">' + iconHtml +
              '<span class="cbp-tier-name">' + tier.name + '</span></span>' +
            '<span class="cbp-tier-meta">' + tier.pointsRequired + ' pontos' + (reached ? ' · alcançado' : '') + '</span>' +
          '</div>'
        );
        tiersSection.appendChild(row);
      });
      body.appendChild(tiersSection);
    }

    if (state.history) {
      body.appendChild(h('<p class="cbp-section-label">Últimas compras</p>'));
      if (state.history.length === 0) {
        body.appendChild(h('<p class="cbp-empty-hint">Você ainda não tem compras registradas.</p>'));
      } else {
        var list = h('<div class="cbp-history-list"></div>');
        state.history.forEach(function (item) {
          list.appendChild(h(
            '<div class="cbp-history-item">' +
              '<span class="cbp-history-date">' + fmtDate(item.createdAt) + '</span>' +
              '<span class="cbp-history-points">+' + item.points + ' pts</span>' +
            '</div>'
          ));
        });
        body.appendChild(list);
      }
    }

    if (state.redeemSuccess) {
      body.appendChild(h('<div class="cbp-success">Cupom enviado. Confira seu e-mail.</div>'));
    } else {
      if (state.redeemError) body.appendChild(h('<div class="cbp-error">' + state.redeemError + '</div>'));

      var canRedeem = !!me.currentTier;
      var redeemBtn = h(
        '<button class="cbp-btn-primary">' + (state.loading ? 'Resgatando...' : 'Resgatar cupom') + '</button>'
      );
      redeemBtn.disabled = state.loading || !canRedeem;
      redeemBtn.onclick = function () {
        var token = getToken();
        state.loading = true; state.redeemError = null; render();
        api('/api/widget/redeem', { method: 'POST', headers: { Authorization: 'Bearer ' + token } })
          .then(function () { state.loading = false; state.redeemSuccess = true; render(); })
          .catch(function (err) {
            state.loading = false;
            state.redeemError = err.code === 'NO_TIER_REACHED'
              ? 'Você ainda não atingiu nenhum nível de resgate.'
              : 'Não foi possível resgatar agora. Tente novamente.';
            render();
          });
      };
      body.appendChild(redeemBtn);
      body.appendChild(h('<p class="cbp-disclaimer">O cupom é enviado por e-mail e é de uso único — confira sua caixa de entrada após resgatar.</p>'));
    }

    wrap.appendChild(body);
    return wrap;
  }

  boot();
})();
