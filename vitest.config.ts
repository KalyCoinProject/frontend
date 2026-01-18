import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      // Focus on core math/calculation utilities - the critical business logic
      // Async contract-calling functions are tested in integration tests
      include: [
        'src/utils/price.ts',
        'src/utils/priceImpact.ts',
        'src/utils/staking/mathHelpers.ts',
        'src/utils/tokens.ts',
      ],
      exclude: [
        '**/__tests__/**',
      ],
      thresholds: {
        // Thresholds for testable pure functions
        // priceImpact.ts has async contract calls that lower overall coverage
        statements: 75,
        branches: 85,
        functions: 80,
        lines: 75,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})

