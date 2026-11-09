import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'src/modules/identity/auth.ts',
        'src/modules/identity/policies.ts',
        'src/modules/identity/service.ts',
        'src/modules/customers/service.ts',
        'src/modules/tickets/service.ts',
        'src/domain-schemas.ts',
        'src/modules/inventory/routes.ts',
        'src/modules/tickets/assignments.ts',
        'src/modules/tasks/routes.ts',
        'src/modules/tickets/lifecycle.ts',
        'src/backup-service.ts',
      ],
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: {
        lines: 78,
        statements: 75,
        branches: 63,
        functions: 75,
        'src/modules/identity/auth.ts': { lines: 80, branches: 70 },
        'src/modules/identity/policies.ts': { lines: 78, branches: 70 },
        'src/modules/inventory/routes.ts': { lines: 85, branches: 70 },
        'src/modules/tickets/assignments.ts': { lines: 80, branches: 80 },
        'src/modules/tickets/lifecycle.ts': { lines: 70, branches: 80 },
      },
    },
  },
});
