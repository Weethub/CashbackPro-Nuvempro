/**
 * CashbackPro — LOADER do widget flutuante.
 *
 * É ESTE arquivo (e não o widget.js inteiro) que deve ser enviado no Partners
 * Portal da Nuvemshop, na tela de Script do app (handle "widget-teste").
 *
 * Por que um loader separado:
 * A Nuvemshop HOSPEDA o arquivo enviado no CDN dela (apps-scripts.tiendanube.com)
 * e serve uma cópia congelada por versão. Enviar o widget inteiro ali significa
 * reenviar o arquivo a cada mudança — e na prática a loja fica presa numa versão
 * antiga. Este loader nunca precisa mudar: ele só puxa o widget.js do nosso
 * domínio (Vercel), que atualiza sozinho a cada git push. Suba isto UMA vez.
 *
 * Fluxo:
 *   1. A Nuvemshop injeta este script com ?store=<id> na vitrine.
 *   2. Lemos o store da nossa própria URL e guardamos em window.CASHBACKPRO_STORE.
 *   3. Injetamos o widget.js real (Vercel), que lê o store dessa global — porque
 *      script inserido via DOM roda async e perde document.currentScript.
 */
(function () {
  var WIDGET_URL = 'https://frontend-gilt-tau-75.vercel.app/widget.js';

  var store = null;
  try {
    store = new URL(document.currentScript.src).searchParams.get('store');
  } catch (e) {
    /* sem store — não injeta nada */
  }
  if (!store) return;

  window.CASHBACKPRO_STORE = store;

  // Cache-buster de granularidade grossa (~10 min): novas versões do widget
  // aparecem em até 10 minutos após o deploy, sem re-baixar o arquivo a cada
  // navegação dentro dessa janela.
  var bucket = Math.floor(Date.now() / 600000);

  var s = document.createElement('script');
  s.src = WIDGET_URL + '?store=' + encodeURIComponent(store) + '&_=' + bucket;
  s.async = true;
  (document.head || document.documentElement).appendChild(s);
})();
