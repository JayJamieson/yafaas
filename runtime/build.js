import { build } from "esbuild";

const shared = {
  bundle: true,
  entryPoints: ["src/index.ts"],
  logLevel: "info",
  minify: false,
  platform: "node",
  format: "esm",
  charset: "utf8",
    //polly fill to support cjs packages https://github.com/evanw/esbuild/issues/946
    banner: {
      js: `import { createRequire } from 'module';const require = (await import('node:module')).createRequire(import.meta.url);const __filename = (await import('node:url')).fileURLToPath(import.meta.url);const __dirname = (await import('node:path')).dirname(__filename);`,
    },
    outfile: `./dist/index.mjs`,
};

build(shared);
