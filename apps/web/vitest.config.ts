import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { resolve } from 'path';

// Stub ALL contract addresses for CI (no .env file in CI).
// Uses a single stub so new addresses don't require config changes.
const STUB = '0x0000000000000000000000000000000000000001';
const addressKeys = [
  'VITE_VYRECASINO_ADDRESS',
  'VITE_VYREJACKCORE_ADDRESS',
  'VITE_VYRETREASURY_ADDRESS',
  'VITE_CHIP_TOKEN_ADDRESS',
  'VITE_USDC_TOKEN_ADDRESS',
  'VITE_CHIP_FAUCET_ADDRESS',
];
const addressStubs = Object.fromEntries(
  addressKeys.map((k) => [`import.meta.env.${k}`, JSON.stringify(process.env[k] || STUB)])
);

export default defineConfig({
  plugins: [preact()],
  define: addressStubs,
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/__tests__/**', 'src/**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
