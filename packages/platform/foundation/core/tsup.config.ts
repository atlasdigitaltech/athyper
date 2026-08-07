import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index:     'src/index.ts',
    testing:   'src/testing.ts',
    'logger/index':    'src/logger/index.ts',
    'telemetry/index': 'src/telemetry/index.ts',
    'context/index':   'src/context/index.ts',
    'errors/index':    'src/errors/index.ts',
  },
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  splitting: false,
  sourcemap: true,
  clean: true,
});
