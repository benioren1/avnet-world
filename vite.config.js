import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The game is Hebrew with some Latin (numbers, names, code words). @fontsource/rubik also ships
// Arabic, Cyrillic and Latin-Extended faces, each as woff2 AND woff. Keep only Hebrew + Latin, woff2 only
// (every browser the office uses reads woff2). Still bundled locally: nothing comes from the internet.
const KEEP_FONT_SUBSETS = new Set(['hebrew', 'latin']);
function rubikSubsets() {
  return {
    name: 'rubik-subsets',
    enforce: 'pre',
    transform(code, id) {
      if (!/@fontsource[\\/]rubik[\\/]\d+\.css$/.test(id)) return null;
      const blocks = code.split(/(?=\/\* rubik-)/);
      const kept = blocks.filter((b) => {
        const m = b.match(/^\/\* rubik-([a-z-]+)-\d+-normal \*\//);
        return m && KEEP_FONT_SUBSETS.has(m[1]);
      });
      return { code: kept.join('\n').replace(/,\s*url\([^)]+\.woff\) format\('woff'\)/g, ''), map: null };
    },
  };
}

// Write .br and .gz next to every text asset at build time, so the server sends small files without
// compressing on each request (and without a compression dependency). See the static block in server/index.js.
function precompress() {
  let outDir;
  return {
    name: 'precompress',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    writeBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (!/\.(js|css|html|svg|json)$/.test(fileName)) continue;
        const file = path.join(outDir, fileName);
        const raw = fs.readFileSync(file);
        if (raw.length < 1024) continue;
        fs.writeFileSync(`${file}.gz`, zlib.gzipSync(raw, { level: 9 }));
        fs.writeFileSync(`${file}.br`, zlib.brotliCompressSync(raw, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
          },
        }));
      }
    },
  };
}

// Big libraries get their own files: they change rarely, so browsers keep them cached across game updates,
// and a screen only downloads the ones it uses (the city map library is not needed by the admin's tables, etc.).
function vendorChunk(id) {
  // CSS stays with whoever imports it (main.jsx), so the order of the style rules does not change.
  if (!id.includes('node_modules') || id.endsWith('.css')) return undefined;
  if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
  if (/[\\/]node_modules[\\/](@xyflow|d3-[a-z]+|zustand|classcat)[\\/]/.test(id)) return 'flow';
  if (/[\\/]node_modules[\\/]@dagrejs[\\/]/.test(id)) return 'dagre';
  return undefined;
}

export default defineConfig({
  plugins: [rubikSubsets(), react(), precompress()],
  build: {
    rollupOptions: {
      output: { manualChunks: vendorChunk },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
