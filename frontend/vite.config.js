import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';

let gitCommit = 'dev';
try {
  gitCommit = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  // git not available (CI sem repo, etc.)
}

export default defineConfig({
  define: {
    __GIT_COMMIT__: JSON.stringify(gitCommit),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
