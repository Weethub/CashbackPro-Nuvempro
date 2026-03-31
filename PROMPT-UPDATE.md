# Prompt: Atualizar App a partir do NuvemPro App Template

> Use este prompt com Claude Code dentro do repositório do **app** (ex: BlogAI).
> O template está em: https://github.com/NuvemproApp/nuvempro-app-template

---

## CONTEXTO QUE VOCÊ PRECISA PASSAR AO CLAUDE

```
Tenho dois repositórios:

1. TEMPLATE (fonte das atualizações):
   https://github.com/NuvemproApp/nuvempro-app-template
   — É o boilerplate base. Contém admin, frontend embedado e backend.
   — Nunca tem lógica específica de negócio.

2. APP (meu projeto, que você está editando agora):
   [URL DO SEU REPO AQUI — ex: https://github.com/NuvemproApp/blogai]
   — Baseado no template, mas com páginas, rotas e lógica específicas do app.
   — A versão atual do template neste app está em: backend/src/lib/version.js

Quero atualizar o APP com as melhorias do TEMPLATE sem quebrar nenhuma
customização específica do app.

Siga o processo abaixo EXATAMENTE, passo a passo, sem pular etapas.
```

---

## PROCESSO COMPLETO — SIGA EXATAMENTE ESTA ORDEM

### FASE 1 — LEITURA E DIAGNÓSTICO

**1.1 — Leia a versão atual do app**
```
Leia: backend/src/lib/version.js
Anote: VERSÃO_ATUAL = valor de TEMPLATE_VERSION
```

**1.2 — Clone o template em um diretório temporário**
```bash
git clone https://github.com/NuvemproApp/nuvempro-app-template /tmp/nuvempro-template
```

**1.3 — Leia a versão do template**
```
Leia: /tmp/nuvempro-template/backend/src/lib/version.js
Anote: VERSÃO_TEMPLATE = valor de TEMPLATE_VERSION
```

**1.4 — Leia o CHANGELOG do template**
```
Leia: /tmp/nuvempro-template/CHANGELOG.md
Liste TODAS as versões entre VERSÃO_ATUAL e VERSÃO_TEMPLATE.
Para cada versão, anote o que foi Adicionado, Corrigido e Modificado.
Apresente este resumo ao usuário antes de continuar.
```

**1.5 — Mapeie os arquivos customizados do app**

Leia estes arquivos no APP e anote o que foi customizado:
- `backend/src/server.js` — quais rotas específicas do app foram adicionadas?
- `backend/prisma/schema.prisma` — quais models específicos do app existem?
- `frontend/src/App.jsx` — quais rotas específicas do app foram adicionadas?
- `frontend/src/components/AppNav.jsx` — há itens de nav customizados?
- `frontend/src/i18n/locales/pt-BR.json` — quais chaves são específicas do app?
- `admin-frontend/src/App.jsx` — há rotas ou menus adicionados?
- `.github/workflows/ci.yml` — há steps específicos do app?

Apresente ao usuário o resumo das customizações encontradas antes de continuar.

---

### FASE 2 — CLASSIFICAÇÃO DOS ARQUIVOS

Classifique cada arquivo alterado no template em uma das três categorias:

**CATEGORIA A — Copiar direto** (template controla 100%, sem risco)
```
/tmp/nuvempro-template/backend/railway.json
/tmp/nuvempro-template/backend/doppler.yaml
/tmp/nuvempro-template/frontend/doppler.yaml
/tmp/nuvempro-template/admin-frontend/doppler.yaml
/tmp/nuvempro-template/scripts/setup-dev.sh
/tmp/nuvempro-template/scripts/validate-template.sh
/tmp/nuvempro-template/backend/.env.example
/tmp/nuvempro-template/frontend/.env.example
/tmp/nuvempro-template/admin-frontend/.env.example
/tmp/nuvempro-template/admin-frontend/vercel.json
/tmp/nuvempro-template/admin-frontend/src/pages/FaqPage.jsx
/tmp/nuvempro-template/admin-frontend/src/pages/DashboardPage.jsx
/tmp/nuvempro-template/admin-frontend/src/pages/CustomersPage.jsx
/tmp/nuvempro-template/admin-frontend/src/pages/CustomerDetailPage.jsx
/tmp/nuvempro-template/admin-frontend/src/pages/SubscriptionsPage.jsx
/tmp/nuvempro-template/admin-frontend/src/pages/SettingsPage.jsx
/tmp/nuvempro-template/admin-frontend/src/components/StatCard.jsx
/tmp/nuvempro-template/backend/src/admin/routes/adminFaq.js
/tmp/nuvempro-template/backend/src/admin/routes/adminConfig.js
/tmp/nuvempro-template/backend/src/admin/routes/adminCustomers.js
/tmp/nuvempro-template/backend/src/admin/routes/adminSubscriptions.js
/tmp/nuvempro-template/backend/src/admin/routes/adminPlans.js
/tmp/nuvempro-template/backend/src/admin/routes/adminCoupons.js
/tmp/nuvempro-template/backend/src/admin/routes/adminTerms.js
/tmp/nuvempro-template/backend/src/admin/routes/adminLogs.js
/tmp/nuvempro-template/backend/src/admin/routes/adminCommissions.js
/tmp/nuvempro-template/backend/src/admin/routes/adminSecurity.js
/tmp/nuvempro-template/backend/src/admin/services/adminPlanService.js
/tmp/nuvempro-template/backend/src/config/stripe.js
/tmp/nuvempro-template/backend/src/routes/billing.js
/tmp/nuvempro-template/backend/src/routes/terms.js
/tmp/nuvempro-template/backend/src/routes/support.js
/tmp/nuvempro-template/backend/src/middleware/auth.js
/tmp/nuvempro-template/backend/src/middleware/rateLimiter.js
/tmp/nuvempro-template/backend/src/lib/errors.js
/tmp/nuvempro-template/backend/src/lib/paginate.js
/tmp/nuvempro-template/backend/src/lib/version.js
/tmp/nuvempro-template/frontend/src/pages/BillingPage.jsx
/tmp/nuvempro-template/frontend/src/pages/TermsPage.jsx
/tmp/nuvempro-template/frontend/src/providers/NexoProvider.jsx
/tmp/nuvempro-template/frontend/src/services/api.js
```

**CATEGORIA B — Merge manual obrigatório** (template evoluiu MAS app tem customizações)
```
backend/src/server.js
   → Template: adiciona rotas novas (support, etc)
   → App: tem rotas específicas do app
   → Estratégia: adicionar APENAS as rotas novas do template; não remover nada do app

backend/prisma/seed-admin.js
   → Template: adiciona novos AdminConfig defaults (goals, support, trial)
   → App: pode ter planos específicos
   → Estratégia: adicionar APENAS os novos blocos de upsert; não alterar planos do app

frontend/src/App.jsx
   → Template: pode ter ajustes no gate de billing/terms/trial
   → App: tem rotas específicas (ex: /blog, /posts, /editor)
   → Estratégia: comparar bloco a bloco; preservar rotas do app; atualizar apenas gates

frontend/src/components/AppNav.jsx
   → Template: evoluiu support sidebar (FAQ dinâmico, vídeo, WhatsApp)
   → App: pode ter itens de nav adicionais
   → Estratégia: substituir o bloco do Sidebar completo; preservar itens de nav do app

frontend/src/i18n/locales/pt-BR.json (e es-AR.json, es-MX.json)
   → Template: adiciona chaves novas (trial.*, billing.*, support.*)
   → App: tem chaves específicas do app
   → Estratégia: MERGE — adicionar chaves novas do template; nunca remover chaves do app

admin-frontend/src/App.jsx
   → Template: rotas do admin base
   → App: pode ter novas páginas admin específicas
   → Estratégia: adicionar rotas novas do template; preservar rotas do app

.github/workflows/ci.yml
   → Template: corrigiu nomes de variáveis, adicionou steps
   → App: pode ter steps específicos
   → Estratégia: atualizar bloco env; preservar steps do app

vercel.json (raiz)
   → Template: mudou npm install → npm ci
   → App: pode ter rewrites customizados
   → Estratégia: atualizar buildCommand; preservar rewrites e headers do app
```

**CATEGORIA C — NÃO TOCAR** (100% específico do app)
```
frontend/src/pages/Dashboard.jsx       ← lógica do app
frontend/src/pages/[qualquer página do app]
backend/src/routes/[rotas do app]      ← ex: routes/posts.js, routes/ai.js
backend/prisma/schema.prisma           ← models do app — NUNCA sobrescrever
backend/src/config/[configs do app]
admin-frontend/src/pages/[páginas específicas do app]
```

---

### FASE 3 — APLICAR AS ATUALIZAÇÕES

**3.1 — Crie uma branch de atualização**
```bash
git checkout -b update/template-vX.Y.Z
```
(substitua X.Y.Z pela VERSÃO_TEMPLATE)

**3.2 — Aplique os arquivos CATEGORIA A (cópia direta)**

Para cada arquivo da Categoria A que foi modificado no template
(compare com o diff entre VERSÃO_ATUAL e VERSÃO_TEMPLATE):

```bash
cp /tmp/nuvempro-template/[caminho] ./[caminho]
```

Registre cada arquivo copiado em uma lista.

**3.3 — Aplique os arquivos CATEGORIA B (merge manual)**

Para cada arquivo de merge, siga este protocolo:

1. Leia o arquivo no APP (versão atual)
2. Leia o arquivo no TEMPLATE (versão nova)
3. Identifique EXATAMENTE o que mudou (diff mental ou real)
4. Aplique SOMENTE as mudanças do template que não conflitam com o app
5. Verifique que nenhuma customização do app foi removida
6. Documente o que foi mesclado

**Regras absolutas do merge:**
- NUNCA remover uma rota que existe no app mas não no template
- NUNCA remover uma chave i18n que existe no app mas não no template
- NUNCA alterar modelos Prisma (Categoria C)
- Em caso de dúvida, PERGUNTE ao usuário antes de aplicar

**3.4 — Verifique arquivos NOVOS no template**

Arquivos que existem no template mas NÃO existem no app devem ser copiados
se forem Categoria A ou B:
```bash
# Exemplo de novo arquivo:
cp /tmp/nuvempro-template/backend/src/routes/support.js ./backend/src/routes/support.js
cp /tmp/nuvempro-template/backend/railway.json ./backend/railway.json
```

Se o arquivo novo em server.js registra uma nova rota (ex: `/api/support`),
adicione o require e o app.use() correspondente no server.js do app,
SEM remover nada que já existe.

---

### FASE 4 — BANCO DE DADOS

**4.1 — Verifique se o schema.prisma mudou no template**

```bash
diff /tmp/nuvempro-template/backend/prisma/schema.prisma ./backend/prisma/schema.prisma
```

⚠️ NÃO copie o schema do template. Apenas verifique se há novos models ou
campos que precisam ser ADICIONADOS ao schema do app.

Models do template que devem existir no app (verifique se estão presentes):
- `AdminConfig` — com campos: id, key, value, group, label
- `AdminFaq` — com campos: id, category, question, answer, videoUrl, isPublished, sortOrder
- `TermsVersion` — com campo `isPublished` (não `isActive`)
- `AdminLog`, `AdminCoupon`, `AdminCommission`, `StoreProfile`

Se algum estiver faltando, adicione ao schema e rode:
```bash
cd backend && npx prisma db push
```

**4.2 — Atualize o seed**

Após mesclar o seed-admin.js (Categoria B), verifique se há novos
blocos de `AdminConfig` no template que não existem no app:

Novos configs esperados (verifique um a um):
- `trial_mode`, `trial_days`, `trial_coupon` (sistema de trial)
- `goal_stores`, `goal_subs`, `goal_trial`, `goal_mrr`, `server_cost` (metas do dashboard)
- `support_video_url`, `support_whatsapp` (suporte do sidebar)

Para cada um que estiver faltando, adicione o bloco `upsert` no seed do app.

---

### FASE 5 — VERIFICAÇÃO

**5.1 — Verifique se o backend compila**
```bash
cd backend && node -e "require('./src/server.js')" && echo "OK"
```

**5.2 — Verifique se o frontend builda**
```bash
cd frontend && npm run build
cd admin-frontend && npm run build
```

**5.3 — Execute os testes**
```bash
cd backend && npm test
```

Todos os testes devem passar. Se algum falhar, corrija antes de continuar.

**5.4 — Checklist de funcionalidades**

Verifique que estas funcionalidades do app ainda funcionam:
- [ ] Login admin
- [ ] Dashboard com métricas
- [ ] Lista de planos
- [ ] Lista de lojas/clientes
- [ ] FAQ admin (criar, editar, publicar)
- [ ] Configurações (trial, metas, suporte)
- [ ] Sidebar de suporte no frontend (FAQ, vídeo, WhatsApp)
- [ ] Funcionalidades específicas do app (liste aqui as páginas do app)

---

### FASE 6 — COMMIT E DEPLOY

**6.1 — Atualize a versão**
```
Edite: backend/src/lib/version.js
Mude TEMPLATE_VERSION para a VERSÃO_TEMPLATE que foi aplicada
```

**6.2 — Atualize o CHANGELOG do app**
```
Adicione uma seção no CHANGELOG.md do app:
## [VERSÃO_TEMPLATE] - DATA
### Atualizado do Template
- Lista resumida do que foi aplicado
```

**6.3 — Commit**
```bash
git add -A
git commit -m "chore: atualiza template para vX.Y.Z

Aplicadas atualizações do NuvemPro App Template:
- [liste os principais itens aplicados]

Customizações do app preservadas:
- [liste o que foi mantido intacto]"
```

**6.4 — Abra Pull Request**
```bash
gh pr create --title "Update: template v[VERSÃO_TEMPLATE]" \
  --body "Atualização do NuvemPro App Template.

## O que foi atualizado
- [lista]

## O que foi preservado do app
- [lista]

## Testes
- [ ] Build backend OK
- [ ] Build frontend OK
- [ ] Build admin OK
- [ ] npm test OK
- [ ] Funcionalidades do app testadas manualmente"
```

**6.5 — Rode o seed em produção após merge**
```bash
# Via Railway CLI ou shell do Railway:
node prisma/seed-admin.js
```

---

## REGRAS DE OURO — NUNCA VIOLAR

```
1. NUNCA sobrescrever backend/prisma/schema.prisma
2. NUNCA remover rotas do app em server.js
3. NUNCA remover chaves i18n específicas do app
4. NUNCA commitar sem os testes passando
5. SEMPRE trabalhar em branch separada (nunca direto na main)
6. SEMPRE apresentar o resumo do CHANGELOG antes de começar as edições
7. SEMPRE perguntar ao usuário quando houver dúvida sobre o que é "do template"
   vs "do app" — é melhor perguntar do que quebrar
8. Se um arquivo de Categoria B tiver conflito irresolvível, apresente
   o diff ao usuário e peça decisão antes de aplicar
```

---

## INFORMAÇÕES QUE VOCÊ DEVE COLETAR DO USUÁRIO ANTES DE COMEÇAR

```
1. URL do repositório do app: _______________
2. Branch principal do app (main/master): _______________
3. Versão atual do template no app (ou "não sei"): _______________
4. Quais são as principais páginas/funcionalidades customizadas do app?
   Ex: "BlogAI tem as páginas: /editor, /posts, /analytics e as rotas
   backend: /api/posts, /api/generate, /api/analytics"
5. O banco de dados de produção já está rodando? (importante para o seed)
6. O deploy é automático (GitHub Actions) ou manual?
```

---

*Template: NuvemproApp/nuvempro-app-template*
*Versão do prompt: 1.0.0 | Compatível com template v1.6.0+*
