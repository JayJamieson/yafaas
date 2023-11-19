if (process.argv.length < 3) {
  throw new Error("No handler specified");
}

const appDir = process.cwd();
const handler = process.argv[2];

console.log(`Executing '${handler}' in function directory '${appDir}'`);

async function run(appDir, handler) {
  // setup service client

  // setup error callback handlers

  // setup termination handlers

  // setup uncaughtException
  // setup unhandledRejection

  // setup before exit handler

  // load user function

  // run event reader loop
}

await run(appDir, handler);
