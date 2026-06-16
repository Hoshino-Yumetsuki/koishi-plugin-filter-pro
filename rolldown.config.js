import { defineConfig } from 'rolldown';
import pkg from './package.json' with { type: 'json' };
import { dts } from 'rolldown-plugin-dts';
import vue from '@vitejs/plugin-vue';
import fs from 'node:fs';
import path from 'node:path';

function renameCssPlugin(from, to) {
  return {
    name: 'rename-css',
    writeBundle(options) {
      const dir = options.dir || path.dirname(options.file);
      const fromPath = path.join(dir, from);
      const toPath = path.join(dir, to);
      if (fs.existsSync(fromPath)) {
        fs.renameSync(fromPath, toPath);
      }
    }
  };
}

const serverExternal = new RegExp(
  `^(node:|${[
    ...Object.getOwnPropertyNames(pkg.devDependencies ?? {}),
    ...Object.getOwnPropertyNames(pkg.dependencies ?? {}),
    ...Object.getOwnPropertyNames(pkg.peerDependencies ?? {})
  ].join('|')})`
);

const clientExternal = /^(@koishijs\/|vue$|@vueuse\/|schemastery)/;

const serverConfigs = [
  {
    input: './src/index.ts',
    platform: 'node',
    output: [{ file: 'lib/index.mjs', format: 'es', minify: true }],
    external: serverExternal
  },
  {
    input: './src/index.ts',
    platform: 'node',
    output: [{ file: 'lib/index.cjs', format: 'cjs', minify: true }],
    external: serverExternal
  },
  {
    input: './src/index.ts',
    platform: 'node',
    output: [{ dir: 'lib', format: 'es' }],
    plugins: [dts({ emitDtsOnly: true })],
    external: serverExternal
  }
];

const clientConfigs = [
  {
    input: './client/index.ts',
    platform: 'browser',
    output: [
      {
        dir: 'dist',
        entryFileNames: 'index.js',
        assetFileNames: 'style.css',
        format: 'es',
        minify: true
      }
    ],
    plugins: [vue(), renameCssPlugin('index.css', 'style.css')],
    external: clientExternal
  }
];

export default defineConfig([...serverConfigs, ...clientConfigs]);
