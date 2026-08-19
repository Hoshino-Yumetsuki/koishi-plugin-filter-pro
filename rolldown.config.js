import { defineConfig } from "rolldown";
import pkg from "./package.json" with { type: "json" };
import { dts } from "rolldown-plugin-dts";

const serverExternal = new RegExp(
  `^(node:|${[
    ...Object.getOwnPropertyNames(pkg.devDependencies ?? {}),
    ...Object.getOwnPropertyNames(pkg.dependencies ?? {}),
    ...Object.getOwnPropertyNames(pkg.peerDependencies ?? {})
  ].join("|")})`
);

export default defineConfig([
  {
    input: "./src/index.ts",
    platform: "node",
    output: [{ file: "lib/index.mjs", format: "es", minify: true }],
    external: serverExternal
  },
  {
    input: "./src/index.ts",
    platform: "node",
    output: [{ file: "lib/index.cjs", format: "cjs", minify: true }],
    external: serverExternal
  },
  {
    input: "./src/index.ts",
    platform: "node",
    output: [{ dir: "lib", format: "es" }],
    plugins: [dts({ emitDtsOnly: true })],
    external: serverExternal
  }
]);
