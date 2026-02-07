import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { resolve } from 'path';

// Stub contract addresses for CI (no .env file in CI)
const ZERO_ADDR = '0x0000000000000000000000000000000000000001';

export default defineConfig({
  plugins: [preact()],
  define: {
    'import.meta.env.VITE_VYRECASINO_ADDRESS': JSON.stringify(
      process.env.VITE_VYRECASINO_ADDRESS || ZERO_ADDR
    ),
    'import.meta.env.VITE_VYREJACKCORE_ADDRESS': JSON.stringify(
      process.env.VITE_VYREJACKCORE_ADDRESS || ZERO_ADDR
    ),
    'import.meta.env.VITE_VYRETREASURY_ADDRESS': JSON.stringify(
      process.env.VITE_VYRETREASURY_ADDRESS || ZERO_ADDR
    ),
    'import.meta.env.VITE_CHIP_TOKEN_ADDRESS': JSON.stringify(
      process.env.VITE_CHIP_TOKEN_ADDRESS || ZERO_ADDR
    ),
    'import.meta.env.VITE_USDC_TOKEN_ADDRESS': JSON.stringify(
      process.env.VITE_USDC_TOKEN_ADDRESS || ZERO_ADDR
    ),
  },
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
