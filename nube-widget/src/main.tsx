import type { NubeSDK } from "@tiendanube/nube-sdk-types";

/**
 * Stub de conformidade — não é o widget real.
 *
 * O widget de cashback de verdade continua sendo o script legado
 * (frontend/widget-src/index.js, publicado como frontend/public/widget.js),
 * porque hoje ele funciona em qualquer tema. NubeSDK só renderiza no tema
 * Patagonia (confirmado na doc oficial), então reescrever o widget aqui
 * faria ele desaparecer na maioria das lojas.
 *
 * Este app existe só pra satisfazer a exigência da Nuvemshop de ter
 * integração NubeSDK (obrigatória a partir de 30/08/2026 pra permitir
 * instalações novas do app) — não renderiza nada de propósito, pra não
 * duplicar/conflitar com o widget legado quando ambos rodarem juntos numa
 * loja Patagonia no futuro.
 */
export function App(_nube: NubeSDK) {
  // Intencionalmente vazio.
}
