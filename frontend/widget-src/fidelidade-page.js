/**
 * CashbackPro — página completa "Minha Fidelidade" (dashboard do cliente).
 * JS vanilla, sem dependências, buildado como IIFE (ver package.json
 * "build:widget") em public/fidelidade-page.js, carregado por
 * public/fidelidade.html?store=1234 — hospedado no nosso próprio domínio.
 *
 * O HTML já traz o layout completo (login + dashboard) com IDs; este script
 * só (a) controla o gate de login por e-mail+código e (b) hidrata os dados
 * reais que vêm do backend. Blocos ainda sem backend (conquistas, desafios,
 * sequência, indique e ganhe, oferta) ficam com conteúdo de exemplo marcado
 * "em breve" no HTML e serão ligados nas próximas etapas.
 */
(function () {
  var API_BASE = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'https://localhost:3001';
  var storeId = new URL(window.location.href).searchParams.get('store');
  var TOKEN_KEY = 'cashbackpro_token_' + storeId;

  var $ = function (id) { return document.getElementById(id); };
  var elLogin = $('cbp-login'), elDash = $('cbp-dashboard'), elBoot = $('cbp-boot');

  if (!storeId) { if (elBoot) elBoot.innerHTML = '<p style="padding:40px;text-align:center;color:#999">Loja não identificada.</p>'; return; }

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

  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }

  function nameFromEmail(email) {
    var local = (email || '').split('@')[0] || '';
    var first = local.split(/[._-]/)[0] || '';
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
  }
  function fmtDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtBRL(v) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
  }
  function pickTextColor(hex) {
    hex = String(hex || '#7C3AED').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(hex.substr(0, 2), 16) || 0, g = parseInt(hex.substr(2, 2), 16) || 0, b = parseInt(hex.substr(4, 2), 16) || 0;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#111827' : '#ffffff';
  }
  // Clareia (pct>0) ou escurece (pct<0) um hex — pra derivar os tons do tema a
  // partir da única cor que o lojista escolhe, em vez de deixar tons roxos fixos.
  function shade(hex, pct) {
    hex = String(hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(hex.substr(0, 2), 16) || 0, g = parseInt(hex.substr(2, 2), 16) || 0, b = parseInt(hex.substr(4, 2), 16) || 0;
    var t = pct < 0 ? 0 : 255, p = Math.abs(pct) / 100;
    var mix = function (c) { return Math.round((t - c) * p + c).toString(16).padStart(2, '0'); };
    return '#' + mix(r) + mix(g) + mix(b);
  }
  function applyBrand(color) {
    if (!color) return;
    var root = document.documentElement.style;
    root.setProperty('--cbp-primary', color);
    root.setProperty('--cbp-primary-dark', shade(color, -18));
    root.setProperty('--cbp-primary-2', shade(color, 14));
    root.setProperty('--cbp-surface', shade(color, 90));
    root.setProperty('--cbp-on-primary', pickTextColor(color));
  }
  // <img> do ícone do nível (base64 subido no painel) ou emoji de fallback.
  function tierIcon(tier, size, fallback) {
    if (tier && tier.icon) return '<img src="' + tier.icon + '" alt="" style="width:' + size + 'px;height:' + size + 'px;object-fit:contain;vertical-align:middle" />';
    return fallback;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // Lista de benefícios (textos livres cadastrados no painel) de um nível.
  function benefitsHtml(tier) {
    var list = tier && Array.isArray(tier.benefits) ? tier.benefits.filter(Boolean) : [];
    if (!list.length) return '';
    return '<div class="benefit-list">' + list.map(function (b) {
      return '<div class="benefit"><span class="b-ic">✓</span>' + esc(b) + '</div>';
    }).join('') + '</div>';
  }

  var state = { email: '', codeSent: false, loading: false, error: null, me: null };

  // ─── Login ────────────────────────────────────────────────────────────────
  function renderLogin() {
    hide(elBoot); hide(elDash); show(elLogin);
    $('cbp-login-title').textContent = state.codeSent ? 'Confirme seu código' : 'Acesse sua conta';
    $('cbp-login-sub').textContent = state.codeSent
      ? 'Enviamos um código de 6 dígitos para o seu e-mail'
      : 'Informe seu e-mail para ver seu saldo e resgatar cupons';

    var body = $('cbp-login-body');
    body.innerHTML = '';
    if (state.error) {
      var er = document.createElement('div'); er.className = 'login-error'; er.textContent = state.error; body.appendChild(er);
    }

    if (!state.codeSent) {
      body.insertAdjacentHTML('beforeend', '<label class="login-label">E-mail cadastrado na loja</label>');
      var email = document.createElement('input');
      email.className = 'login-input'; email.type = 'email'; email.placeholder = 'seu@email.com'; email.value = state.email;
      email.oninput = function (e) { state.email = e.target.value; };
      body.appendChild(email);
      var send = document.createElement('button');
      send.className = 'btn-primary'; send.disabled = state.loading; send.textContent = state.loading ? 'Enviando...' : 'Enviar código';
      send.onclick = function () {
        if (!state.email) return;
        state.loading = true; state.error = null; renderLogin();
        api('/api/widget/auth/request-code', { method: 'POST', body: { storeNuvemshopId: storeId, email: state.email } })
          .then(function () { state.codeSent = true; state.loading = false; renderLogin(); })
          .catch(function () { state.loading = false; state.error = 'Não foi possível enviar o código. Tente novamente.'; renderLogin(); });
      };
      body.appendChild(send);
    } else {
      body.insertAdjacentHTML('beforeend', '<label class="login-label">Código de 6 dígitos</label>');
      var code = document.createElement('input');
      code.className = 'login-input'; code.type = 'text'; code.maxLength = 6; code.placeholder = '000000';
      code.oninput = function (e) { state.code = e.target.value; };
      body.appendChild(code);
      var verify = document.createElement('button');
      verify.className = 'btn-primary'; verify.disabled = state.loading; verify.textContent = state.loading ? 'Verificando...' : 'Entrar';
      verify.onclick = function () {
        if (!state.code) return;
        state.loading = true; state.error = null; renderLogin();
        api('/api/widget/auth/verify-code', { method: 'POST', body: { storeNuvemshopId: storeId, email: state.email, code: state.code } })
          .then(function (data) { setToken(data.token); state.loading = false; boot(); })
          .catch(function () { state.loading = false; state.error = 'Código inválido ou expirado.'; renderLogin(); });
      };
      body.appendChild(verify);
      var back = document.createElement('button');
      back.className = 'btn-ghost'; back.textContent = 'Usar outro e-mail';
      back.onclick = function () { state.codeSent = false; state.error = null; renderLogin(); };
      body.appendChild(back);
    }
  }

  // ─── Dashboard ──────────────────────────────────────────────────────────
  function tierLevelNumber(me) {
    if (!me.currentTier) return 1;
    var sorted = (me.tiers || []).slice().sort(function (a, b) { return a.pointsRequired - b.pointsRequired; });
    var idx = sorted.findIndex(function (t) { return t.id === me.currentTier.id; });
    return idx >= 0 ? idx + 1 : 1;
  }

  function hydrate(me) {
    var name = nameFromEmail(me.email);
    $('cbp-greeting').textContent = name ? 'Olá, ' + name + '!' : 'Olá!';
    $('cbp-avatar').textContent = (name || me.email || '?').charAt(0).toUpperCase();
    $('cbp-since').textContent = me.memberSince ? 'Cliente desde ' + new Date(me.memberSince).getFullYear() : 'Sair';

    // Nível atual
    var cur = me.currentTier;
    $('cbp-level-name').textContent = cur ? cur.name : 'Iniciante';
    $('cbp-level-emoji').innerHTML = cur ? tierIcon(cur, 30, '🛡️') : '🌱';
    $('cbp-level-medal').innerHTML = cur ? tierIcon(cur, 104, '🏅') : '🏅';
    $('cbp-level-badge').textContent = 'Nível ' + tierLevelNumber(me);

    // Progresso pro próximo nível
    var target = me.nextTier ? me.nextTier.pointsRequired : (cur ? cur.pointsRequired : 0);
    var pct = target > 0 ? Math.min(100, Math.round((me.balance / target) * 100)) : 100;
    $('cbp-level-current').textContent = me.balance + ' / ' + target + ' pontos';
    $('cbp-level-remaining').textContent = me.nextTier ? 'Faltam ' + me.pointsToNext + ' pts' : 'Nível máximo';
    $('cbp-level-fill').style.width = pct + '%';
    $('cbp-level-next').innerHTML = me.nextTier
      ? 'Próximo nível: <b>' + me.nextTier.name + ' ' + tierIcon(me.nextTier, 18, '🥈') + '</b>'
      : 'Você alcançou o nível máximo! 🎉';

    // Pontos
    $('cbp-points').textContent = me.balance;
    var ppc = me.pointsPerCurrency || 1;
    var reais = ppc > 0 ? me.balance / ppc : 0;
    var mult = cur && cur.pointsMultiplier > 1
      ? ' · ganhando ' + String(cur.pointsMultiplier).replace('.', ',') + '× pontos'
      : '';
    $('cbp-points-conv').textContent = '≈ ' + fmtBRL(reais) + ' de desconto' + mult;

    // Próximo nível (coluna direita)
    var nl = $('cbp-nextlevel');
    if (me.nextTier) {
      var nlpct = target > 0 ? Math.min(100, Math.round((me.balance / target) * 100)) : 0;
      nl.innerHTML =
        '<div class="nl-top"><div class="nl-medal">' + tierIcon(me.nextTier, 48, '🥈') + '</div>' +
        '<div><div class="nl-name">' + esc(me.nextTier.name) + '</div>' +
        '<div class="nl-desc">Faltam ' + me.pointsToNext + ' pontos para alcançar o próximo nível.</div></div></div>' +
        '<div class="nl-progress-row"><span>' + me.balance + ' / ' + target + ' pontos</span><span>' + nlpct + '%</span></div>' +
        '<div class="track-2"><div class="fill" style="width:' + nlpct + '%"></div></div>' +
        benefitsHtml(me.nextTier);
    } else {
      nl.innerHTML = '<div class="nl-top"><div class="nl-medal">' + tierIcon(cur, 48, '🏅') + '</div>' +
        '<div><div class="nl-name">' + esc(cur ? cur.name : 'Topo') + '</div>' +
        '<div class="nl-desc">Você já está no nível máximo. Continue aproveitando os benefícios!</div></div></div>' +
        benefitsHtml(cur);
    }

    // Redeem
    var redeemBtn = $('cbp-redeem');
    redeemBtn.disabled = !cur;
    redeemBtn.onclick = function () {
      var msg = $('cbp-redeem-msg');
      redeemBtn.disabled = true; redeemBtn.textContent = 'Resgatando...';
      api('/api/widget/redeem', { method: 'POST', headers: { Authorization: 'Bearer ' + getToken() } })
        .then(function () {
          msg.hidden = false; msg.className = 'redeem-msg ok';
          msg.textContent = 'Cupom enviado! Confira seu e-mail.';
          redeemBtn.textContent = '🎟️ Resgatar cupom';
          loadMe();
        })
        .catch(function (err) {
          msg.hidden = false; msg.className = 'redeem-msg err';
          msg.textContent = err.code === 'NO_TIER_REACHED'
            ? 'Você ainda não atingiu nenhum nível de resgate.'
            : 'Não foi possível resgatar agora. Tente novamente.';
          redeemBtn.disabled = false; redeemBtn.textContent = '🎟️ Resgatar cupom';
        });
    };
  }

  function loadHistory() {
    api('/api/widget/history', { headers: { Authorization: 'Bearer ' + getToken() } })
      .then(function (data) {
        var list = $('cbp-activities');
        var items = data.history || [];
        if (!items.length) { list.innerHTML = '<div class="act-empty">Você ainda não tem atividades registradas.</div>'; return; }
        list.innerHTML = items.map(function (h) {
          return '<div class="act"><div class="a-ic" style="background:var(--cbp-surface);color:var(--cbp-primary)">🛒</div>' +
            '<div class="a-body"><div class="a-title">Compra realizada</div>' +
            '<div class="a-meta">' + fmtDate(h.createdAt) + (h.orderId ? ' · #' + h.orderId : '') + '</div></div>' +
            '<div class="a-pts pos">+' + h.points + ' pts</div></div>';
        }).join('');
      })
      .catch(function () { $('cbp-activities').innerHTML = '<div class="act-empty">Não foi possível carregar as atividades.</div>'; });
  }

  function loadMe() {
    return api('/api/widget/me', { headers: { Authorization: 'Bearer ' + getToken() } })
      .then(function (data) { state.me = data; hydrate(data); });
  }

  function logout() {
    clearToken(); state.me = null; state.email = ''; state.codeSent = false; state.code = ''; state.error = null;
    renderLogin();
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────
  function boot() {
    fetch(API_BASE + '/api/widget/config?store=' + encodeURIComponent(storeId))
      .then(function (r) { return r.json(); })
      .then(function (cfg) { applyBrand(cfg.brandColor); })
      .catch(function () {});

    var token = getToken();
    if (!token) { renderLogin(); return; }

    hide(elLogin); show(elDash); hide(elBoot);
    var lo = $('cbp-logout'); if (lo) lo.onclick = logout;

    Promise.all([loadMe(), Promise.resolve(loadHistory())])
      .catch(function () { clearToken(); renderLogin(); });
  }

  boot();
})();
