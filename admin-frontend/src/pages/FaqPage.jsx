import { useState, useEffect } from 'react';
import adminApi from '../services/adminApi';
import { Plus, X, Loader2, HelpCircle, Pencil, ChevronDown, ChevronUp, Video, Eye, EyeOff } from 'lucide-react';

const CATEGORIES = [
  { key: 'all', label: 'Todos' },
  { key: 'geral', label: 'Geral' },
  { key: 'billing', label: 'Cobranca' },
  { key: 'config', label: 'Configuracao' },
];

const categoryColors = {
  geral: 'bg-blue-100 text-blue-700',
  billing: 'bg-green-100 text-green-700',
  config: 'bg-purple-100 text-purple-700',
};

export default function FaqPage() {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetchFaqs();
  }, [category]);

  const fetchFaqs = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (category !== 'all') params.category = category;
      const res = await adminApi.get('/faq', { params });
      setFaqs(res.data.faqs || res.data || []);
    } catch {
      setError('Erro ao carregar FAQ.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (formData) => {
    try {
      if (editingFaq) {
        await adminApi.put(`/faq/${editingFaq.id || editingFaq._id}`, formData);
      } else {
        await adminApi.post('/faq', formData);
      }
      setShowForm(false);
      setEditingFaq(null);
      await fetchFaqs();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao salvar FAQ.');
    }
  };

  const handleDelete = async (faq) => {
    if (!confirm('Remover esta pergunta?')) return;
    try {
      await adminApi.delete(`/faq/${faq.id || faq._id}`);
      await fetchFaqs();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao remover.');
    }
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
          <h1 className="text-2xl font-bold text-gray-900">FAQ</h1>
          <p className="text-gray-500 text-sm mt-1">Perguntas frequentes</p>
        </div>
        <button
          onClick={() => { setEditingFaq(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus size={18} /> Nova Pergunta
        </button>
      </div>

      {/* Category Filters */}
      <div className="flex gap-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              category === cat.key
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* FAQ Cards */}
      <div className="space-y-3">
        {faqs.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            Nenhuma pergunta encontrada.
          </div>
        ) : (
          faqs.map((faq) => {
            const id = faq.id || faq._id;
            const isExpanded = expandedId === id;
            return (
              <div key={id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(isExpanded ? null : id)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    <HelpCircle size={18} className="text-pink-500 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{faq.question}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${categoryColors[faq.category] || 'bg-gray-100 text-gray-600'}`}>
                          {faq.category}
                        </span>
                        {!faq.isPublished && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
                            <EyeOff size={10} /> Rascunho
                          </span>
                        )}
                        {faq.videoUrl && <Video size={14} className="text-blue-400" />}
                      </div>
                      <span className="text-xs text-gray-400">Ordem: {faq.sortOrder ?? 0}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingFaq(faq); setShowForm(true); }}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                    >
                      <Pencil size={14} />
                    </button>
                    {isExpanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                  </div>
                </div>
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100">
                    <p className="text-sm text-gray-600 mt-3 whitespace-pre-wrap">{faq.answer}</p>
                    {faq.videoUrl && (
                      <a href={faq.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline mt-2">
                        <Video size={14} /> Ver video
                      </a>
                    )}
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={() => handleDelete(faq)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {showForm && (
        <FaqForm
          faq={editingFaq}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingFaq(null); }}
        />
      )}
    </div>
  );
}

function FaqForm({ faq, onSave, onClose }) {
  const [form, setForm] = useState({
    category: faq?.category || 'geral',
    question: faq?.question || '',
    answer: faq?.answer || '',
    videoUrl: faq?.videoUrl || '',
    isPublished: faq?.isPublished !== false,
    sortOrder: faq?.sortOrder ?? 0,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ ...form, sortOrder: Number(form.sortOrder) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">{faq ? 'Editar Pergunta' : 'Nova Pergunta'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="geral">Geral</option>
                <option value="billing">Cobranca</option>
                <option value="config">Configuracao</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ordem</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pergunta</label>
            <input
              value={form.question}
              onChange={(e) => setForm({ ...form, question: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resposta</label>
            <textarea
              value={form.answer}
              onChange={(e) => setForm({ ...form, answer: e.target.value })}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL do Video (opcional)</label>
            <input
              value={form.videoUrl}
              onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
              placeholder="https://youtube.com/..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isPublished}
              onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Publicado</span>
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
