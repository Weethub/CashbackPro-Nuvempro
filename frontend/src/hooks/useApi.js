import { useState, useCallback } from 'react';
import api from '../services/api.js';

export function useApi() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async (method, url, body = null) => {
    setLoading(true);
    setError(null);
    try {
      const config = { method, url };
      if (body && (method === 'post' || method === 'put' || method === 'patch')) {
        config.data = body;
      }
      const response = await api(config);
      setData(response.data);
      return response.data;
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Unknown error';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const get = useCallback((url) => execute('get', url), [execute]);
  const post = useCallback((url, body) => execute('post', url, body), [execute]);
  const put = useCallback((url, body) => execute('put', url, body), [execute]);

  return { data, loading, error, execute, get, post, put };
}
