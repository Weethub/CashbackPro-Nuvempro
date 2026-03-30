import { useState, useEffect } from 'react';
import adminApi from '../services/adminApi';
import {
  CreditCard,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader,
  Loader2,
  RefreshCw,
  Plus,
  Pencil,
  X,
  DollarSign,
  Percent,
  FlaskConical,
  Zap,
  Building2,
  ExternalLink,
} from 'lucide-react';

const syncIcons = {
  synced: { icon: CheckCircle, color: 'text-emerald-500', label: 'Sincronizado' },
  mismatch: { icon: AlertTriangle, color: 'text-amber-500', label: 'Divergente' },
  missing: { icon: XCircle, color: 'text-red-500', label: 'Ausente no Stripe' },
  loading: { icon: Loader, color: 'text-blue-500 animate-spin', label: 'Verificando...' },
};

export default function PlansPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stripeStatus, setStripeStatus] = useState({});
  const [syncLoading, setSyncLoading] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [stripeAccount, setStripeAccount] = useState(null);
  const [stripeAccountLoading, setStripeAccountLoading] = useState(true);

  useEffect(() => {
    fetchPlans();
    fetchStripeAccount();
  }, []);

  const fetchStripeAccount = async () => {
    try {
      const res = await adminApi.get('/plans/stripe-account');
      setStripeAccount(res.data);
    } catch {
      setStripeAccount({ configured: false });
    } finally {
      setStripeAccountLoading(false);
    }
  };

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await adminApi.get('/plans');
      setPlans(res.data.plans || res.data || []);
      verifyStripe(res.data.plans || res.data || []);
    } catch (err) {
      setError('Erro ao carregar planos.');
    } finally {
      setLoading(false);
    }
  };

  const verifyStripe = async (plansList) => {
    const status = {};
    for (const plan of plansList) {
      const key = plan.key || plan.id;
      status[key] = 'loading';
      setStripeStatus((s) => ({ ...s, [key]: 'loading' }));
    }
    try {
      const res = await adminApi.get('/plans/verify-stripe');
      const verifications = res.data.verifications || res.data || {};
      for (const [key, val] of Object.entries(verifications)) {
        status[key] = val.status || val;
      }
      setStripeStatus(status);
    } catch {
      for (const plan of plansList) {
        const key = plan.key || plan.id;
        status[key] = 'missing';
      }
      setStripeStatus(status);
    }
  };

  const handleSyncStripe = async (planKey) => {
    try {
      setSyncLoading(planKey);
      await adminApi.post(`/plans/${planKey}/sync-stripe`);
      await fetchPlans();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao sincronizar com Stripe.');
    } finally {
      setSyncLoading('');
    }
  };

  const handleSave = async (formData) => {
    try {
      if (editingPlan) {
        await adminApi.put(`/plans/${editingPlan.key || editingPlan.id}`, formData);
      } else {
        await adminApi.post('/plans', formData);
      }
      setShowForm(false);
      setEditingPlan(null);
      await fetchPlans();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao salvar plano.');
    }
  };

  const openCreate = () => {
    setEditingPlan(null);
    setShowForm(true);
  };

  const openEdit = (plan) => {
    setEditingPlan(plan);
    setShowForm(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planos</h1>
          <p className="text-gray-500 text-sm mt-1">Gerenciamento de planos e precos</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus size={18} /> Novo Plano
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Plan Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const key = plan.key || plan.id;
          const sync = syncIcons[stripeStatus[key]] || syncIcons.loading;
          const SyncIcon = sync.icon;

          return (
            <div key={key} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <CreditCard size={20} className="text-violet-500" />
                    <h3 className="text-lg font-bold text-gray-900">{plan.name || key}</h3>
                  </div>
                  <button onClick={() => openEdit(plan)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                    <Pencil size={16} />
                  </button>
                </div>

                {/* Stripe Sync Status */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 text-sm">
                    <SyncIcon size={16} className={sync.color} />
                    <span className="text-gray-600">{sync.label}</span>
                  </div>
                  {stripeStatus[key] === 'mismatch' && (
                    <p className="text-xs text-amber-600 mt-1 ml-6">
                      Precos alterados. Clique em "Sincronizar Stripe" para atualizar.
                    </p>
                  )}
                  {stripeStatus[key] === 'missing' && (
                    <p className="text-xs text-red-500 mt-1 ml-6">
                      Clique em "Sincronizar Stripe" para criar os precos no Stripe.
                    </p>
                  )}
                </div>

                {/* Prices */}
                <div className="space-y-2 mb-4">
                  {plan.prices?.monthly != null && (
                    <PriceRow
                      label="Mensal"
                      value={plan.prices.monthly}
                      priceId={plan.stripePriceIds?.monthly}
                      stripeStatus={stripeStatus[key]}
                    />
                  )}
                  {plan.prices?.semestral != null && (
                    <PriceRow
                      label="Semestral"
                      value={plan.prices.semestral}
                      priceId={plan.stripePriceIds?.semestral}
                      stripeStatus={stripeStatus[key]}
                    />
                  )}
                  {plan.prices?.annual != null && (
                    <PriceRow
                      label="Anual"
                      value={plan.prices.annual}
                      priceId={plan.stripePriceIds?.annual}
                      stripeStatus={stripeStatus[key]}
                    />
                  )}
                </div>

                {/* Commission & Revenue Share */}
                <div className="space-y-2 mb-4 border-t border-gray-100 pt-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Percent size={14} className="text-green-500" />
                    <span className="text-gray-600">Comissao:</span>
                    <span className="font-medium">{plan.commissionRate ?? 0}%</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <DollarSign size={14} className="text-blue-500" />
                    <span className="text-gray-600">Revenue Share:</span>
                    <span className="font-medium">{plan.revenueShareRate ?? 0}%</span>
                  </div>
                </div>

                <button
                  onClick={() => handleSyncStripe(key)}
                  disabled={syncLoading === key}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {syncLoading === key ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  Sincronizar Stripe
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Stripe Account Info */}
      <StripeAccountBanner account={stripeAccount} loading={stripeAccountLoading} />

      {/* Modal */}
      {showForm && (
        <PlanForm
          plan={editingPlan}
          onSave={handleSave}
          onClose={() => {
            setShowForm(false);
            setEditingPlan(null);
          }}
        />
      )}
    </div>
  );
}

function StripeAccountBanner({ account, loading }) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex items-center gap-3 text-gray-400 text-sm">
        <Loader2 size={16} className="animate-spin" />
        Verificando conta Stripe...
      </div>
    );
  }

  if (!account) return null;

  const isLive = account.mode === 'live';
  const isTest = account.mode === 'test';
  const configured = account.configured;

  return (
    <div className={`rounded-xl border p-4 flex items-center justify-between gap-4 flex-wrap
      ${isLive ? 'bg-emerald-50 border-emerald-200' : isTest ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>

      <div className="flex items-center gap-3">
        {/* Modo badge */}
        {isLive ? (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full">
            <Zap size={11} /> PRODUÇÃO
          </span>
        ) : isTest ? (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500 text-white text-xs font-bold rounded-full">
            <FlaskConical size={11} /> TESTE
          </span>
        ) : (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-400 text-white text-xs font-bold rounded-full">
            <XCircle size={11} /> NÃO CONFIGURADO
          </span>
        )}

        {/* Dados da conta */}
        {configured ? (
          <div className="flex items-center gap-4 flex-wrap">
            {account.accountName && (
              <div className="flex items-center gap-1.5 text-sm">
                <Building2 size={14} className={isLive ? 'text-emerald-700' : 'text-amber-700'} />
                <span className={`font-semibold ${isLive ? 'text-emerald-900' : 'text-amber-900'}`}>
                  {account.accountName}
                </span>
              </div>
            )}
            {account.email && (
              <span className={`text-sm ${isLive ? 'text-emerald-700' : 'text-amber-700'}`}>
                {account.email}
              </span>
            )}
            {account.country && (
              <span className={`text-xs font-mono px-2 py-0.5 rounded ${isLive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {account.country.toUpperCase()}
              </span>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-500">
            {account.error ? `Erro: ${account.error}` : 'Chave Stripe não configurada'}
          </span>
        )}
      </div>

      {/* Link para o dashboard Stripe */}
      {configured && (
        <a
          href={isLive ? 'https://dashboard.stripe.com' : 'https://dashboard.stripe.com/test'}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors
            ${isLive ? 'text-emerald-700 hover:text-emerald-900' : 'text-amber-700 hover:text-amber-900'}`}
        >
          <ExternalLink size={13} />
          Abrir Dashboard Stripe
        </a>
      )}
    </div>
  );
}

function PriceRow({ label, value, priceId, stripeStatus }) {
  const hasId = !!priceId;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-gray-900">
          R$ {Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </span>
        {hasId ? (
          <CheckCircle size={14} className="text-emerald-500" />
        ) : (
          <XCircle size={14} className="text-red-400" />
        )}
      </div>
    </div>
  );
}

function PlanForm({ plan, onSave, onClose }) {
  const [form, setForm] = useState({
    key: plan?.key || '',
    name: plan?.name || '',
    description: plan?.description || '',
    monthlyPrice: plan?.prices?.monthly || '',
    semestralPrice: plan?.prices?.semestral || '',
    annualPrice: plan?.prices?.annual || '',
    commissionRate: plan?.commissionRate ?? '',
    revenueShareRate: plan?.revenueShareRate ?? '',
    features: Array.isArray(plan?.features) ? plan.features.join('\n') : '',
    isActive: plan?.isActive !== false,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        key: form.key,
        name: form.name,
        description: form.description,
        prices: {
          monthly: Number(form.monthlyPrice) || 0,
          semestral: Number(form.semestralPrice) || 0,
          annual: Number(form.annualPrice) || 0,
        },
        commissionRate: Number(form.commissionRate) || 0,
        revenueShareRate: Number(form.revenueShareRate) || 0,
        features: form.features.split('\n').filter(Boolean),
        isActive: form.isActive,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">{plan ? 'Editar Plano' : 'Novo Plano'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Key</label>
              <input
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
                disabled={!!plan}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descricao</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preco Mensal</label>
              <input
                type="number"
                step="0.01"
                value={form.monthlyPrice}
                onChange={(e) => setForm({ ...form, monthlyPrice: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preco Semestral</label>
              <input
                type="number"
                step="0.01"
                value={form.semestralPrice}
                onChange={(e) => setForm({ ...form, semestralPrice: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preco Anual</label>
              <input
                type="number"
                step="0.01"
                value={form.annualPrice}
                onChange={(e) => setForm({ ...form, annualPrice: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Comissao (%)</label>
              <input
                type="number"
                step="0.1"
                value={form.commissionRate}
                onChange={(e) => setForm({ ...form, commissionRate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Revenue Share (%)</label>
              <input
                type="number"
                step="0.1"
                value={form.revenueShareRate}
                onChange={(e) => setForm({ ...form, revenueShareRate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Features (uma por linha)</label>
            <textarea
              value={form.features}
              onChange={(e) => setForm({ ...form, features: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Ativo</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
