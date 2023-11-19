import {build} from "esbuild";

const shared = {
  bundle: true,
  entryPoints: ['index.js'],
  logLevel: 'info',
  minify: false,
  platform: 'node',
  format: 'esm',
  charset: 'utf8',
};

build({
  ...shared,
  outfile: `../dist/index.mjs`,
});
