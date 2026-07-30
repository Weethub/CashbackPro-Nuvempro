import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import fs from 'fs';

let gitCommit = 'dev';
try {
  gitCommit = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  // Fallbacks para ambientes sem git (Vercel CLI deploy, CI, etc.)
  gitCommit =
    (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) ||
    process.env.VITE_GIT_COMMIT ||
    'dev';
}

export default defineConfig(({ mode }) => {
  // loadEnv (sem prefixo) lê o .env inteiro, não só as chaves VITE_* — precisamos
  // de SSL_CERT_FILE/SSL_KEY_FILE aqui, que são compartilhadas com o backend.
  const env = loadEnv(mode, process.cwd(), '');

  // Em dev, se apontarem para certificados locais válidos (ex.: gerados com
  // mkcert), serve em HTTPS — necessário pro app carregar dentro do iframe HTTPS
  // do admin da Nuvemshop (mixed content bloqueia http dentro de https). O
  // backend precisa estar no mesmo esquema para o proxy funcionar; `secure: false`
  // evita que o cliente HTTPS do Vite exija a CA do mkcert no keystore do Node.
  const certFile = env.SSL_CERT_FILE;
  const keyFile = env.SSL_KEY_FILE;
  const hasLocalCerts = certFile && keyFile && fs.existsSync(certFile) && fs.existsSync(keyFile);
  const backendProtocol = hasLocalCerts ? 'https' : 'http';

  return {
    define: {
      __GIT_COMMIT__: JSON.stringify(gitCommit),
      // @tiendanube/nexo referencia o `global` do Node — inexistente no navegador.
      // Sem isso, o import falha silenciosamente antes do React renderizar (tela branca).
      global: 'globalThis',
    },
    plugins: [react()],
    server: {
      port: 5173,
      https: hasLocalCerts
        ? { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) }
        : undefined,
      proxy: {
        '/api': {
          target: `${backendProtocol}://localhost:3001`,
          changeOrigin: true,
          secure: false,
        },
        '/auth': {
          target: `${backendProtocol}://localhost:3001`,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
