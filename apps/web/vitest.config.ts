import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'node', fileParallelism: false, include: ['tests/**/*.test.{ts,tsx}'], setupFiles: ['./tests/setup-dom.ts'] },
});
