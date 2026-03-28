import { useState, useEffect } from 'react';

let _cache = null; // singleton — busca apenas uma vez por sessão

/**
 * Busca a versão do template no /admin-api/health e compara com
 * a última versão disponível no GitHub Releases.
 *
 * Resultado é cacheado em memória para evitar múltiplos fetches.
 */
export function useTemplateVersion() {
  const [state, setState] = useState(_cache || { current: null, latest: null, repo: null, loading: true, outdated: false });

  useEffect(() => {
    if (_cache) return;

    const adminApiUrl = import.meta.env.VITE_ADMIN_API_URL || '/admin-api';
    const backendBase = adminApiUrl.replace(/\/admin-api\/?$/, '');

    async function load() {
      try {
        const healthRes = await fetch(`${backendBase}/admin-api/health`);
        const health = await healthRes.json();
        const current = health.templateVersion || null;
        const repo = health.templateRepo || null;

        let latest = null;
        if (repo) {
          try {
            const ghRes = await fetch(
              `https://api.github.com/repos/${repo}/releases/latest`,
              { headers: { Accept: 'application/vnd.github.v3+json' } }
            );
            if (ghRes.ok) {
              const gh = await ghRes.json();
              latest = gh.tag_name ? gh.tag_name.replace(/^v/, '') : null;
            }
          } catch {
            // GitHub offline ou rate limit — ignora silenciosamente
          }
        }

        const outdated = current && latest ? semverGt(latest, current) : false;
        _cache = { current, latest, repo, loading: false, outdated };
        setState(_cache);
      } catch {
        const result = { current: null, latest: null, repo: null, loading: false, outdated: false };
        _cache = result;
        setState(result);
      }
    }

    load();
  }, []);

  return state;
}

function semverGt(a, b) {
  const toNum = (v) =>
    String(v).split('.').map(Number).reduce((acc, n, i) => acc + n * Math.pow(1000, 2 - i), 0);
  return toNum(a) > toNum(b);
}
