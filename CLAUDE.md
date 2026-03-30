# CLAUDE.md — NuvemPro App Template

> Documento de contexto para o Claude Code. Leia este arquivo antes de qualquer tarefa.
> Versão atual do template: **1.4.1**

---

## O que é este projeto

**NuvemPro App Template** é um boilerplate SaaS para criar apps embedados na Nuvemshop (plataforma de e-commerce latino-americana). Inclui:

- Backend Node.js/Express com autenticação OAuth Nuvemshop, billing Stripe e painel admin
- Frontend React (app embedado no painel da loja via iframe/Nexo SDK)
- Admin Frontend React para gerenciar planos, clientes, faturas, configurações

Este repositório **é o template em si** — não um app específico. Quando se cria um novo app, copia-se este template e personaliza.

---

## Estrutura do Monorepo

```
nuvempro-app-template/
├── backend/                    # Node.js + Express + Prisma + PostgreSQL
│   ├── src/
│   │   ├── server.js           # Entry point, middlewares, rotas
│   │   ├── config/
│   │   │   └── stripe.js       # StripeService (checkout, cancel, status, portal)
│   │   ├── lib/
│   │   │   ├── version.js      # TEMPLATE_VERSION — bumpar a cada release
│   │   │   ├── prisma.js       # Instância Prisma singleton
│   │   │   └── errors.js       # AppError class
│   │   ├── middleware/
│   │   │   ├── auth.js         # requireAuth (JWT Nuvemshop)
│   │   │   └── rateLimiter.js  # 5 níveis de rate limiting
│   │   ├── routes/
│   │   │   ├── billing.js      # GET /plans, POST /checkout, /cancel, /sync, /status, /invoices
│   │   │   ├── auth.js         # OAuth Nuvemshop + dev-token
│   │   │   ├── webhook.js      # Stripe webhooks
│   │   │   ├── profile.js      # Perfil da loja
│   │   │   └── terms.js        # Termos de uso
│   │   └── admin/
│   │       ├── routes/
│   │       │   ├── adminPlans.js        # CRUD planos + verify-stripe (auto-heal)
│   │       │   ├── adminSubscriptions.js
│   │       │   ├── adminCustomers.js
│   │       │   ├── adminConfig.js
│   │       │   ├── adminCoupons.js
│   │       │   ├── adminFaq.js
│   │       │   ├── adminLogs.js
│   │       │   └── adminCommissions.js
│   │       └── services/
│   │           └── adminPlanService.js  # syncToStripe (idempotente), find-or-create
│   └── prisma/
│       ├── schema.prisma
│       └── seed-admin.js
├── frontend/                   # React + Vite + Nimbus DS (app embedado)
│   └── src/
│       ├── providers/
│       │   └── NexoProvider.jsx    # Auth Nexo SDK, billingStatus, termsAccepted
│       ├── pages/
│       │   ├── BillingPage.jsx     # Planos, checkout, cancelar, faturas
│       │   ├── OnboardingPage.jsx
│       │   └── ...
│       ├── services/
│       │   └── api.js              # Axios com token refresh automático
│       └── i18n/locales/
│           ├── pt-BR.json
│           ├── es-AR.json
│           └── es-MX.json
├── admin-frontend/             # React + Vite + Tailwind (painel interno)
│   └── src/pages/
│       └── PlansPage.jsx       # Lista planos + Sincronizar com Stripe
├── vercel.json                 # Build config Vercel (aponta para frontend/)
├── CHANGELOG.md
├── STANDARDS.md                # Regras obrigatórias de código
├── PROMPT.md                   # Prompt para criar novo app a partir do template
└── ADMIN-PADRAO-NUVEMPRO-v3.0.md  # Guia completo das 12 fases
```

---

## Portas de Desenvolvimento

| Serviço        | Porta |
|----------------|-------|
| Backend        | 3001  |
| Frontend App   | 5173  |
| Admin Frontend | 5174  |

---

## Variáveis de Ambiente Principais (backend/.env)

```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
ADMIN_JWT_SECRET=...

NUVEMSHOP_APP_ID=...
CLIENT_ID=...
CLIENT_SECRET=...

STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

APP_NAME=NuvemPro App
APP_SLUG=meuapp
APP_EMAIL=contato@exemplo.com
FRONTEND_URL=https://...
ADMIN_URL=https://...
```

---

## Modelos Prisma (schema resumido)

| Modelo            | Propósito                                          |
|-------------------|----------------------------------------------------|
| `Store`           | Tenant. Tem `plan`, `stripeCustomerId`             |
| `Subscription`    | 1:1 com Store. `stripeSubscriptionId`, `cancelAtPeriodEnd`, `status` |
| `Invoice`         | Faturas Stripe salvas pelo webhook                 |
| `AdminPlan`       | Planos criados no admin. `stripePriceIds: Json`, `price: Json`, `features: Json` |
| `AdminUser`       | Usuários do painel admin                           |
| `AdminSession`    | Sessões admin (JWT salvo em DB)                    |
| `AdminConfig`     | Configurações chave-valor do app                   |
| `AdminCoupon`     | Cupons/promoções Stripe                            |
| `AdminFaq`        | FAQ do app                                         |
| `AdminLog`        | Auditoria de ações admin                           |
| `AdminCommission` | Comissões de parceiros                             |
| `StoreProfile`    | Dados extras da loja (JSON livre)                  |
| `TermsVersion`    | Versões dos termos de uso                          |
| `TermsAcceptance` | Aceites dos termos por loja                        |

### Campo importante: `AdminPlan.stripePriceIds`

```json
{
  "monthly": "price_xxx",
  "semestral": "price_yyy",
  "annual": "price_zzz"
}
```

---

## Arquitetura de Billing (Stripe)

### Fluxo de Sincronização de Planos (3 camadas de auto-heal)

O sistema garante que os `stripePriceIds` no banco estejam sempre corretos:

1. **Admin carrega `/plans/verify-stripe`** → busca por metadata no Stripe (`admin_plan_id`, `plan_key+app_id`) → atualiza DB se IDs desatualizados
2. **Frontend carrega `GET /api/billing/plans`** → para planos sem `stripePriceIds`, chama `syncToStripe` automaticamente
3. **`POST /api/billing/checkout`** → se `priceId` não encontrado no DB, tenta `syncToStripe` antes de falhar

### `adminPlanService.syncToStripe(planId)` — Idempotente

- `findOrCreateStripeProduct`: busca por `metadata['admin_plan_id']`, fallback por `metadata['plan_key']+metadata['app_id']`, cria se não existe
- `findOrCreateStripePrice`: busca preço ativo com mesmo `amount+interval`, arquiva preços obsoletos, cria se necessário
- Salva todos os `stripePriceIds` encontrados/criados no DB

### Shape do `billingStatus` (frontend)

```javascript
// GET /api/billing/status retorna:
{
  plan: 'growth',           // string: planKey ativo na Store
  trialEndsAt: null,        // DateTime | null
  subscription: {
    status: 'active',       // 'active' | 'trialing' | 'canceled' | 'past_due' | 'none'
    planKey: 'growth',
    billingInterval: 'monthly',
    currentPeriodStart: '2026-03-01T...',
    currentPeriodEnd: '2026-04-01T...',
    cancelAtPeriodEnd: false,   // true = cancelamento agendado
    stripeSubscriptionId: 'sub_xxx',
  }
}
```

**Atenção**: nunca usar `billingStatus.status` — o campo não existe nesse nível. Sempre `billingStatus.subscription.status`.

### Fluxo de Resubscrição (problema resolvido em v1.3.9)

Quando o usuário cancela e resubscreve via Checkout:
1. Stripe cria nova subscription com `cancel_at_period_end: false`
2. DB pode ainda ter o ID da subscription antiga
3. `POST /billing/sync` detecta a nova sub ativa e atualiza o DB
4. `BillingPage.syncPlan()` após sync bem-sucedido re-busca `/api/billing/status` completo → UI atualiza corretamente

---

## BillingPage — Lógica de Botões

```javascript
// Mostra botão "Cancelar assinatura":
isCurrent && hasActiveSub && !cancelAtEnd && !plan.isFree

// Mostra badge "Cancelamento agendado":
isCurrent && cancelAtEnd

// Mostra botão "Assinar":
isSubscribable && !isCurrent
// onde isSubscribable = !plan.isFree && intervalAvail && plan.configured
```

---

## Arquitetura de Termos de Uso (Gate obrigatório)

O fluxo de aceite de termos bloqueia o app até o tenant aceitar a versão mais recente publicada.

### Fluxo completo

```
1. NexoProvider → GET /api/terms/status
   Resposta: { required, accepted, terms: { id, version, title, content, publishedAt } }

2. Se accepted === false → App.jsx exibe TermsPage com termsData do contexto

3. TermsPage exibe conteúdo real do banco (termsData.content)
   — fallback para seções i18n se não houver termos publicados

4. Usuário rola até o fim → botão "Aceitar" habilitado

5. POST /api/terms/accept com { termsVersionId: termsData.id }
   — OBRIGATÓRIO enviar termsVersionId, senão retorna 400

6. onAccepted() → setTermsAccepted(true) → app liberado
```

### O que o NexoProvider expõe

```javascript
// Contexto NexoProvider:
{
  termsAccepted,      // boolean | null
  setTermsAccepted,   // setter
  termsData,          // { id, version, title, content, publishedAt } | null
}
```

### Admin gerencia os termos

- Criar rascunho: `POST /admin-api/terms` → `{ version, title, content }`
- Editar rascunho: `PUT /admin-api/terms/:id`
- Publicar: `POST /admin-api/terms/:id/publish` (role: proprietario)
- A publicação ativa o gate para todos os tenants que ainda não aceitaram

### Campos no Prisma

- `TermsVersion.isPublished` (não `isActive`) — campo correto para verificar se está ativo
- `TermsAcceptance` — unique em `[storeId, termsVersionId]`

---

## Padrões de Código Obrigatórios

Ver `STANDARDS.md` para checklist completo. Resumo:

- Toda rota usa `try/catch` com `next(err)` e `AppError` para erros conhecidos
- Formato de erro: `{ error, code, status }` — nunca mensagens hardcoded
- Todas as rotas de dados paginados usam `parsePagination` + `paginatedResponse`
- **Frontend admin: sempre `res.data.data` para acessar itens paginados** — nunca `res.data.campo || res.data` (tela branca)
- Toda query de app filtra por `storeId` (isolamento de tenant)
- Rate limiter em todas as rotas públicas
- Strings de UI sempre via i18n (pt-BR, es-AR, es-MX) — nunca hardcoded no JSX

---

## Deploy

| Serviço | Onde | O que sobe | Observação |
|---------|------|------------|------------|
| Backend | Railway | `backend/` | Redeploy via GraphQL API |
| Frontend (app) | Vercel | `frontend/` (via `vercel.json` raiz) | Deploy via API com SHA |
| Admin Frontend | Vercel (projeto separado) | `admin-frontend/` | **rootDirectory obrigatório** |

### ⚠️ Admin Frontend — rootDirectory crítico

O projeto Vercel do admin-frontend DEVE ter `rootDirectory: "admin-frontend"` configurado.
Sem isso, o Vercel usa o `vercel.json` da raiz, que builda o frontend principal (app Nuvemshop),
e o admin exibirá "Este aplicativo deve ser acessado pelo painel da Nuvemshop."

```bash
# Configurar uma vez por projeto:
curl -X PATCH "https://api.vercel.com/v9/projects/PROJ_ID" \
  -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" \
  -d '{"rootDirectory":"admin-frontend","framework":"vite"}'
```

### vercel.json (raiz do repo — Frontend principal)

```json
{
  "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### admin-frontend/vercel.json (Admin — próprio)

```json
{
  "buildCommand": "npm install && npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### git config — Evitar bloqueio Vercel

```bash
# Usar sempre o noreply do GitHub para que Vercel associe o committer
git config user.email "GITHUB_ID+username@users.noreply.github.com"
git config user.name "username"
```

---

## Histórico de Versões Recentes

| Versão | O que mudou |
|--------|-------------|
| **1.4.1** | Fix: tela branca em Terms/FAQ/Logs/Segurança admin (`res.data.data`); `isPublished` no lugar de `isActive`; endpoints `/logs/usage` e `/logs/abuse` adicionados; `admin-frontend/vercel.json` com build própria |
| **1.4.0** | Gate de Termos de Uso funcional: `NexoProvider` expõe `termsData`; `TermsPage` usa conteúdo do banco; `POST /terms/accept` envia `termsVersionId` corretamente |
| **1.3.9** | Fix: botão "Cancelar" não aparecia após resubscrição — `syncPlan` agora re-busca billing status completo |
| **1.3.8** | Fix: checkmarks vermelhos no admin pós auto-heal; checkout com auto-sync antes de falhar |
| **1.3.7** | Refactor completo BillingPage — campos corretos, modal cancelar, badge cancelAtPeriodEnd, faturas com "Ver" |

---

## Processo de Release (obrigatório a cada mudança)

1. Bumpar `backend/src/lib/version.js` → `TEMPLATE_VERSION`
2. Atualizar `CHANGELOG.md` com seção `## [x.y.z] - YYYY-MM-DD`
3. `git add` arquivos relevantes
4. `git commit -m "tipo: descrição (vX.Y.Z)"`
5. `git push origin main`

---

## Comandos Úteis

```bash
# Iniciar tudo em desenvolvimento
cd backend && npm run dev          # porta 3001
cd frontend && npm run dev         # porta 5173
cd admin-frontend && npm run dev   # porta 5174

# Após mudar schema.prisma:
cd backend
npx prisma db push
npx prisma generate
# reiniciar backend

# Stripe webhook local:
stripe listen --forward-to localhost:3001/webhook

# Rodar testes:
cd backend && npm test
```

---

## Problemas Conhecidos / Decisões de Arquitetura

- **`AdminPlan.name`** é o `planKey` (ex: `"growth"`), não um label de exibição
- **`AdminPlan.stripePriceIds`** é campo `Json` — nunca sobrescrever inteiro; usar spread `{ ...current, ...new }`
- **`cancelAllActiveSubscriptions`** usa `cancel_at_period_end: true`, não cancela imediatamente
- **Webhook Stripe** usa raw body — deve ser registrado ANTES do `express.json()` no `server.js`
- **Nuvemshop** usa header `"Authentication"` (não `"Authorization"`) para o token
- **Nexo SDK** (`@tiendanube/nexo`) gerencia sessão do iframe; `iAmReady()` dispara resize do iframe
- **`window.top.location.href`** usado no checkout para sair do iframe e ir ao Stripe

---

- **`paginatedResponse`** retorna `{ data, meta }` — no frontend admin usar sempre `res.data.data`, nunca `res.data.campo || res.data`
- **`TermsVersion.isPublished`** é o campo correto (não `isActive`)
- **Admin frontend** é acessado diretamente via URL, sem restrição de iframe — o `NexoProvider` que bloqueia acesso direto existe apenas no `frontend/`, não no `admin-frontend/`

---

*Atualizado em: 2026-03-30 | Versão: 1.4.1*
