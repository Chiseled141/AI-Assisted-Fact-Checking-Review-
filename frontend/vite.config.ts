/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';

export default defineConfig({
  plugins: [react()],
  // Tailwind reads tailwind.config.js beside this file.
  css: { postcss: { plugins: [tailwindcss(), autoprefixer()] } },
  server: {
    proxy: { '/api': 'http://127.0.0.1:8000' },
    // The source list and the judge list are read from backend/config/data, so both sides share one copy.
    fs: { allow: ['..'] },
  },
  test: {
    // Tests intercept fetch and fail on any unexpected request.
    env: { VITE_API_URL: '' },
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
