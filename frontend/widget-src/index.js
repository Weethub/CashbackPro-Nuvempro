/**
 * CashbackPro — ícone flutuante da vitrine.
 * JS vanilla, sem dependências, buildado como IIFE único (ver package.json
 * "build:widget") — é esse arquivo que sobe no "Carregar arquivo javascript"
 * do painel de parceiros da Nuvemshop.
 *
 * Desenha o ícone; ao clicar, abre a página completa (fidelidade.html,
 * hospedada no nosso domínio) num painel embutido por cima da loja — o
 * cliente nunca sai do domínio da loja. A lógica de
 * login/saldo/nível/histórico/resgate mora em widget-src/fidelidade-page.js.
 *
 * Duas formas de chegar na loja:
 *   1) Injetado direto pela Nuvemshop como <script src=".../widget.js?store=1234">
 *      — lê o "store" da própria URL (document.currentScript.src).
 *   2) Carregado dinamicamente pelo loader (nuvemshop-scripts/widget-loader.js),
 *      que roda no Portal e injeta ESTE arquivo do nosso domínio. Nesse caso
 *      document.currentScript é null (script async inserido via DOM), então o
 *      loader deixa o id em window.CASHBACKPRO_STORE — é o fallback usado aqui.
 * O "store" não é credencial; toda ação sensível exige o JWT do login (na página).
 */
(function () {
  var API_BASE = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : 'https://localhost:3001';

  var storeId = (typeof window !== 'undefined' && window.CASHBACKPRO_STORE) || null;
  if (!storeId) {
    try {
      storeId = new URL(document.currentScript.src).searchParams.get('store');
    } catch (e) {
      /* sem store válido — ícone não renderiza */
    }
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
    hex = String(hex || '#7C3AED').replace('#', '');
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
      background: var(--icon-bg, #7C3AED); color: var(--icon-fg, #fff); display: flex;
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

  // ─── Painel embutido (abre fidelidade.html sem sair do domínio da loja) ────
  // Esse script roda direto no domínio da loja (via <script> injetado), então
  // pode manipular o DOM livremente — diferente da página "Minha Fidelidade"
  // da Nuvemshop, aqui não existe sanitização de conteúdo pra se preocupar.
  function buildOverlay(pageUrl) {
    var overlayHost = document.createElement('div');
    overlayHost.id = 'cashbackpro-widget-overlay-host';
    document.body.appendChild(overlayHost);
    var overlayShadow = overlayHost.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
      .backdrop {
        position: fixed; inset: 0; background: rgba(17,24,39,0.55);
        display: none; align-items: stretch; justify-content: flex-end;
        z-index: 2147483001; opacity: 0; transition: opacity 0.2s ease;
      }
      .backdrop.open { display: flex; opacity: 1; }
      .panel {
        position: relative; width: 100%; max-width: 460px; height: 100%;
        background: #fff; box-shadow: -8px 0 30px rgba(0,0,0,0.25);
      }
      iframe { width: 100%; height: 100%; border: 0; display: block; }
      .close {
        position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; border-radius: 50%;
        border: 0; background: rgba(17,24,39,0.08); color: #111827; font-size: 16px; line-height: 1;
        cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 1;
      }
      .close:hover { background: rgba(17,24,39,0.16); }
      @media (max-width: 640px) { .panel { max-width: 100%; } }
    `;
    overlayShadow.appendChild(style);

    var backdrop = h('<div class="backdrop"></div>');
    var panel = h('<div class="panel"></div>');
    var closeBtn = h('<button class="close" aria-label="Fechar">✕</button>');
    var iframe = document.createElement('iframe');
    iframe.title = 'Minha Fidelidade';
    panel.appendChild(closeBtn);
    panel.appendChild(iframe);
    backdrop.appendChild(panel);
    overlayShadow.appendChild(backdrop);

    function close() {
      backdrop.classList.remove('open');
      document.body.style.overflow = '';
    }
    function open() {
      if (!iframe.src) iframe.src = pageUrl;
      backdrop.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    return { open: open, close: close };
  }

  // ─── Arrastar o ícone pra outro canto ───────────────────────────────────────
  function makeDraggable(icon, sizePx, onActivate) {
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

    // Clique só ativa se não houve arraste — pointerup já tratou o arraste.
    icon.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; return; }
      onActivate();
    });
  }

  // ─── Página "Minha Fidelidade" embutida ────────────────────────────────────
  // A Nuvemshop sanitiza o conteúdo de Pages e remove o atributo `src` de
  // qualquer <iframe> ali dentro — então o backend deixa só um container
  // vazio com esse id, e é este script (rodando direto no DOM da loja, fora
  // do alcance do sanitizador) que injeta o iframe de verdade. Roda em toda
  // página da loja, mas só faz algo nas que têm o container — ou seja, só na
  // própria página "Minha Fidelidade".
  //
  // Substitui só o CONTEÚDO da página — o cabeçalho e o rodapé do tema
  // continuam visíveis normalmente, igual em qualquer outra página da loja.
  // O tema, porém, tem seu próprio container (grid do Bootstrap: .container
  // > .row > .col-md-8, com uma coluna irmã do lado) em volta do conteúdo da
  // página — remover o max-width só do nosso <div> não basta, ele continua
  // preso dentro dessa coluna, que nem fica centralizada na tela sozinha.
  // Por isso o full-bleed é calculado via JS (posição real medida do
  // elemento-pai) em vez de CSS puro (left:50%) — "left:50%" é relativo à
  // largura do PAI, não da viewport, e um .col-md-8 não é simétrico na tela
  // quando existe uma coluna irmã ocupando o resto do .row (confirmado ao
  // vivo: a Nuvemshop bota nosso conteúdo dentro de col-md-8, faltando
  // exatamente a largura da coluna irmã pra fechar a conta).
  // Estilo "encaixado no fluxo da página" (full-bleed, altura = conteúdo
  // real) vs. "tela cheia" (só enquanto um modal interno está aberto — ver
  // abaixo). Aplicados ao próprio <iframe>; embedEl só precisa do full-bleed
  // uma vez, ele não muda entre os dois modos.
  function embedFlowStyle() {
    return (
      'width: 100% !important;' + // 100% do embedEl (já com a largura exata da viewport, ver applyFullBleed)
      'border: 0 !important;' +
      'display: block !important;' +
      'position: static !important;' +
      'z-index: auto !important;'
    );
  }
  function embedFullscreenStyle() {
    return (
      'position: fixed !important;' +
      'inset: 0 !important;' +
      'width: 100vw !important;' +
      'height: 100vh !important;' +
      'border: 0 !important;' +
      'display: block !important;' +
      'z-index: 2147483000 !important;' +
      'background: #fff !important;'
    );
  }

  // Mede a posição real do <div> ANTES de mexer nele (ainda preso dentro da
  // coluna do tema) e usa isso pra calcular a margem negativa exata que leva
  // a borda esquerda até 0 — funciona não importa a estrutura de containers/
  // colunas que o tema usar, já que não depende de porcentagem nenhuma.
  function applyFullBleed(embedEl) {
    var vpWidth = document.documentElement.clientWidth;
    // clientWidth pode vir 0 se isso rodar antes do navegador terminar o
    // primeiro layout da página (ex.: resposta do /config chegando rápido
    // demais) — tenta de novo no próximo frame em vez de aplicar um valor
    // errado que reduziria o embed a largura zero.
    if (!vpWidth) { requestAnimationFrame(function () { applyFullBleed(embedEl); }); return; }
    var rect = embedEl.getBoundingClientRect();
    embedEl.style.cssText =
      'all: unset !important;' +
      'display: block !important;' +
      'width: ' + vpWidth + 'px !important;' +
      'margin-left: ' + (-rect.left) + 'px !important;' +
      'margin-right: 0 !important;';
  }

  function hydratePageEmbed(pageUrl) {
    var embedEl = document.getElementById('cashbackpro-page-embed');
    if (!embedEl) return;
    var origin;
    try { origin = new URL(pageUrl).origin; } catch (e) { return; }

    applyFullBleed(embedEl);
    // Se a janela for redimensionada (ou o celular girar), a coluna do tema
    // pode mudar de posição/largura — remede e reaplica. Repõe o
    // <embedEl>.style ANTES de medir de novo (senão mediria a própria
    // margem negativa já aplicada, e não a posição "natural" da coluna).
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        embedEl.style.cssText = ''; // solta a margem negativa antes de remedir a posição natural
        applyFullBleed(embedEl);
      }, 150);
    });
    embedEl.innerHTML = '';

    var iframe = document.createElement('iframe');
    iframe.src = pageUrl;
    iframe.title = 'Minha Fidelidade';
    iframe.style.cssText = embedFlowStyle();
    iframe.style.minHeight = '100vh'; // placeholder até o 1º aviso de altura real
    embedEl.appendChild(iframe);

    // fidelidade-page.js (dentro do iframe) avisa o tamanho real do conteúdo
    // via postMessage — sem isso o iframe teria altura fixa e o conteúdo
    // rolaria só por dentro dele (efeito "caixa" com rolagem dupla). Os
    // modais de lá usam position:fixed relativo ao viewport do PRÓPRIO
    // iframe, então quando um abre, o iframe vira tela cheia temporariamente
    // (senão o modal ficaria preso à altura do conteúdo, não da tela).
    var inModal = false;
    var lastHeight = null; // preservado através do ciclo abre/fecha modal
    window.addEventListener('message', function (event) {
      if (event.origin !== origin || event.source !== iframe.contentWindow) return;
      var data = event.data;
      if (!data || data.source !== 'cashbackpro-fidelidade') return;

      if (data.type === 'resize') {
        lastHeight = data.height;
        if (!inModal) iframe.style.height = lastHeight + 'px';
      } else if (data.type === 'modal-open') {
        inModal = true;
        iframe.style.cssText = embedFullscreenStyle();
        document.documentElement.style.overflow = 'hidden';
      } else if (data.type === 'modal-close') {
        inModal = false;
        document.documentElement.style.overflow = '';
        iframe.style.cssText = embedFlowStyle();
        iframe.style.minHeight = '100vh';
        if (lastHeight) iframe.style.height = lastHeight + 'px';
      }
    });
  }

  // ─── Detecção automática da cor da loja ────────────────────────────────────
  // Esse script roda direto no DOM real da loja, então em vez do lojista
  // digitar um hex manualmente, dá pra ler a cor já renderizada na página.
  // Heurística: cabeçalho, depois botões/links de destaque comuns — a
  // primeira cor "não neutra" (nem branco/preto/cinza) encontrada vence.
  // Best-effort: cada tema da Nuvemshop é construído de um jeito diferente,
  // sem um padrão universal de "isso aqui é a cor da marca" — em temas fora
  // do comum pode não achar nada, e aí cai pra cor manual do painel.
  function parseRgb(str) {
    var m = str && String(str).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)] : null;
  }
  function isNeutralColor(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var l = (max + min) / 2;
    var s = max === min ? 0 : (l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min));
    return s < 0.15 || l > 0.95 || l < 0.05;
  }
  function rgbToHex(rgb) {
    return '#' + rgb.map(function (c) { return Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0'); }).join('');
  }
  function detectBrandColor() {
    var selectors = [
      'header',
      'button[type="submit"]',
      '[class*="add-to-cart" i]',
      '[class*="addtocart" i]',
      '[class*="btn-primary" i]',
      '.button, a.button, button.button',
      'nav a',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (!el) continue;
      var rgb = parseRgb(getComputedStyle(el).backgroundColor);
      if (rgb && !isNeutralColor(rgb)) return rgbToHex(rgb);
    }
    return null;
  }

  // ─── Boot ───────────────────────────────────────────────────────────────
  fetch(API_BASE + '/api/widget/config?store=' + encodeURIComponent(storeId))
    .then(function (res) { return res.json(); })
    .then(function (config) {
      var autoColor = config.brandColorAuto !== false ? detectBrandColor() : null;
      var brandColor = autoColor || config.brandColor || '#7C3AED';
      // A cor detectada só existe aqui (script rodando na loja) — repassa
      // pro iframe via querystring, já que fidelidade-page.js (cross-origin,
      // no nosso domínio) não consegue ler a página da loja por conta própria.
      var pageUrl = config.pageUrl + (autoColor
        ? (config.pageUrl.indexOf('?') >= 0 ? '&' : '?') + 'autoColor=' + encodeURIComponent(autoColor)
        : '');

      // Independe do "blocked" do ícone: o cliente navegou direto pra essa
      // página, então mostra o app (que já trata sozinho o estado de pausa).
      hydratePageEmbed(pageUrl);

      // "blocked" = lojista pausou o programa E ligou o bloqueio total (o
      // ícone flutuante some). Na pausa "leve" (isActive=false, blocked=false)
      // o ícone continua — só não credita pontos novos nas compras.
      if (config.blocked) return;
      var sizePx = ICON_SIZES[config.iconSize] || 60;
      var position = getSavedPosition() || config.iconPosition;
      styleHost(position, sizePx);
      container.style.setProperty('--icon-size', sizePx + 'px');
      container.style.setProperty('--icon-bg', brandColor);
      container.style.setProperty('--icon-fg', pickTextColor(brandColor));

      var wrap = h('<div class="icon-wrap"></div>');
      var icon = h('<button class="icon" aria-label="Cashback">%</button>');
      wrap.appendChild(icon);
      container.appendChild(wrap);

      var overlay = buildOverlay(pageUrl);
      makeDraggable(icon, sizePx, overlay.open);
      watchCustomerTier(icon, pageUrl, brandColor);
    });
})();
