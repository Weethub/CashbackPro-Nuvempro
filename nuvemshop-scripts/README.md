# Scripts do Partners Portal (Nuvemshop)

## `widget-loader.js` — SUBIR UMA VEZ

Este é o único arquivo que vai no Partners Portal (tela de Script do app,
handle `widget-teste`, evento `onfirstinteraction`).

**Por quê:** a Nuvemshop hospeda o arquivo enviado no CDN dela e serve uma cópia
congelada por versão. Se subíssemos o `widget.js` inteiro ali, a cada mudança
teríamos que reenviar — e a loja tende a ficar presa numa versão antiga (foi
exatamente o bug: a loja carregava `widget-teste/4.js`, o widget velho verde).

O loader nunca muda: ele só injeta o `widget.js` real, servido pelo nosso
domínio (Vercel). A partir daí, **toda atualização do widget é só `git push`** —
o Vercel republica e a loja pega em até ~10 min (cache-buster do loader), sem
reenviar nada no Portal nem reinstalar o app.

## `widget.js` (em `frontend/widget-src/index.js`)

Lê o id da loja de `window.CASHBACKPRO_STORE` (setado pelo loader) e, como
fallback, de `document.currentScript.src` (caso a Nuvemshop injete o widget
direto, sem loader). Buildado por `npm run build:widget` → `frontend/public/widget.js`.
