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
  var REF_KEY = 'cashbackpro_ref_' + storeId;

  // Captura ?ref=CODE do link de indicação e guarda até o cliente logar.
  try {
    var refParam = new URL(window.location.href).searchParams.get('ref');
    if (refParam) localStorage.setItem(REF_KEY, refParam);
  } catch (e) { /* localStorage indisponível */ }
  function getRef() { try { return localStorage.getItem(REF_KEY); } catch (e) { return null; } }
  function clearRef() { try { localStorage.removeItem(REF_KEY); } catch (e) {} }

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

  // Renderiza TODOS os níveis, um abaixo do outro, com status de cada um.
  function renderLevels(me) {
    var container = $('cbp-levels');
    if (!container) return;
    var tiers = (me.tiers || []).slice().sort(function (a, b) { return a.pointsRequired - b.pointsRequired; });
    if (!tiers.length) { container.innerHTML = '<div class="act-empty">Nenhum nível configurado ainda.</div>'; return; }
    var cur = me.currentTier;
    container.innerHTML = tiers.map(function (t) {
      var reached = me.balance >= t.pointsRequired;
      var isCurrent = cur && t.id === cur.id;
      var isNext = me.nextTier && t.id === me.nextTier.id;
      var label, cls;
      if (isCurrent) { label = 'Nível atual'; cls = 'cur'; }
      else if (reached) { label = 'Alcançado'; cls = 'reached'; }
      else if (isNext) { label = 'Faltam ' + me.pointsToNext + ' pts'; cls = 'next'; }
      else { label = 'Bloqueado'; cls = 'locked'; }
      var locked = !reached && !isNext && !isCurrent;
      return '<div class="lvl-item' + (locked ? ' lvl-locked' : '') + '">' +
        '<div class="lvl-item-medal">' + tierIcon(t, 42, '🏅') + '</div>' +
        '<div class="lvl-item-body">' +
          '<div class="lvl-item-top"><span class="lvl-item-name">' + esc(t.name) + '</span>' +
            '<span class="lvl-badge lvl-badge-' + cls + '">' + label + '</span></div>' +
          '<div class="lvl-item-req">' + t.pointsRequired + ' pontos</div>' +
          benefitsHtml(t) +
        '</div>' +
      '</div>';
    }).join('');
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
        api('/api/widget/auth/verify-code', { method: 'POST', body: { storeNuvemshopId: storeId, email: state.email, code: state.code, ref: getRef() } })
          .then(function (data) { setToken(data.token); clearRef(); state.loading = false; boot(); })
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

    // Pontos — sem conversão em R$: o desconto real é o cupom do nível
    // (percentual ou valor fixo), não é proporcional ao saldo de pontos.
    $('cbp-points').textContent = me.balance;
    var convEl = $('cbp-points-conv');
    if (cur && cur.pointsMultiplier > 1) {
      convEl.hidden = false;
      convEl.textContent = 'Ganhando ' + String(cur.pointsMultiplier).replace('.', ',') + '× pontos por compra';
    } else {
      convEl.hidden = true;
    }

    // Lista de todos os níveis (coluna direita)
    renderLevels(me);

    // Indique e ganhe — o card mostra o placar; link/regras ficam no modal.
    var ref = me.referral;
    var refAvailable = !!(ref && ref.enabled && ref.code);
    var refCard = $('cbp-ref-card');
    if (refCard) refCard.hidden = !refAvailable;
    if (refAvailable) {
      $('cbp-ref-count').textContent = ref.count || 0;
      $('cbp-ref-points').textContent = (ref.pointsEarned || 0) + ' pts';
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
          var meta = {
            earn: { ic: '🛒', title: 'Compra realizada' },
            welcome: { ic: '⭐', title: 'Bônus de boas-vindas' },
            referral: { ic: '👥', title: 'Bônus de indicação' },
            redeem: { ic: '🎟️', title: 'Cupom resgatado' },
          }[h.type] || { ic: '•', title: 'Atividade' };
          var pos = h.points >= 0;
          var sub = h.type === 'earn' && h.orderId ? ' · #' + h.orderId : (h.note ? ' · ' + esc(h.note) : '');
          return '<div class="act"><div class="a-ic" style="background:var(--cbp-surface);color:var(--cbp-primary)">' + meta.ic + '</div>' +
            '<div class="a-body"><div class="a-title">' + meta.title + '</div>' +
            '<div class="a-meta">' + fmtDate(h.createdAt) + sub + '</div></div>' +
            '<div class="a-pts ' + (pos ? 'pos' : 'neg') + '">' + (pos ? '+' : '') + h.points + ' pts</div></div>';
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

  // ─── Como funciona + navegação de página única ─────────────────────────────
  var DEFAULT_HIW =
    '1. A cada compra na loja, você ganha pontos automaticamente.\n' +
    '2. Os pontos sobem o seu nível e valem desconto.\n' +
    '3. Quando quiser, resgate seus pontos por um cupom e use na próxima compra.\n\n' +
    'Seus pontos ficam salvos na sua conta — acompanhe tudo por aqui.';

  var DEFAULT_REF_RULES =
    'Compartilhe o seu link com amigos.\n' +
    'Quando um amigo faz a primeira compra usando o seu link, vocês dois ganham pontos.\n' +
    'Acompanhe aqui quantos amigos já compraram e quantos pontos você ganhou.';

  function openHowItWorks() {
    $('cbp-hiw-body').textContent = state.howItWorks || DEFAULT_HIW;
    $('cbp-howitworks').hidden = false;
  }
  function closeHowItWorks() { $('cbp-howitworks').hidden = true; }

  function openReferral() {
    var ref = state.me && state.me.referral;
    if (!ref || !ref.enabled || !ref.code) return;
    $('cbp-refm-rules').textContent = ref.rules || DEFAULT_REF_RULES;
    var base = window.location.origin + window.location.pathname;
    var link = base + '?store=' + encodeURIComponent(storeId) + '&ref=' + encodeURIComponent(ref.code);
    var linkInput = $('cbp-ref-link');
    linkInput.value = link;
    var btn = $('cbp-ref-btn');
    btn.textContent = 'Copiar';
    btn.onclick = function () {
      linkInput.select();
      var done = function () { btn.textContent = 'Copiado!'; setTimeout(function () { btn.textContent = 'Copiar'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done, function () { try { document.execCommand('copy'); done(); } catch (e) {} });
      } else { try { document.execCommand('copy'); done(); } catch (e) {} }
    };
    $('cbp-referral-modal').hidden = false;
  }
  function closeReferral() { $('cbp-referral-modal').hidden = true; }

  function setupInteractions() {
    // "Como funciona" — só nas ações rápidas agora (saiu do menu lateral).
    var hiwQa = $('cbp-qa-hiw'); if (hiwQa) hiwQa.onclick = openHowItWorks;
    var hiwClose = $('cbp-hiw-close'); if (hiwClose) hiwClose.onclick = closeHowItWorks;
    var hiwBackdrop = $('cbp-hiw-backdrop'); if (hiwBackdrop) hiwBackdrop.onclick = closeHowItWorks;

    // Ações rápidas
    var qaShop = $('cbp-qa-shop');
    if (qaShop) qaShop.onclick = function () {
      // Volta pra loja (o cliente chegou aqui pela vitrine). Fallback: histórico.
      if (document.referrer) window.location.href = document.referrer;
      else if (window.history.length > 1) window.history.back();
    };
    var qaHistory = $('cbp-qa-history');
    if (qaHistory) qaHistory.onclick = function () {
      var el = $('sec-historico');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // Indique e ganhe — card no fim da coluna direita abre o modal.
    var refOpen = $('cbp-ref-open'); if (refOpen) refOpen.onclick = openReferral;
    var refClose = $('cbp-refm-close'); if (refClose) refClose.onclick = closeReferral;
    var refBackdrop = $('cbp-refm-backdrop'); if (refBackdrop) refBackdrop.onclick = closeReferral;

    // Ícone "ⓘ" ao lado de "Seus pontos" — explica o ciclo de 6 meses.
    var infoBtn = $('cbp-points-info'), infoPop = $('cbp-points-infopop');
    if (infoBtn && infoPop) {
      infoBtn.onclick = function (e) { e.stopPropagation(); infoPop.hidden = !infoPop.hidden; };
      document.addEventListener('click', function (e) {
        if (!infoPop.hidden && e.target !== infoBtn && !infoPop.contains(e.target)) infoPop.hidden = true;
      });
    }
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────
  function boot() {
    fetch(API_BASE + '/api/widget/config?store=' + encodeURIComponent(storeId))
      .then(function (r) { return r.json(); })
      .then(function (cfg) { applyBrand(cfg.brandColor); state.howItWorks = cfg.howItWorks || null; })
      .catch(function () {});

    var token = getToken();
    if (!token) { renderLogin(); return; }

    hide(elLogin); show(elDash); hide(elBoot);
    var lo = $('cbp-logout'); if (lo) lo.onclick = logout;
    setupInteractions();

    Promise.all([loadMe(), Promise.resolve(loadHistory())])
      .catch(function () { clearToken(); renderLogin(); });
  }

  boot();
})();
