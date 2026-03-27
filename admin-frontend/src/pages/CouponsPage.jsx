import { useState, useEffect, useCallback } from 'react';
import adminApi from '../services/adminApi';
import DataTable from '../components/DataTable';
import { Plus, X, Loader2, Tag } from 'lucide-react';

export default function CouponsPage() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);

  const fetchCoupons = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError('');
      const res = await adminApi.get('/coupons', { params: { page, limit: 20 } });
      setRows(res.data.coupons || res.data.data || []);
      setMeta({
        page: res.data.page || res.data.meta?.page || 1,
        totalPages: res.data.totalPages || res.data.meta?.totalPages || 1,
        total: res.data.total || res.data.meta?.total || 0,
      });
    } catch {
      setError('Erro ao carregar cupons.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoupons(1);
  }, [fetchCoupons]);

  const handleSave = async (formData) => {
    try {
      if (editingCoupon) {
        await adminApi.put(`/coupons/${editingCoupon.id || editingCoupon._id}`, formData);
      } else {
        await adminApi.post('/coupons', formData);
      }
      setShowForm(false);
      setEditingCoupon(null);
      await fetchCoupons(1);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao salvar cupom.');
    }
  };

  const handleToggle = async (coupon) => {
    try {
      await adminApi.patch(`/coupons/${coupon.id || coupon._id}`, { isActive: !coupon.isActive });
      await fetchCoupons(meta.page);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao atualizar cupom.');
    }
  };

  const typeLabels = {
    percent_off: 'Percentual',
    amount_off: 'Valor fixo',
    free_period: 'Periodo gratis',
  };

  const columns = [
    {
      key: 'code',
      label: 'Codigo',
      render: (v) => (
        <div className="flex items-center gap-2">
          <Tag size={14} className="text-amber-500" />
          <span className="font-mono font-bold text-gray-900">{v}</span>
        </div>
      ),
    },
    {
      key: 'type',
      label: 'Tipo',
      render: (v) => <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">{typeLabels[v] || v}</span>,
    },
    {
      key: 'value',
      label: 'Valor',
      render: (v, row) => {
        if (row.type === 'percent_off') return `${v}%`;
        if (row.type === 'amount_off') return `R$ ${Number(v).toFixed(2)}`;
        return `${v} dias`;
      },
    },
    { key: 'timesRedeemed', label: 'Usos', render: (v) => v ?? 0 },
    {
      key: 'validUntil',
      label: 'Validade',
      render: (v) => v ? new Date(v).toLocaleDateString('pt-BR') : 'Sem limite',
    },
    {
      key: 'isActive',
      label: 'Status',
      render: (v, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleToggle(row); }}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            v ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {v ? 'Ativo' : 'Inativo'}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cupons</h1>
          <p className="text-gray-500 text-sm mt-1">Gerenciamento de cupons de desconto</p>
        </div>
        <button
          onClick={() => { setEditingCoupon(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus size={18} /> Novo Cupom
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        meta={meta}
        onPageChange={(p) => fetchCoupons(p)}
        loading={loading}
        emptyText="Nenhum cupom cadastrado."
        onRowClick={(row) => { setEditingCoupon(row); setShowForm(true); }}
      />

      {showForm && (
        <CouponForm
          coupon={editingCoupon}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingCoupon(null); }}
        />
      )}
    </div>
  );
}

function CouponForm({ coupon, onSave, onClose }) {
  const [form, setForm] = useState({
    code: coupon?.code || '',
    type: coupon?.type || 'percent_off',
    value: coupon?.value ?? '',
    maxRedemptions: coupon?.maxRedemptions ?? '',
    validUntil: coupon?.validUntil ? coupon.validUntil.split('T')[0] : '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        code: form.code.toUpperCase(),
        type: form.type,
        value: Number(form.value),
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        validUntil: form.validUntil || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">{coupon ? 'Editar Cupom' : 'Novo Cupom'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Codigo</label>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="DESCONTO20"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono uppercase"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="percent_off">Percentual (%)</option>
              <option value="amount_off">Valor Fixo (R$)</option>
              <option value="free_period">Periodo Gratis (dias)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Valor {form.type === 'percent_off' ? '(%)' : form.type === 'amount_off' ? '(R$)' : '(dias)'}
            </label>
            <input
              type="number"
              step={form.type === 'amount_off' ? '0.01' : '1'}
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max. Resgates</label>
            <input
              type="number"
              value={form.maxRedemptions}
              onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
              placeholder="Sem limite"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Validade</label>
            <input
              type="date"
              value={form.validUntil}
              onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

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
