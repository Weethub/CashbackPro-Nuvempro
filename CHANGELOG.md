# Changelog

Todas as mudanças notáveis do template NuvemPro são documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
versionado em [Semantic Versioning](https://semver.org/lang/pt-BR/).

---

## [1.3.5] - 2026-03-30

### Corrigido

- **Sincronismo de planos com Stripe perde estado ao recarregar a página** — `syncToStripe` pulava silenciosamente a criação de novos preços se já havia um `stripePriceId` salvo, mesmo quando o valor do plano havia sido alterado; agora verifica via Stripe API se o ID ainda é válido e se o valor bate; se divergir ou estiver inativo, cria um novo Stripe Price
- **`verify-stripe` (bulk) retornava sempre "Sincronizado"** — endpoint só checava se `stripePriceIds` existia no banco, sem consultar o Stripe; agora chama `stripe.prices.retrieve()` para cada ID, retornando `missing` se inválido/inativo e `mismatch` se o valor divergir
- **PlansPage sem feedback contextual** — adicionadas dicas de ação nos status `mismatch` ("Preços alterados. Clique em Sincronizar Stripe") e `missing` para orientar o usuário

---

## [1.3.4] - 2026-03-28

### Corrigido

- **`AppNav.jsx`: crash `Cannot read properties of undefined (reading 'Item')`** — `NavTabs` não existe no `@nimbus-ds/components` v5; acesso a `NavTabs.Item` causava TypeError imediato ao renderizar; substituído por `Button` com `appearance="primary|transparent"` baseado em `isActive(path)`, seguindo o padrão correto do Nimbus DS v5

---

## [1.3.3] - 2026-03-28

### Corrigido

- **`requireAuth` não aceitava tokens do Nexo SDK** — o middleware só verificava com `JWT_SECRET` e buscava por `id` interno; tokens do Nexo são assinados com `NUVEMSHOP_CLIENT_SECRET` e têm `storeId` = nuvemshopId (string); adicionada verificação dual-key com fallback e lookup por `nuvemshopId` para tokens Nexo
- **Sincronização de `plan` com assinatura ativa** adicionada ao middleware (garante que `store.plan` reflita a assinatura ativa)

---

## [1.3.2] - 2026-03-28

### Corrigido

- **Nexo SDK: API usada incorretamente** — `NexoProvider` chamava `nexoInstance.connect()` e `nexoInstance.getSessionToken()` como métodos de instância, mas o SDK só exporta estas como **funções standalone** (`connect(instance)`, `getSessionToken(instance)`); a instância criada por `create()` não possui esses métodos
- **`iAmReady()` nunca era chamado** — sem esta chamada a Nuvemshop mantém o iframe com `height=0` e exibe erro; corrigido para chamar `iAmReady(nexoInstance)` ao final da inicialização, justo antes de `setLoading(false)`
- Imports corrigidos: `import nexo, { connect as nexoConnect, iAmReady, getSessionToken as nexoGetSessionToken } from '@tiendanube/nexo'`

---

## [1.3.1] - 2026-03-28

### Corrigido

- **`isNuvemshopReferrer()` não reconhecia lojas brasileiras** — `document.referrer` dentro do iframe aponta para `*.lojavirtualnuvem.com.br` (domínio do painel admin BR), que não estava na lista de verificação; adicionados `lojavirtualnuvem.com.br`, `mitiendanube.com` e `mynuvemshop.com`
- **Variáveis de ambiente Vercel ausentes** — `VITE_API_URL` e `VITE_NUVEMSHOP_APP_ID` não estavam configuradas no projeto Vercel, fazendo o Nexo SDK conectar com clientId `'00000'` (fallback) em vez do ID real do app (`28692`)

---

## [1.3.0] - 2026-03-28

### Corrigido

- **OAuth callback redireciona para o admin da Nuvemshop** — backend agora redireciona para `nuvemshop.com.br/admin/{userId}` (ou `tiendanube.com` para AR) após instalação; antes redirecionava para o frontend causando erro "acesso direto"
- **`InstallSuccess` reescrito** — página de fallback `/auth/callback?token=...` decodifica o JWT, mostra "Instalação concluída!" e redireciona com countdown para o admin correto; detecta país pelo payload do JWT
- **`main.jsx`** — detecta path `/auth/callback` + param `token` e renderiza `InstallSuccess` fora do `NexoProvider` (sem o erro de "acesso direto")
- **Bug #1: dev-token GET→POST** — `NexoProvider.jsx` chamava `api.get('/auth/dev-token')` mas backend tem `POST`; corrigido para `api.post('/auth/dev-token', {})`
- **Bug #4: /api/me não existe** — `NexoProvider.jsx` chamava `/api/me` (rota inexistente); corrigido para `/auth/verify-token` (rota real)

---

## [1.2.0] - 2026-03-28

### Adicionado

- **Sincronização automática de cupons com Stripe** — ao criar um cupom no admin, o sistema cria automaticamente um Stripe Coupon e um Stripe Promotion Code vinculados
- **Isolamento por app via `applies_to.products`** — cada cupom é restrito aos produtos Stripe dos planos deste app; não funciona em checkouts de outros apps na mesma conta Stripe
- **Endpoint `POST /admin-api/coupons/:id/sync-stripe`** — sincroniza um cupom existente com o Stripe (útil para cupons criados antes desta versão)
- **Endpoint `GET /admin-api/coupons/verify-stripe`** — verifica o status de todos os cupons no Stripe (synced / missing / expired / not_synced)
- **Endpoint `PATCH /admin-api/coupons/:id`** — toggle de `isActive` com desativação automática do Promotion Code no Stripe
- **Coluna "Stripe" na tabela de cupons** — badge de status (Stripe OK / Ausente / Expirado / Não sincronizado) com ícones visuais
- **Botão de sincronização por linha** — ícone de refresh em cada cupom para sincronizar individualmente
- **Botão "Verificar Stripe"** no cabeçalho da página de cupons

### Corrigido

- **Tipo de cupom unificado** — backend e frontend agora usam os mesmos tipos: `percent_off`, `amount_off`, `free_period` (antes backend usava "percentage"/"fixed")
- **Modal de edição de cupom** — código e tipo desabilitados ao editar (não podem ser alterados após criação no Stripe)

### Técnico

- Modelo `AdminCoupon` no Prisma recebeu campos `stripeCouponId String?` e `stripePromotionCodeId String?`
- `free_period` mapeado para Stripe como cupom 100% off com `duration: repeating, duration_in_months = ceil(dias/30)`
- Erros de sincronização com Stripe são não-bloqueantes: cupom é criado no banco mesmo se Stripe falhar

---

## [1.1.0] - 2026-03-28

### Corrigido

- **Sync de planos com Stripe não funcionava** — frontend enviava `prices` (plural) mas backend lia `price` (singular); preços nunca eram salvos e o syncToStripe encontrava `{}` sem criar nada no Stripe
- **Modal de edição de plano não abria** — `features` vindo do banco como objeto `{}` causava `TypeError` em `.join()` ao abrir o formulário; corrigido com `Array.isArray()` antes do `.join()`
- **Tela em branco ao acessar Planos** — `VITE_ADMIN_API_URL` não persistido no projeto Vercel fazia o app chamar `/admin-api` relativo ao próprio domínio; Vercel servia HTML pelo SPA fallback; Axios recebia string em vez de JSON → `e.map is not a function` derrubava o React inteiro

### Adicionado

- **Endpoint `GET /admin-api/plans/verify-stripe`** — verifica todos os planos de uma vez; eliminava erro 404 no carregamento da página de Planos
- **`normalizePlan()` nas respostas da API** — todas as rotas de planos agora retornam `prices` como alias de `price` para compatibilidade com o frontend
- **Metadados Stripe completos** — Product e Price criados/sincronizados com `plan_key`, `admin_plan_id`, `app_name`, `app_slug` conforme padrão NuvemPro v2.1
- **`subscription_data.metadata` completo no checkout** — inclui `app_id`, `app_name`, `app_slug`, `partner_id`, `partner_name`, `store_id`, `plan_key`, `billing_interval` para rastreamento de comissões via webhook

---

## [1.0.0] - 2026-03-28

### Adicionado

- Template base completo para apps SaaS na Nuvemshop
- Autenticação via Nuvemshop OAuth + Nexo SDK
- Billing com Stripe (checkout, portal, webhooks)
- Painel admin com gestão de planos, assinaturas, cupons, comissões, logs, FAQ, termos
- Versionamento do template exposto via `/health` e comparado com GitHub Releases
- Badge de versão no rodapé da sidebar com alerta de atualização disponível
- Exibição de conta Stripe (modo teste/produção) na página de Planos
