# Changelog

Todas as mudanças notáveis do template NuvemPro são documentadas aqui.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
versionado em [Semantic Versioning](https://semver.org/lang/pt-BR/).

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
