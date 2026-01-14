import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import mkcert from 'vite-plugin-mkcert';
import { visualizer } from 'rollup-plugin-visualizer';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    preact(),
    mkcert(),
    visualizer({
      open: false,
      gzipSize: true,
      filename: 'dist/stats.html',
    }),
  ],

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      // React compat for wagmi and react-query
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },

  server: {
    port: 5173,
  },

  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          viem: ['viem'],
          'rise-wallet': ['rise-wallet'],
        },
      },
    },
  },

  optimizeDeps: {
    include: ['preact', 'viem', 'rise-wallet', 'ox', 'shreds'],
  },

  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ['import'],
      },
    },
  },
});
