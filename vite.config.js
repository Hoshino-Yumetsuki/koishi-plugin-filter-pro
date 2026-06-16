import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: './client/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [/^@koishijs\//, /^vue$/, /^@vueuse\//, /^schemastery/],
      output: {
        assetFileNames: 'style.[ext]',
      },
    },
    minify: true,
  },
});
