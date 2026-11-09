import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'src/auth.ts',
        'src/policies.ts',
        'src/domain.ts',
        'src/inventory.ts',
        'src/assignments.ts',
        'src/tasks.ts',
        'src/ticket-lifecycle.ts',
        'src/backup-service.ts',
      ],
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: {
        lines: 78,
        statements: 75,
        branches: 63,
        functions: 75,
        'src/auth.ts': { lines: 80, branches: 70 },
        'src/policies.ts': { lines: 78, branches: 70 },
        'src/inventory.ts': { lines: 85, branches: 70 },
        'src/assignments.ts': { lines: 80, branches: 80 },
        'src/ticket-lifecycle.ts': { lines: 70, branches: 80 },
      },
    },
  },
});
