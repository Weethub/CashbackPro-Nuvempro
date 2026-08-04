/**
 * CashbackPro — ícone flutuante da vitrine.
 * JS vanilla, sem dependências, buildado como IIFE único (ver package.json
 * "build:widget") — é esse arquivo que sobe no "Carregar arquivo javascript"
 * do painel de parceiros da Nuvemshop.
 *
 * Só desenha o ícone; ao clicar, navega pra página completa (fidelidade.html,
 * hospedada no nosso domínio) em vez de abrir modal — a lógica de
 * login/saldo/nível/histórico/resgate mora em widget-src/fidelidade-page.js.
 *
 * Injetado via Script resource, chega como <script src=".../widget.js?store=1234">
 * — o "store" identifica a loja (não é credencial; toda ação sensível exige
 * o JWT emitido no login, feito só na página).
 */
(function () {
  var API_BASE = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'https://localhost:3001';

  var scriptEl = document.currentScript;
  var storeId = null;
  try {
    storeId = new URL(scriptEl.src).searchParams.get('store');
  } catch (e) {
    /* sem store válido — ícone não renderiza */
  }
  if (!storeId) return;

  var POS_KEY = 'cashbackpro_widget_pos_' + storeId;
  var ICON_SIZES = { sm: 48, md: 60, lg: 76 };
  var POSITIONS = {
    'bottom-right': { bottom: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'top-left': { top: '20px', left: '20px' },
  };

  function pickTextColor(hex) {
    hex = String(hex || '#111827').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(hex.substr(0, 2), 16) || 0;
    var g = parseInt(hex.substr(2, 2), 16) || 0;
    var b = parseInt(hex.substr(4, 2), 16) || 0;
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#111827' : '#ffffff';
  }

  // O cliente pode arrastar o ícone pra outro canto — essa escolha é dele
  // (fica salva só no navegador dele, nesse domínio da loja) e tem prioridade
  // sobre a posição padrão que o lojista configurou no painel.
  function getSavedPosition() {
    try { return localStorage.getItem(POS_KEY); } catch (e) { return null; }
  }
  function savePosition(position) {
    try { localStorage.setItem(POS_KEY, position); } catch (e) { /* localStorage indisponível — ignora */ }
  }

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
    .icon-wrap { width: var(--icon-size, 60px); height: var(--icon-size, 60px); }
    .icon {
      width: var(--icon-size, 60px); height: var(--icon-size, 60px); border-radius: 50%;
      background: var(--icon-bg, #111827); color: var(--icon-fg, #fff); display: flex;
      align-items: center; justify-content: center; background-size: cover; background-position: center;
      font-size: calc(var(--icon-size, 60px) * 0.4); font-weight: 700; cursor: grab; border: none;
      box-shadow: 0 2px 10px rgba(0,0,0,0.25); user-select: none; touch-action: none;
      transition: filter 0.15s ease;
    }
    .icon:hover { filter: brightness(0.9); }
    .icon.dragging { cursor: grabbing; transition: none; }
  `;

  var container = document.createElement('div');
  shadow.appendChild(container);
  var styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  shadow.appendChild(styleEl);

  function h(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  // ─── Reflete o nível atual do cliente no ícone ─────────────────────────────
  // O login (e-mail+código) só acontece em fidelidade.html, hospedada no NOSSO
  // domínio — esse script roda no domínio da loja, então não enxerga o token
  // salvo lá (localStorage é isolado por origem). Um iframe oculto apontando
  // pra widget-session.html (mesma origem da página de fidelidade) resolve
  // isso: ele lê o token e devolve o nível atual via postMessage.
  function watchCustomerTier(icon, pageUrl, brandColor) {
    var origin;
    try { origin = new URL(pageUrl).origin; } catch (e) { return; }

    var iframe = document.createElement('iframe');
    iframe.src = origin + '/widget-session.html?store=' + encodeURIComponent(storeId);
    iframe.style.cssText = 'display:none !important;width:0 !important;height:0 !important;border:0 !important;';
    shadow.appendChild(iframe);

    window.addEventListener('message', function (event) {
      if (event.origin !== origin) return;
      var data = event.data;
      if (!data || data.source !== 'cashbackpro-widget-session' || data.type !== 'tier') return;

      var tier = data.tier;
      if (!tier) return;
      var accent = tier.color || brandColor;
      icon.style.border = '3px solid ' + accent;
      if (tier.icon) {
        icon.style.backgroundImage = 'url(' + tier.icon + ')';
        icon.textContent = '';
      }
    });
  }

  // ─── Arrastar o ícone pra outro canto ───────────────────────────────────────
  function makeDraggable(icon, sizePx) {
    var dragging = false;
    var moved = false;
    var pointerId = null;

    icon.addEventListener('pointerdown', function (e) {
      dragging = true;
      moved = false;
      pointerId = e.pointerId;
      icon.setPointerCapture(pointerId);
      icon.classList.add('dragging');
    });

    icon.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      moved = true;
      var half = sizePx / 2;
      var x = Math.min(Math.max(e.clientX, half), window.innerWidth - half);
      var y = Math.min(Math.max(e.clientY, half), window.innerHeight - half);
      host.style.setProperty('left', (x - half) + 'px', 'important');
      host.style.setProperty('top', (y - half) + 'px', 'important');
      host.style.setProperty('right', 'auto', 'important');
      host.style.setProperty('bottom', 'auto', 'important');
    });

    icon.addEventListener('pointerup', function (e) {
      if (!dragging) return;
      dragging = false;
      icon.classList.remove('dragging');
      icon.releasePointerCapture(pointerId);

      if (!moved) return; // clique normal — deixa o onclick navegar

      var nearestPosition =
        (e.clientY < window.innerHeight / 2 ? 'top' : 'bottom') + '-' +
        (e.clientX < window.innerWidth / 2 ? 'left' : 'right');
      savePosition(nearestPosition);
      styleHost(nearestPosition, sizePx);
    });

    // Clique só navega se não houve arraste — pointerup já tratou o arraste.
    icon.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
      window.location.href = icon.dataset.pageUrl;
    });
  }

  // ─── Boot ───────────────────────────────────────────────────────────────
  fetch(API_BASE + '/api/widget/config?store=' + encodeURIComponent(storeId))
    .then(function (res) { return res.json(); })
    .then(function (config) {
      if (!config.isActive) return;
      var sizePx = ICON_SIZES[config.iconSize] || 60;
      var position = getSavedPosition() || config.iconPosition;
      var brandColor = config.brandColor || '#111827';
      styleHost(position, sizePx);
      container.style.setProperty('--icon-size', sizePx + 'px');
      container.style.setProperty('--icon-bg', brandColor);
      container.style.setProperty('--icon-fg', pickTextColor(brandColor));

      var wrap = h('<div class="icon-wrap"></div>');
      var icon = h('<button class="icon" aria-label="Cashback">%</button>');
      icon.dataset.pageUrl = config.pageUrl;
      wrap.appendChild(icon);
      container.appendChild(wrap);

      makeDraggable(icon, sizePx);
      watchCustomerTier(icon, config.pageUrl, brandColor);
    });
})();
