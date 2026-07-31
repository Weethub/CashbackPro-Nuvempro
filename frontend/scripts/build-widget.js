/**
 * Builda o widget standalone (frontend/widget-src/index.js) num único IIFE
 * autocontido (public/widget.js). Usa a API JS do esbuild em vez de shell out
 * pra evitar diferenças de sintaxe entre cmd.exe (Windows) e bash (Linux do
 * Vercel) na hora de resolver a variável de ambiente.
 */
import esbuild from 'esbuild';

const apiBaseUrl = process.env.WIDGET_API_BASE_URL || 'https://localhost:3001';

esbuild.buildSync({
  entryPoints: ['widget-src/index.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  outfile: 'public/widget.js',
  define: {
    API_BASE_URL: JSON.stringify(apiBaseUrl),
  },
});

console.log(`widget.js gerado (API_BASE_URL=${apiBaseUrl})`);
