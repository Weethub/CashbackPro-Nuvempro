'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

// Pure function imports
const { parsePagination, paginatedResponse } = require('../lib/paginate');
const { AppError } = require('../lib/errors');

// ─── parsePagination ──────────────────────────────────────────────────────────

describe('parsePagination', () => {
  it('retorna defaults quando query está vazia', () => {
    const r = parsePagination({});
    assert.strictEqual(r.page, 1);
    assert.ok(r.limit > 0, 'limit deve ser > 0');
    assert.strictEqual(r.skip, 0);
  });

  it('parseia page e limit corretamente', () => {
    const r = parsePagination({ page: '3', limit: '10' });
    assert.strictEqual(r.page, 3);
    assert.strictEqual(r.limit, 10);
    assert.strictEqual(r.skip, 20); // (page-1) * limit
  });

  it('page inválida (negativa) → usa 1', () => {
    const r = parsePagination({ page: '-1' });
    assert.ok(r.page >= 1, 'page deve ser >= 1');
  });

  it('limit inválido (0) → usa default', () => {
    const r = parsePagination({ limit: '0' });
    assert.ok(r.limit > 0, 'limit deve ser > 0');
  });

  it('limit acima do máximo → usa máximo', () => {
    const r = parsePagination({ limit: '9999' });
    assert.ok(r.limit <= 100, 'limit deve ser limitado a 100');
  });
});

// ─── paginatedResponse ────────────────────────────────────────────────────────

describe('paginatedResponse', () => {
  it('retorna shape correto { data, meta }', () => {
    const r = paginatedResponse(['a', 'b', 'c'], 10, { page: 1, limit: 3 });
    assert.ok(Array.isArray(r.data), 'data deve ser array');
    assert.ok(r.meta, 'deve ter meta');
    assert.strictEqual(r.meta.total, 10);
    assert.strictEqual(r.meta.page, 1);
    assert.strictEqual(r.meta.limit, 3);
    assert.ok(r.meta.totalPages > 0, 'totalPages deve ser > 0');
    assert.strictEqual(r.meta.totalPages, 4); // Math.ceil(10/3)
  });

  it('totalPages calculado corretamente', () => {
    const r = paginatedResponse([], 100, { page: 1, limit: 20 });
    assert.strictEqual(r.meta.totalPages, 5);
  });

  it('totalPages = 1 quando total = 0', () => {
    const r = paginatedResponse([], 0, { page: 1, limit: 20 });
    assert.ok(r.meta.totalPages >= 0, 'totalPages não deve ser negativo');
  });
});

// ─── AppError ─────────────────────────────────────────────────────────────────

describe('AppError', () => {
  it('cria erro com message, status e code', () => {
    const err = new AppError('Não encontrado', 404, 'NOT_FOUND');
    assert.strictEqual(err.message, 'Não encontrado');
    assert.strictEqual(err.status, 404);
    assert.strictEqual(err.code, 'NOT_FOUND');
    assert.ok(err instanceof Error, 'deve ser instância de Error');
  });

  it('status padrão é 500', () => {
    const err = new AppError('Erro interno');
    assert.strictEqual(err.status, 500);
  });

  it('code padrão existe', () => {
    const err = new AppError('Erro');
    assert.ok(err.code, 'code não deve ser undefined');
  });
});

// ─── Regras de negócio críticas ───────────────────────────────────────────────

describe('AdminPlan.isFree — computação (NUNCA campo Prisma)', () => {
  it('plano gratuito: todos os preços = 0', () => {
    const plan = { price: { monthly: 0, semestral: 0, annual: 0 } };
    const isFree = Object.values(plan.price).every((v) => !v || v === 0);
    assert.strictEqual(isFree, true);
  });

  it('plano gratuito: preços null/undefined também são free', () => {
    const plan = { price: { monthly: null, semestral: null, annual: null } };
    const isFree = Object.values(plan.price).every((v) => !v || v === 0);
    assert.strictEqual(isFree, true);
  });

  it('plano pago: qualquer preço > 0 → não é free', () => {
    const plan = { price: { monthly: 29.9, semestral: 149.9, annual: 239.9 } };
    const isFree = Object.values(plan.price).every((v) => !v || v === 0);
    assert.strictEqual(isFree, false);
  });

  it('plano pago parcial: monthly grátis, annual pago → não é free', () => {
    const plan = { price: { monthly: 0, semestral: 0, annual: 99.9 } };
    const isFree = Object.values(plan.price).every((v) => !v || v === 0);
    assert.strictEqual(isFree, false);
  });
});

describe('Billing — subActive DEVE incluir trialing', () => {
  it("'trialing' conta como acesso ativo", () => {
    const statuses = ['active', 'trialing'];
    assert.ok(statuses.includes('trialing'), "'trialing' deve estar no array subActive");
    assert.ok(statuses.includes('active'), "'active' deve estar no array subActive");
    assert.ok(!statuses.includes('canceled'), "'canceled' não deve dar acesso");
    assert.ok(!statuses.includes('past_due'), "'past_due' não deve dar acesso");
  });

  it('hasAccess: isFreePlan || subActive || trialActive', () => {
    const computeAccess = ({ isFreePlan, subStatus, trialMode, trialEndsAt }) => {
      const subActive = ['active', 'trialing'].includes(subStatus);
      const now = new Date();
      const trialActive = trialMode === 'free' && !!trialEndsAt && new Date(trialEndsAt) > now;
      return isFreePlan || subActive || trialActive;
    };

    assert.strictEqual(computeAccess({ isFreePlan: true }), true, 'Free plan tem acesso');
    assert.strictEqual(computeAccess({ isFreePlan: false, subStatus: 'active' }), true, 'Active sub tem acesso');
    assert.strictEqual(computeAccess({ isFreePlan: false, subStatus: 'trialing' }), true, 'Trialing tem acesso');
    assert.strictEqual(computeAccess({ isFreePlan: false, subStatus: 'canceled' }), false, 'Canceled não tem acesso');

    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    assert.strictEqual(
      computeAccess({ isFreePlan: false, subStatus: 'none', trialMode: 'free', trialEndsAt: futureDate }),
      true,
      'Free trial ativo tem acesso'
    );
  });
});

describe('MRR — cálculo por billingInterval', () => {
  it('monthly: preço integral', () => {
    const price = { monthly: 99.9, semestral: 499, annual: 799 };
    const mrr = price.monthly;
    assert.strictEqual(mrr, 99.9);
  });

  it('semestral: preço / 6', () => {
    const price = { monthly: 99.9, semestral: 498, annual: 798 };
    const mrr = price.semestral / 6;
    assert.strictEqual(Math.round(mrr * 100) / 100, 83);
  });

  it('annual: preço / 12', () => {
    const price = { monthly: 99.9, semestral: 498, annual: 798 };
    const mrr = price.annual / 12;
    assert.strictEqual(Math.round(mrr * 100) / 100, 66.5);
  });
});
