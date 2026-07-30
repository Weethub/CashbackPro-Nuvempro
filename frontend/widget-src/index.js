/**
 * CashbackPro — widget flutuante da vitrine.
 * JS vanilla, sem dependências, buildado como IIFE único (ver package.json
 * "build:widget") — HTML e CSS ficam embutidos aqui dentro via template
 * strings, então o arquivo final (public/widget.js) é 100% autocontido:
 * é esse arquivo que sobe no "Carregar arquivo javascript" do painel de
 * parceiros da Nuvemshop.
 *
 * Injetado via Script resource, chega como <script src=".../widget.js?store=1234">
 * — o "store" identifica a loja (não é credencial; toda ação sensível exige
 * o JWT emitido no login).
 */
(function () {
  var API_BASE = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'https://localhost:3001';

  var scriptEl = document.currentScript;
  var storeId = null;
  try {
    storeId = new URL(scriptEl.src).searchParams.get('store');
  } catch (e) {
    /* sem store válido — widget não renderiza */
  }
  if (!storeId) return;

  var TOKEN_KEY = 'cashbackpro_token_' + storeId;
  var ICON_SIZES = { sm: 48, md: 60, lg: 76 };
  var POSITIONS = {
    'bottom-right': { bottom: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'top-left': { top: '20px', left: '20px' },
  };

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
  function initials(email) {
    return (email || '?').trim().charAt(0).toUpperCase();
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  // ─── Shadow DOM host ────────────────────────────────────────────────────
  var host = document.createElement('div');
  host.id = 'cashbackpro-widget-host';
  document.body.appendChild(host);
  var shadow = host.attachShadow({ mode: 'open' });

  // Host recebe o tamanho REAL do ícone (não 0x0) e é ancorado ao canto certo
  // via top/bottom/left/right — assim o box não "vaza" além do canto configurado.
  // Usa cssText com !important em cada declaração pra sobreviver a resets do
  // tema da loja (nunca via classe CSS, que pode ser sobrescrita).
  function styleHost(position, sizePx) {
    var pos = POSITIONS[position] || POSITIONS['bottom-right'];
    host.style.cssText =
      'position: fixed !important;' +
      'z-index: 2147483000 !important;' +
      'width: ' + sizePx + 'px !important;' +
      'height: ' + sizePx + 'px !important;' +
      'top: ' + (pos.top || 'auto') + ' !important;' +
      'bottom: ' + (pos.bottom || 'auto') + ' !important;' +
      'left: ' + (pos.left || 'auto') + ' !important;' +
      'right: ' + (pos.right || 'auto') + ' !important;' +
      'margin: 0 !important;' +
      'padding: 0 !important;';
  }

  var STYLE = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
    /* Tamanho em px concreto (via --icon-size), não porcentagem — evita
       depender de altura resolvida em cadeia pelos ancestrais. host já vem
       do JS com o MESMO tamanho e a posição corretos (fixed, ancorado no
       canto certo), então o ícone só precisa bater com esse valor. */
    .icon-wrap { width: var(--icon-size, 60px); height: var(--icon-size, 60px); }
    .icon {
      width: var(--icon-size, 60px); height: var(--icon-size, 60px); border-radius: 50%;
      background: #0F7A5C; color: #fff; display: flex; align-items: center; justify-content: center;
      font-size: calc(var(--icon-size, 60px) * 0.4); font-weight: 700; cursor: pointer; border: none;
      box-shadow: 0 2px 10px rgba(0,0,0,0.25); user-select: none;
      transition: background 0.15s ease;
    }
    .icon:hover { background: #0B5641; }
    .overlay {
      position: fixed; inset: 0; background: rgba(15,20,18,0.5);
      display: flex; align-items: center; justify-content: center; z-index: 1;
    }
    .modal {
      background: #fff; border-radius: 6px; width: 480px; max-width: 94vw;
      max-height: 88vh; overflow-y: auto; box-shadow: 0 12px 40px rgba(0,0,0,0.3);
      position: relative; border: 1px solid #E4E7E6;
    }
    .banner {
      background: #0F7A5C; padding: 20px 26px; color: #fff; position: relative;
      border-bottom: 3px solid #0B5641;
    }
    .close {
      position: absolute; top: 16px; right: 18px; cursor: pointer; width: 24px; height: 24px;
      background: none; border: none; color: #fff; opacity: 0.85;
      font-size: 15px; line-height: 1; display: flex; align-items: center; justify-content: center;
    }
    .close:hover { opacity: 1; }
    .brand-name { font-size: 12px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; opacity: 0.85; }
    .banner-title { font-size: 19px; font-weight: 700; margin: 4px 0 2px; }
    .banner-subtitle { font-size: 13px; opacity: 0.85; margin: 0; }
    .body { padding: 24px 26px; }
    label { font-size: 12px; font-weight: 600; color: #5C6D67; display: block; margin-bottom: 6px; }
    input {
      width: 100%; padding: 11px 13px; border: 1px solid #D5D9D7; border-radius: 4px;
      font-size: 15px; margin-bottom: 16px; color: #16211D;
      transition: border-color 0.15s ease;
    }
    input:focus { outline: none; border-color: #0F7A5C; }
    button.primary {
      width: 100%; padding: 12px; border-radius: 4px; border: none;
      background: #0F7A5C; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
      transition: background 0.15s ease;
    }
    button.primary:hover:not(:disabled) { background: #0B5641; }
    button.primary:disabled { opacity: 0.5; cursor: default; }
    button.secondary {
      width: 100%; padding: 11px; border-radius: 4px; border: 1px solid #D5D9D7;
      background: #fff; color: #16211D; font-size: 13px; font-weight: 600; cursor: pointer;
      margin-top: 10px;
    }
    button.secondary:hover { border-color: #0F7A5C; color: #0F7A5C; }
    button.link {
      background: none; border: none; color: #5C6D67; font-size: 12.5px; cursor: pointer; padding: 4px;
      text-decoration: underline;
    }
    button.link:hover { color: #0F7A5C; }
    .error-box {
      background: #FDECEA; color: #A82F1F; font-size: 12.5px; padding: 10px 12px;
      border-radius: 4px; margin-bottom: 16px; border-left: 3px solid #C0392B;
    }
    .success-box {
      background: #E9F7F3; color: #0B5641; font-size: 13.5px; padding: 14px 16px;
      border-radius: 4px; font-weight: 600; border-left: 3px solid #0F7A5C;
    }
    .header-row {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #EDEEED;
    }
    .avatar-name { display: flex; align-items: center; gap: 10px; }
    .avatar {
      width: 32px; height: 32px; border-radius: 4px; background: #E9F7F3; color: #0B5641;
      display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px;
    }
    .email-text { font-size: 13px; font-weight: 600; color: #16211D; max-width: 200px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .logout { font-size: 11px; color: #999; cursor: pointer; text-decoration: underline; margin-top: 2px; }
    .balance-card {
      background: #F5F6F5; border-radius: 4px; padding: 20px; margin-bottom: 20px;
      border: 1px solid #EDEEED;
    }
    .balance-row { display: flex; align-items: baseline; gap: 8px; }
    .balance-number { font-size: 32px; font-weight: 700; color: #0F7A5C; line-height: 1; }
    .balance-label { font-size: 12px; color: #5C6D67; }
    .progress-track { height: 6px; background: #E4E7E6; border-radius: 3px; margin-top: 14px; overflow: hidden; }
    .progress-fill { height: 100%; background: #0F7A5C; border-radius: 3px; transition: width 0.4s ease; }
    .progress-hint { font-size: 12px; margin-top: 8px; color: #5C6D67; }
    .section-label {
      font-size: 12px; font-weight: 700; color: #16211D; text-transform: uppercase;
      letter-spacing: 0.4px; margin: 0 0 12px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .tiers-section { margin-bottom: 20px; }
    .tier-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 12px; border-radius: 4px; margin-bottom: 6px; background: #F8F9F8;
      border-left: 3px solid transparent;
    }
    .tier-row.active { border-left-color: #0F7A5C; background: #E9F7F3; }
    .tier-row .tr-name { font-size: 13px; font-weight: 600; color: #16211D; }
    .tier-row .tr-meta { font-size: 11.5px; color: #5C6D67; }
    .tier-row.active .tr-meta { color: #0B5641; }
    .history-list { display: flex; flex-direction: column; margin-bottom: 20px; }
    .history-item {
      display: flex; justify-content: space-between; align-items: center; font-size: 13px;
      padding: 10px 0; border-bottom: 1px solid #EDEEED;
    }
    .history-item:last-child { border-bottom: none; }
    .history-date { color: #5C6D67; }
    .history-points { color: #0F7A5C; font-weight: 700; }
    .empty-hint { font-size: 12.5px; color: #999; padding: 8px 0; }
    .disclaimer { font-size: 11.5px; color: #999; margin-top: 12px; line-height: 1.4; }
    .skeleton { height: 90px; border-radius: 4px; background: #F0F1F0; margin-bottom: 20px; }
  `;

  var container = document.createElement('div');
  shadow.appendChild(container);
  var styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  shadow.appendChild(styleEl);

  var state = { open: false, screen: 'login', email: '', codeSent: false, me: null, history: null, loading: false };

  function h(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function render() {
    container.innerHTML = '';

    var wrap = h('<div class="icon-wrap"></div>');
    var icon = h('<button class="icon" aria-label="Cashback">%</button>');
    icon.onclick = function () {
      state.open = !state.open;
      if (state.open) openModal();
      render();
    };
    wrap.appendChild(icon);
    container.appendChild(wrap);

    if (state.open) {
      var overlay = h('<div class="overlay"></div>');
      overlay.onclick = function (e) { if (e.target === overlay) { state.open = false; render(); } };

      var modal = h('<div class="modal"></div>');
      modal.appendChild(state.screen === 'me' ? renderLoggedIn() : renderLogin());

      overlay.appendChild(modal);
      container.appendChild(overlay);
    }
  }

  function closeBtn() {
    var btn = h('<button class="close">✕</button>');
    btn.onclick = function () { state.open = false; render(); };
    return btn;
  }

  function openModal() {
    var token = getToken();
    if (!token) { state.screen = 'login'; return; }
    state.screen = 'me';
    state.me = null;
    api('/api/widget/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (data) { state.me = data; render(); })
      .catch(function () { clearToken(); state.screen = 'login'; render(); });
  }

  // ─── Tela 1: login ──────────────────────────────────────────────────────
  function renderLogin() {
    var frag = document.createDocumentFragment();

    var banner = h(
      '<div class="banner">' +
        '<div class="brand-name">CashbackPro</div>' +
        '<p class="banner-title">' + (state.codeSent ? 'Confirme seu código' : 'Acesse sua conta') + '</p>' +
        '<p class="banner-subtitle">' +
          (state.codeSent
            ? 'Enviamos um código de 6 dígitos para o seu e-mail'
            : 'Informe seu e-mail para ver seu saldo e resgatar cupons') +
        '</p>' +
      '</div>'
    );
    banner.appendChild(closeBtn());
    frag.appendChild(banner);

    var body = h('<div class="body"></div>');

    if (state.loginError) {
      body.appendChild(h('<div class="error-box">' + state.loginError + '</div>'));
    }

    if (!state.codeSent) {
      body.appendChild(h('<label>E-mail cadastrado na loja</label>'));
      var emailInput = h('<input type="email" placeholder="seu@email.com" />');
      emailInput.value = state.email;
      emailInput.oninput = function (e) { state.email = e.target.value; };
      body.appendChild(emailInput);

      var sendBtn = h('<button class="primary">' + (state.loading ? 'Enviando...' : 'Enviar código') + '</button>');
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
      body.appendChild(h('<label>Código de 6 dígitos</label>'));
      var codeInput = h('<input type="text" maxlength="6" placeholder="000000" />');
      codeInput.oninput = function (e) { state.code = e.target.value; };
      body.appendChild(codeInput);

      var verifyBtn = h('<button class="primary">' + (state.loading ? 'Verificando...' : 'Entrar') + '</button>');
      verifyBtn.disabled = state.loading;
      verifyBtn.onclick = function () {
        if (!state.code) return;
        state.loading = true; state.loginError = null; render();
        api('/api/widget/auth/verify-code', { method: 'POST', body: { storeNuvemshopId: storeId, email: state.email, code: state.code } })
          .then(function (data) { setToken(data.token); state.loading = false; openModal(); render(); })
          .catch(function () { state.loading = false; state.loginError = 'Código inválido ou expirado.'; render(); });
      };
      body.appendChild(verifyBtn);

      var backBtn = h('<button class="secondary">Usar outro e-mail</button>');
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
      '<div class="banner">' +
        '<div class="brand-name">CashbackPro</div>' +
        '<p class="banner-title">Minha fidelidade</p>' +
      '</div>'
    );
    banner.appendChild(closeBtn());
    wrap.appendChild(banner);

    var body = h('<div class="body"></div>');
    var me = state.me;

    if (!me) {
      body.appendChild(h('<div class="skeleton"></div>'));
      wrap.appendChild(body);
      return wrap;
    }

    // Header: avatar + email + histórico
    var headerRow = h('<div class="header-row"></div>');
    var avatarBlock = h(
      '<div class="avatar-name">' +
        '<div class="avatar">' + initials(me.email) + '</div>' +
        '<div><div class="email-text">' + (me.email || '') + '</div>' +
        '<div class="logout">Sair</div></div>' +
      '</div>'
    );
    avatarBlock.querySelector('.logout').onclick = function () {
      clearToken(); state.screen = 'login'; state.codeSent = false; state.email = ''; render();
    };
    headerRow.appendChild(avatarBlock);

    var historyBtn = h('<button class="link">' + (state.history ? 'Fechar histórico' : 'Ver histórico') + '</button>');
    historyBtn.onclick = function () {
      if (state.history) { state.history = null; render(); return; }
      var token = getToken();
      api('/api/widget/history', { headers: { Authorization: 'Bearer ' + token } }).then(function (data) {
        state.history = data.history || []; render();
      });
    };
    headerRow.appendChild(historyBtn);
    body.appendChild(headerRow);

    // Saldo + progresso
    var pct = me.nextTier ? Math.min(100, Math.round((me.balance / me.nextTier.pointsRequired) * 100)) : 100;
    var balanceCard = h(
      '<div class="balance-card">' +
        '<div class="balance-row"><span class="balance-number">' + me.balance + '</span>' +
          '<span class="balance-label">pontos disponíveis</span></div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="progress-hint">' +
          (me.nextTier
            ? 'Faltam <strong>' + me.pointsToNext + ' pontos</strong> para ' + me.nextTier.name
            : me.currentTier ? 'Nível máximo alcançado.' : 'Continue comprando para desbloquear níveis.') +
        '</div>' +
      '</div>'
    );
    body.appendChild(balanceCard);

    // Tiers (todos os níveis, destacando o atual)
    if (me.tiers && me.tiers.length > 0) {
      var tiersSection = h('<div class="tiers-section"></div>');
      tiersSection.appendChild(h('<p class="section-label">Níveis de fidelidade</p>'));
      me.tiers.forEach(function (tier) {
        var reached = me.currentTier && tier.pointsRequired <= me.balance;
        var row = h(
          '<div class="tier-row' + (reached ? ' active' : '') + '">' +
            '<span class="tr-name">' + tier.name + '</span>' +
            '<span class="tr-meta">' + tier.pointsRequired + ' pontos' + (reached ? ' · alcançado' : '') + '</span>' +
          '</div>'
        );
        tiersSection.appendChild(row);
      });
      body.appendChild(tiersSection);
    }

    // Histórico (expandível)
    if (state.history) {
      body.appendChild(h('<p class="section-label">Últimas compras</p>'));
      if (state.history.length === 0) {
        body.appendChild(h('<p class="empty-hint">Você ainda não tem compras registradas.</p>'));
      } else {
        var list = h('<div class="history-list"></div>');
        state.history.forEach(function (item) {
          list.appendChild(h(
            '<div class="history-item">' +
              '<span class="history-date">' + fmtDate(item.createdAt) + '</span>' +
              '<span class="history-points">+' + item.points + ' pts</span>' +
            '</div>'
          ));
        });
        body.appendChild(list);
      }
    }

    // Resgate
    if (state.redeemSuccess) {
      body.appendChild(h('<div class="success-box">Cupom enviado. Confira seu e-mail.</div>'));
    } else {
      if (state.redeemError) body.appendChild(h('<div class="error-box">' + state.redeemError + '</div>'));

      var canRedeem = !!me.currentTier;
      var redeemBtn = h(
        '<button class="primary">' + (state.loading ? 'Resgatando...' : 'Resgatar cupom') + '</button>'
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
      body.appendChild(h('<p class="disclaimer">O cupom é enviado por e-mail e é de uso único — confira sua caixa de entrada após resgatar.</p>'));
    }

    wrap.appendChild(body);
    return wrap;
  }

  // ─── Boot ───────────────────────────────────────────────────────────────
  api('/api/widget/config?store=' + encodeURIComponent(storeId)).then(function (config) {
    if (!config.isActive) return;
    var sizePx = ICON_SIZES[config.iconSize] || 60;
    styleHost(config.iconPosition, sizePx);
    container.style.setProperty('--icon-size', sizePx + 'px');
    render();
  });
})();
