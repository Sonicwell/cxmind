import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
    resolve: {
        alias: { '~': path.resolve(__dirname, 'src') }
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/__tests__/setup.ts'],
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        coverage: {
            provider: 'v8',
            include: ['src/utils/**', 'src/hooks/**'],
            exclude: ['src/mock/**', 'src/**/*.test.*']
        }
    }
})
