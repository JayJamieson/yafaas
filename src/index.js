if (process.argv.length < 3) {
  throw new Error("No handler specified");
}

const appDir = process.cwd();
const handler = process.argv[2];

console.log(`Executing '${handler}' in function directory '${appDir}'`);

async function run(appDir, handler) {
}

await run(appDir, handler);
