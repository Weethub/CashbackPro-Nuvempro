# STANDARDS.md — Regras Obrigatorias NuvemPro

> Checklist rapido de conformidade. Todo app DEVE seguir estas regras.
> Validar antes de qualquer deploy.

---

## 1. Padrao de Erros

### Formato Unico de Resposta de Erro

```json
{
  "error": "Mensagem legivel para o usuario",
  "code": "ERROR_CODE_SNAKE_CASE",
  "status": 400
}
```

### Classe AppError (backend)

```javascript
// src/lib/errors.js
class AppError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
```

### Uso

```javascript
// Em qualquer rota ou service:
throw new AppError('Plano nao encontrado', 404, 'PLAN_NOT_FOUND');
throw new AppError('Email ja cadastrado', 409, 'EMAIL_ALREADY_EXISTS');
throw new AppError('Permissao insuficiente', 403, 'FORBIDDEN');
```

### Error Handler Global (server.js)

```javascript
app.use((err, req, res, next) => {
  // AppError → responde com status + code
  if (err.status && err.code) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      status: err.status,
    });
  }

  // Prisma P2002 (unique constraint)
  if (err.code === 'P2002') {
    return res.status(409).json({
      error: 'Registro ja existe',
      code: 'DUPLICATE_ENTRY',
      status: 409,
    });
  }

  // Prisma P2025 (not found)
  if (err.code === 'P2025') {
    return res.status(404).json({
      error: 'Registro nao encontrado',
      code: 'NOT_FOUND',
      status: 404,
    });
  }

  // Erro generico
  console.error('[ERROR]', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Erro interno' : err.message,
    code: 'INTERNAL_ERROR',
    status: 500,
  });
});
```

### Codigos Padrao

| Codigo | Status | Quando usar |
|--------|--------|-------------|
| VALIDATION_ERROR | 400 | Input invalido |
| UNAUTHORIZED | 401 | Token ausente ou invalido |
| FORBIDDEN | 403 | Sem permissao (role) |
| NOT_FOUND | 404 | Recurso inexistente |
| DUPLICATE_ENTRY | 409 | Unique constraint violada |
| RATE_LIMIT_EXCEEDED | 429 | Rate limit atingido |
| INTERNAL_ERROR | 500 | Erro nao tratado |
| STRIPE_ERROR | 502 | Falha na API Stripe |
| SERVICE_UNAVAILABLE | 503 | Servico externo fora |

---

## 2. Rate Limiting

### Camadas Obrigatorias

| Camada | Limite | Janela | Aplicar em |
|--------|--------|--------|-----------|
| Global | 60 req | 1 min | Todas as rotas |
| Auth App | 15 req | 15 min | /auth/* |
| Checkout | 5 req | 1 min | /api/billing/checkout |
| Admin Login | 5 req | 15 min | /admin-api/auth/login |
| Admin API | 30 req | 1 min | /admin-api/* (exceto auth) |

### Implementacao

```javascript
// src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 min
  max: 60,
  standardHeaders: true,       // RateLimit-* headers
  legacyHeaders: false,
  message: { error: 'Muitas requisicoes.', code: 'RATE_LIMIT_EXCEEDED', status: 429 },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 min
  max: 15,
  message: { error: 'Muitas tentativas. Aguarde 15 minutos.', code: 'AUTH_RATE_LIMIT', status: 429 },
});

const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de checkout.', code: 'CHECKOUT_RATE_LIMIT', status: 429 },
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de login.', code: 'ADMIN_LOGIN_RATE_LIMIT', status: 429 },
});

module.exports = { globalLimiter, authLimiter, checkoutLimiter, adminLoginLimiter };
```

### Aplicacao no server.js

```javascript
const { globalLimiter, authLimiter } = require('./middleware/rateLimiter');

// Global (ANTES de todas as rotas)
app.use(globalLimiter);

// Auth-specific
app.use('/auth', authLimiter, require('./routes/auth'));

// Checkout-specific (dentro de billing.js)
router.post('/checkout', checkoutLimiter, async (req, res, next) => { ... });

// Admin login (dentro de adminAuth.js)
router.post('/login', adminLoginLimiter, async (req, res, next) => { ... });
```

---

## 3. Padrao de Paginacao

### Contrato de Request

```
GET /admin-api/customers?page=1&limit=20&search=texto&tab=active
```

| Param | Tipo | Default | Max |
|-------|------|---------|-----|
| page | int | 1 | — |
| limit | int | 20 | 100 |
| search | string | — | — |
| tab | string | all | — |

### Contrato de Response

```json
{
  "data": [ { "id": 1, "name": "..." }, ... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Helper (backend)

```javascript
// src/lib/paginate.js
function parsePagination(query, defaults = {}) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || defaults.limit || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function paginatedResponse(data, total, { page, limit }) {
  return {
    data,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
```

### Uso em Rotas

```javascript
const { parsePagination, paginatedResponse } = require('../../lib/paginate');

router.get('/', async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const where = {}; // filtros

  const [data, total] = await Promise.all([
    prisma.model.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.model.count({ where }),
  ]);

  res.json(paginatedResponse(data, total, { page, limit }));
});
```

### Frontend (DataTable)

```javascript
// O componente DataTable recebe meta e onPageChange:
<DataTable
  columns={columns}
  rows={data}
  meta={meta}
  onPageChange={(newPage) => setPage(newPage)}
/>
```

---

## 4. Seguranca

### 4.1 Headers HTTP (helmet)

```javascript
// server.js — ANTES de qualquer rota
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://js.stripe.com"],
      frameAncestors: ["'self'",
        "https://*.nuvemshop.com.br",
        "https://*.tiendanube.com",
        "https://*.mitiendanube.com",
        "https://*.mynuvemshop.com",
      ],
    },
  },
  crossOriginEmbedderPolicy: false,  // necessario para iframe
}));
```

### 4.2 CSP no Frontend (Vercel)

```json
// vercel.json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [{
      "key": "Content-Security-Policy",
      "value": "frame-ancestors 'self' https://*.nuvemshop.com.br https://*.tiendanube.com https://*.mitiendanube.com https://*.mynuvemshop.com"
    }]
  }],
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

### 4.3 Sanitizacao de Input

```javascript
// Nunca confiar em dados do usuario:
// 1. Strings: .trim() antes de salvar
// 2. HTML: DOMPurify no frontend antes de renderizar
// 3. IDs: parseInt() ou validacao de formato
// 4. Email: regex basica antes de salvar
// 5. JSON: try/catch ao parsear

// No frontend (qualquer HTML do usuario):
import DOMPurify from 'dompurify';
const clean = DOMPurify.sanitize(userHtml);
```

### 4.4 Protecoes Obrigatorias

| Protecao | Como | Onde |
|----------|------|------|
| XSS | DOMPurify + helmet CSP | Frontend + Backend |
| CSRF | Token-based (JWT no header) | Automatico com Bearer token |
| SQL Injection | Prisma ORM (parameterized) | Automatico |
| CORS | allowedOrigins whitelist | server.js |
| Rate Limiting | express-rate-limit | 5 camadas |
| Webhook tampering | Stripe signature verify | webhook.js |
| Password hashing | bcryptjs cost=12 | adminAuth |
| Session hijacking | AdminSession + expiresAt | adminAuth middleware |
| Brute force | Rate limiter + account lockout | Login endpoints |
| Token expiry | JWT expiresIn: '8h' (admin), '24h' (app) | Auth routes |

### 4.5 Checklist de Seguranca Pre-Deploy

- [ ] helmet() configurado com CSP
- [ ] CORS com whitelist de origens
- [ ] Rate limiters em todas as camadas
- [ ] Webhook com verificacao de assinatura
- [ ] Senhas com bcrypt cost >= 12
- [ ] JWT com expiracao definida
- [ ] AdminSession validada por request
- [ ] DOMPurify em todo HTML renderizado
- [ ] .env nao commitado no git
- [ ] ADMIN_JWT_SECRET diferente de JWT_SECRET
- [ ] CSP frame-ancestors inclui dominios Nuvemshop
- [ ] Acesso direto (fora do iframe) bloqueado

---

## 5. Testes Minimos

### Smoke Tests Obrigatorios

Todo app DEVE ter pelo menos estes testes passando antes do deploy:

```javascript
// src/__tests__/health.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert');

const BASE = process.env.TEST_URL || 'http://localhost:3001';

describe('Health', () => {
  it('GET /health → 200', async () => {
    const r = await fetch(`${BASE}/health`);
    assert.strictEqual(r.status, 200);
    const b = await r.json();
    assert.strictEqual(b.ok, true);
  });

  it('GET /admin-api/health → 200', async () => {
    const r = await fetch(`${BASE}/admin-api/health`);
    assert.strictEqual(r.status, 200);
  });
});

describe('Auth', () => {
  it('Protected app routes → 401 without token', async () => {
    const routes = ['/api/billing/status', '/api/terms/status', '/api/profile'];
    for (const route of routes) {
      const r = await fetch(`${BASE}${route}`);
      assert.strictEqual(r.status, 401, `${route} should be 401`);
    }
  });

  it('Protected admin routes → 401 without token', async () => {
    const routes = ['/admin-api/plans', '/admin-api/customers', '/admin-api/config'];
    for (const route of routes) {
      const r = await fetch(`${BASE}${route}`);
      assert.strictEqual(r.status, 401, `${route} should be 401`);
    }
  });

  it('Admin login → 400 without body', async () => {
    const r = await fetch(`${BASE}/admin-api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.strictEqual(r.status, 400);
    const b = await r.json();
    assert(b.code, 'Should have error code');
  });
});

describe('Webhook', () => {
  it('POST /webhook → 400 without Stripe signature', async () => {
    const r = await fetch(`${BASE}/webhook`, {
      method: 'POST',
      body: '{}',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.strictEqual(r.status, 400);
  });
});

describe('Error Format', () => {
  it('Errors return { error, code, status } format', async () => {
    const r = await fetch(`${BASE}/admin-api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const b = await r.json();
    assert(typeof b.error === 'string', 'error should be string');
    assert(typeof b.code === 'string', 'code should be string');
  });
});
```

### Como Executar

```bash
# 1. Backend rodando
npm run dev

# 2. Em outro terminal
npm test

# Ou com URL customizada (producao)
TEST_URL=https://backend.railway.app npm test
```

### Cobertura Minima

| Area | Testes | Status |
|------|--------|--------|
| Health check | 2 | Obrigatorio |
| Auth protection (app) | 3 routes | Obrigatorio |
| Auth protection (admin) | 3 routes | Obrigatorio |
| Admin login validation | 1 | Obrigatorio |
| Webhook signature | 1 | Obrigatorio |
| Error format | 1 | Obrigatorio |
| **Total minimo** | **~10** | **Obrigatorio** |

### Adicionar Testes Especificos do App

Apos a base, cada app adiciona testes para suas funcionalidades:

```javascript
// src/__tests__/app-specific.test.js
describe('App: [NomeDoApp]', () => {
  // Testes especificos da logica do app
});
```

---

## Resumo — Validacao Rapida

Antes de fazer deploy, confirme:

```
[ ] Erros seguem formato { error, code, status }
[ ] AppError usado em todas as rotas
[ ] Rate limiters configurados (5 camadas)
[ ] Paginacao usa parsePagination + paginatedResponse
[ ] Respostas paginadas retornam { data, meta }
[ ] helmet() no server.js com CSP
[ ] DOMPurify no frontend
[ ] CORS whitelist configurado
[ ] 10+ smoke tests passando
[ ] .env nao esta no git
```
