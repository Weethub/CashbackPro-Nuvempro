import { useState, useEffect } from 'react';
import { GitBranch, CheckCircle, AlertTriangle, RefreshCw, ExternalLink, Loader2 } from 'lucide-react';

/**
 * TemplateVersionCard
 *
 * Exibe a versão do template instalada neste app e verifica se há
 * uma versão mais recente disponível no repositório GitHub oficial.
 *
 * Funciona consultando:
 * 1. /admin-api/health → versão atual + repo
 * 2. GitHub Releases API → versão mais recente disponível
 */
export default function TemplateVersionCard() {
  const [current, setCurrent] = useState(null);
  const [latest, setLatest] = useState(null);
  const [repo, setRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  const adminApiUrl = import.meta.env.VITE_ADMIN_API_URL || '/admin-api';

  const fetchCurrentVersion = async () => {
    // Remove /admin-api do final para chegar na raiz do backend
    const backendBase = adminApiUrl.replace(/\/admin-api\/?$/, '');
    const res = await fetch(`${backendBase}/admin-api/health`);
    const data = await res.json();
    return {
      version: data.templateVersion || null,
      repo: data.templateRepo || null,
    };
  };

  const fetchLatestRelease = async (repoPath) => {
    const res = await fetch(
      `https://api.github.com/repos/${repoPath}/releases/latest`,
      { headers: { Accept: 'application/vnd.github.v3+json' } }
    );
    if (!res.ok) {
      // Fallback: try tags if no releases
      const tagsRes = await fetch(
        `https://api.github.com/repos/${repoPath}/tags`,
        { headers: { Accept: 'application/vnd.github.v3+json' } }
      );
      if (!tagsRes.ok) return null;
      const tags = await tagsRes.json();
      return tags.length > 0 ? tags[0].name.replace(/^v/, '') : null;
    }
    const data = await res.json();
    return data.tag_name ? data.tag_name.replace(/^v/, '') : null;
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { version, repo: repoPath } = await fetchCurrentVersion();
      setCurrent(version);
      setRepo(repoPath);

      if (repoPath) {
        const latestVersion = await fetchLatestRelease(repoPath);
        setLatest(latestVersion);
      }
    } catch (err) {
      setError('Não foi possível verificar a versão do template.');
    } finally {
      setLoading(false);
    }
  };

  const checkUpdate = async () => {
    setChecking(true);
    setError(null);
    try {
      if (repo) {
        const latestVersion = await fetchLatestRelease(repo);
        setLatest(latestVersion);
      }
    } catch {
      setError('Erro ao verificar atualizações.');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Comparação semver simples
  const isOutdated = () => {
    if (!current || !latest) return false;
    const toNum = (v) =>
      v.split('.').map(Number).reduce((acc, n, i) => acc + n * Math.pow(1000, 2 - i), 0);
    return toNum(latest) > toNum(current);
  };

  const outdated = isOutdated();
  const changelogUrl = repo
    ? `https://github.com/${repo}/blob/main/CHANGELOG.md`
    : null;
  const releasesUrl = repo
    ? `https://github.com/${repo}/releases`
    : null;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <GitBranch size={18} className="text-violet-500" />
        Template NuvemPro
      </h3>

      {loading ? (
        <div className="flex items-center gap-3 text-gray-400 text-sm py-2">
          <Loader2 size={16} className="animate-spin" />
          Verificando versão...
        </div>
      ) : error ? (
        <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
      ) : (
        <div className="space-y-4">
          {/* Versão atual */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">Versão instalada</p>
              <p className="text-xs text-gray-400 font-mono mt-0.5">{repo || '—'}</p>
            </div>
            <span className="font-mono text-sm font-semibold text-gray-800 bg-gray-100 px-3 py-1 rounded-full">
              v{current || '—'}
            </span>
          </div>

          {/* Versão mais recente */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">Versão mais recente</p>
              <p className="text-xs text-gray-400 mt-0.5">Via GitHub Releases</p>
            </div>
            {latest ? (
              <span className="font-mono text-sm font-semibold text-gray-800 bg-gray-100 px-3 py-1 rounded-full">
                v{latest}
              </span>
            ) : (
              <span className="text-xs text-gray-400">Não disponível</span>
            )}
          </div>

          {/* Status badge */}
          <div className="flex items-center justify-between">
            <div>
              {outdated ? (
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-500" />
                  <span className="text-sm font-medium text-amber-700">
                    Atualização disponível: v{latest}
                  </span>
                </div>
              ) : latest ? (
                <div className="flex items-center gap-2">
                  <CheckCircle size={16} className="text-emerald-500" />
                  <span className="text-sm font-medium text-emerald-700">
                    Template atualizado
                  </span>
                </div>
              ) : (
                <span className="text-sm text-gray-400">Status desconhecido</span>
              )}
            </div>

            <button
              onClick={checkUpdate}
              disabled={checking}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              title="Verificar atualização"
            >
              <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
              Verificar
            </button>
          </div>

          {/* Links */}
          {(changelogUrl || releasesUrl) && (
            <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
              {changelogUrl && (
                <a
                  href={changelogUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 transition-colors"
                >
                  <ExternalLink size={12} />
                  Ver CHANGELOG
                </a>
              )}
              {releasesUrl && (
                <a
                  href={releasesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <ExternalLink size={12} />
                  Releases no GitHub
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
