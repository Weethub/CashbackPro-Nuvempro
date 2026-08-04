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

  var ICON_SIZES = { sm: 48, md: 60, lg: 76 };
  var POSITIONS = {
    'bottom-right': { bottom: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' },
    'top-right': { top: '20px', right: '20px' },
    'top-left': { top: '20px', left: '20px' },
  };

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
      background: #0F7A5C; color: #fff; display: flex; align-items: center; justify-content: center;
      font-size: calc(var(--icon-size, 60px) * 0.4); font-weight: 700; cursor: pointer; border: none;
      box-shadow: 0 2px 10px rgba(0,0,0,0.25); user-select: none;
      transition: background 0.15s ease;
    }
    .icon:hover { background: #0B5641; }
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

  // ─── Boot ───────────────────────────────────────────────────────────────
  fetch(API_BASE + '/api/widget/config?store=' + encodeURIComponent(storeId))
    .then(function (res) { return res.json(); })
    .then(function (config) {
      if (!config.isActive) return;
      var sizePx = ICON_SIZES[config.iconSize] || 60;
      styleHost(config.iconPosition, sizePx);
      container.style.setProperty('--icon-size', sizePx + 'px');

      var wrap = h('<div class="icon-wrap"></div>');
      var icon = h('<button class="icon" aria-label="Cashback">%</button>');
      icon.onclick = function () {
        window.location.href = config.pageUrl;
      };
      wrap.appendChild(icon);
      container.appendChild(wrap);
    });
})();
