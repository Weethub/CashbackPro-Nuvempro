import { useState, useEffect } from 'react';
import adminApi from '../services/adminApi';
import { Settings, Save, Loader2, Lock, Eye, EyeOff } from 'lucide-react';

export default function SettingsPage() {
  const [configs, setConfigs] = useState({});
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dirty, setDirty] = useState({});

  // Change password
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPw, setShowPw] = useState({ current: false, new: false, confirm: false });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await adminApi.get('/settings');
      const data = res.data.settings || res.data.configs || res.data || {};

      // Group configs by group field or prefix
      const configMap = {};
      const groupSet = new Set();

      if (Array.isArray(data)) {
        data.forEach((item) => {
          const group = item.group || 'general';
          groupSet.add(group);
          if (!configMap[group]) configMap[group] = [];
          configMap[group].push(item);
        });
      } else {
        Object.entries(data).forEach(([key, val]) => {
          const group = typeof val === 'object' && val.group ? val.group : 'general';
          groupSet.add(group);
          if (!configMap[group]) configMap[group] = [];
          configMap[group].push({
            key,
            label: typeof val === 'object' ? val.label || key : key,
            value: typeof val === 'object' ? val.value : val,
            type: typeof val === 'object' ? val.type || typeof val.value : typeof val,
          });
        });
      }

      setGroups(Array.from(groupSet));
      setConfigs(configMap);
    } catch {
      setError('Erro ao carregar configuracoes.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (group, key, value) => {
    setConfigs((prev) => {
      const updated = { ...prev };
      updated[group] = updated[group].map((item) =>
        item.key === key ? { ...item, value } : item
      );
      return updated;
    });
    setDirty((prev) => ({ ...prev, [`${group}.${key}`]: true }));
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveSuccess(false);
      const payload = {};
      Object.entries(configs).forEach(([group, items]) => {
        items.forEach((item) => {
          payload[item.key] = item.value;
        });
      });
      await adminApi.put('/settings', { settings: payload });
      setDirty({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao salvar configuracoes.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (pwForm.newPassword.length < 8) {
      setPwError('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('As senhas nao coincidem.');
      return;
    }

    try {
      setPwLoading(true);
      await adminApi.post('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwSuccess('Senha alterada com sucesso.');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPwError(err.response?.data?.error || 'Erro ao alterar senha.');
    } finally {
      setPwLoading(false);
    }
  };

  const groupLabels = {
    general: 'Geral',
    email: 'Email',
    stripe: 'Stripe',
    notifications: 'Notificacoes',
    limits: 'Limites',
    features: 'Features',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const hasDirty = Object.keys(dirty).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuracoes</h1>
          <p className="text-gray-500 text-sm mt-1">Configuracoes do sistema</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !hasDirty}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar Alteracoes
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">
          Configuracoes salvas com sucesso.
        </div>
      )}

      {/* Dynamic Config Groups */}
      {groups.map((group) => (
        <div key={group} className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Settings size={18} className="text-slate-500" />
            {groupLabels[group] || group}
          </h3>
          <div className="space-y-4">
            {(configs[group] || []).map((item) => {
              const isBool = item.type === 'boolean' || typeof item.value === 'boolean';
              return (
                <div key={item.key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{item.label || item.key}</p>
                    <p className="text-xs text-gray-400 font-mono">{item.key}</p>
                  </div>
                  {isBool ? (
                    <button
                      onClick={() => handleChange(group, item.key, !item.value)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        item.value ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          item.value ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  ) : (
                    <input
                      type="text"
                      value={item.value ?? ''}
                      onChange={(e) => handleChange(group, item.key, e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Empty state for configs */}
      {groups.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          Nenhuma configuracao encontrada.
        </div>
      )}

      {/* Change Password */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Lock size={18} className="text-indigo-500" />
          Alterar Senha
        </h3>

        {pwError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-4">{pwError}</div>
        )}
        {pwSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-lg text-sm mb-4">{pwSuccess}</div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <PasswordField
            label="Senha Atual"
            value={pwForm.currentPassword}
            onChange={(v) => setPwForm({ ...pwForm, currentPassword: v })}
            show={showPw.current}
            onToggle={() => setShowPw({ ...showPw, current: !showPw.current })}
          />
          <PasswordField
            label="Nova Senha"
            value={pwForm.newPassword}
            onChange={(v) => setPwForm({ ...pwForm, newPassword: v })}
            show={showPw.new}
            onToggle={() => setShowPw({ ...showPw, new: !showPw.new })}
          />
          <PasswordField
            label="Confirmar Nova Senha"
            value={pwForm.confirmPassword}
            onChange={(v) => setPwForm({ ...pwForm, confirmPassword: v })}
            show={showPw.confirm}
            onToggle={() => setShowPw({ ...showPw, confirm: !showPw.confirm })}
          />
          <button
            type="submit"
            disabled={pwLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {pwLoading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            Alterar Senha
          </button>
        </form>
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, show, onToggle }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm pr-10 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
