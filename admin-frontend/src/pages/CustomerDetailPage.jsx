import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import adminApi from '../services/adminApi';
import { ArrowLeft, Store, CreditCard, Calendar, Mail, Globe, User, Clock, Loader2 } from 'lucide-react';

const statusColors = {
  active: 'bg-emerald-100 text-emerald-700',
  trialing: 'bg-amber-100 text-amber-700',
  trial: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
  canceled: 'bg-gray-100 text-gray-600',
  past_due: 'bg-red-100 text-red-700',
  no_plan: 'bg-slate-100 text-slate-600',
};

const statusLabel = {
  active: 'Ativo',
  trialing: 'Trial',
  trial: 'Trial',
  expired: 'Expirado',
  canceled: 'Cancelado',
  past_due: 'Inadimplente',
  no_plan: 'Sem Plano',
};

function computeStatus(customer) {
  const sub = customer?.subscription;
  if (sub) {
    if (sub.status === 'trialing') return 'trial';
    if (sub.status === 'active') return 'active';
    if (sub.status === 'past_due') return 'past_due';
    if (sub.status === 'canceled') return 'canceled';
    return sub.status;
  }
  const now = new Date();
  if (customer?.trialEndsAt && new Date(customer.trialEndsAt) > now) return 'trial';
  if (customer?.trialEndsAt && new Date(customer.trialEndsAt) <= now) return 'expired';
  return 'no_plan';
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    fetchCustomer();
  }, [id]);

  const fetchCustomer = async () => {
    try {
      setLoading(true);
      const res = await adminApi.get(`/customers/${id}`);
      setCustomer(res.data.store || res.data.customer || res.data);
    } catch (err) {
      setError('Erro ao carregar detalhes do cliente.');
    } finally {
      setLoading(false);
    }
  };

  const handleExtendTrial = async () => {
    if (!confirm('Estender trial por mais 7 dias?')) return;
    try {
      setActionLoading('extend');
      await adminApi.post(`/customers/${id}/extend-trial`, { days: 7 });
      await fetchCustomer();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao estender trial.');
    } finally {
      setActionLoading('');
    }
  };

  const handleImpersonate = async () => {
    if (!confirm('Acessar como proprietario desta loja?')) return;
    try {
      setActionLoading('impersonate');
      const res = await adminApi.post(`/customers/${id}/impersonate`);
      const url = res.data.url || res.data.redirectUrl;
      if (url) {
        window.open(url, '_blank');
      } else {
        alert('URL de impersonacao nao disponivel.');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao impersonar.');
    } finally {
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/customers')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <ArrowLeft size={18} /> Voltar
        </button>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      </div>
    );
  }

  if (!customer) return null;

  const sub = customer.subscription || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/customers')}
            className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name || customer.storeName || 'Loja'}</h1>
            <p className="text-gray-500 text-sm mt-0.5">{customer.email}</p>
          </div>
        </div>
        {(() => {
          const st = computeStatus(customer);
          return (
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusColors[st] || 'bg-gray-100 text-gray-600'}`}>
              {statusLabel[st] || st}
            </span>
          );
        })()}
      </div>

      {/* Store Info */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Informacoes da Loja</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow icon={Store} label="Nome" value={customer.name || customer.storeName} />
          <InfoRow icon={Mail} label="Email" value={customer.email} />
          <InfoRow icon={Globe} label="Dominio" value={customer.domain || customer.storeUrl} />
          <InfoRow icon={User} label="Nuvemshop ID" value={customer.nuvemshopId || customer.storeId} />
          <InfoRow icon={Calendar} label="Cadastro" value={customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('pt-BR') : '—'} />
          <InfoRow icon={Clock} label="Ultimo acesso" value={customer.lastLogin ? new Date(customer.lastLogin).toLocaleString('pt-BR') : '—'} />
        </div>
      </div>

      {/* Subscription Info */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Assinatura</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow icon={CreditCard} label="Plano" value={sub.planKey || customer.planKey || '—'} />
          <InfoRow icon={Calendar} label="Intervalo" value={sub.billingInterval || '—'} />
          <InfoRow icon={Clock} label="Inicio" value={sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toLocaleDateString('pt-BR') : '—'} />
          <InfoRow icon={Clock} label="Fim do periodo" value={sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR') : '—'} />
          <InfoRow icon={CreditCard} label="Stripe Sub ID" value={sub.stripeSubscriptionId || '—'} />
          <InfoRow icon={Calendar} label="Trial ate" value={sub.trialEnd ? new Date(sub.trialEnd).toLocaleDateString('pt-BR') : '—'} />
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Acoes</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExtendTrial}
            disabled={!!actionLoading}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors text-sm font-medium flex items-center gap-2"
          >
            {actionLoading === 'extend' && <Loader2 size={16} className="animate-spin" />}
            Estender Trial (+7 dias)
          </button>
          <button
            onClick={handleImpersonate}
            disabled={!!actionLoading}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors text-sm font-medium flex items-center gap-2"
          >
            {actionLoading === 'impersonate' && <Loader2 size={16} className="animate-spin" />}
            Acessar como Proprietario
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon size={16} className="text-gray-400 flex-shrink-0" />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value || '—'}</p>
      </div>
    </div>
  );
}
