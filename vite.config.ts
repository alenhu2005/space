import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/space/' : '/',
  server: { host: '127.0.0.1', port: 4173 },
  preview: { host: '127.0.0.1', port: 4173 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        statements: 80,
        branches: 80
      },
      include: ['src/core/**/*.ts', 'src/services/**/*.ts']
    }
  }
}))
