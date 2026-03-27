import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import adminApi from '../services/adminApi';
import DataTable from '../components/DataTable';
import { Search, Store } from 'lucide-react';

const TABS = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Ativos' },
  { key: 'trial', label: 'Trial' },
  { key: 'expired', label: 'Expirados' },
  { key: 'no_plan', label: 'Sem Plano' },
];

const statusColors = {
  active: 'bg-emerald-100 text-emerald-700',
  trial: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
  canceled: 'bg-gray-100 text-gray-600',
  no_plan: 'bg-slate-100 text-slate-600',
};

const planColors = {
  basic: 'bg-blue-100 text-blue-700',
  professional: 'bg-violet-100 text-violet-700',
  premium: 'bg-amber-100 text-amber-700',
  enterprise: 'bg-rose-100 text-rose-700',
};

export default function CustomersPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchCustomers = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError('');
      const params = { page, limit: 20 };
      if (tab !== 'all') params.status = tab;
      if (search.trim()) params.search = search.trim();
      const res = await adminApi.get('/customers', { params });
      setRows(res.data.customers || res.data.data || []);
      setMeta({
        page: res.data.page || res.data.meta?.page || 1,
        totalPages: res.data.totalPages || res.data.meta?.totalPages || 1,
        total: res.data.total || res.data.meta?.total || 0,
      });
    } catch (err) {
      setError('Erro ao carregar clientes.');
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    fetchCustomers(1);
  }, [fetchCustomers]);

  const columns = [
    {
      key: 'name',
      label: 'Loja',
      render: (val, row) => (
        <div className="flex items-center gap-2">
          <Store size={16} className="text-gray-400" />
          <span className="font-medium text-gray-900">{val || row.storeName || '—'}</span>
        </div>
      ),
    },
    { key: 'email', label: 'Email' },
    {
      key: 'planKey',
      label: 'Plano',
      render: (val) =>
        val ? (
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${planColors[val] || 'bg-gray-100 text-gray-600'}`}>
            {val}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (val) => (
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[val] || 'bg-gray-100 text-gray-600'}`}>
          {val || 'unknown'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Cadastro',
      render: (val) => val ? new Date(val).toLocaleDateString('pt-BR') : '—',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lojas</h1>
        <p className="text-gray-500 text-sm mt-1">Gerenciamento de lojas e clientes</p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === t.key
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        meta={meta}
        onPageChange={(p) => fetchCustomers(p)}
        loading={loading}
        emptyText="Nenhuma loja encontrada."
        onRowClick={(row) => navigate(`/customers/${row.id || row._id}`)}
      />
    </div>
  );
}
