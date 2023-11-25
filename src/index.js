import { Client } from "./client.js";
import * as ExitListener from "./exitListener.js";
import { loadFunction } from "./functionLoader.js";
import { Runtime } from "./runtime.js";
/**
 * Heavily inspired from https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/blob/main/src/index.mjs.
 * - Removed response streaming.
 * - Reuses beforeExit to create basic event loop.
 * - Reuses most of function loading code in UserFunction.js
 * - Reuses most function calling code in Runtime.js
 *
 * The focus should be on events bus and function manager. This is where the magic happens for proxying HTTP
 * requests to Request-Response function or Fire-and-Forget events from S3 where no response is needed.
 */

if (process.argv.length < 3) {
  throw new Error("No handler specified");
}

const appDir =  process.env.FUNCTION_DIR || process.cwd(); // defaults /var/task
const handler = process.argv[2]; // usually index.handler

console.log(`Executing '${handler}' in function directory '${appDir}'`);

async function run(appDir, handler) {
  // setup event service client
  const client = new Client(process.env.EVENTS_API);

  let errorCallbacks = {
    uncaughtException: (error) => {
      console.log("uncaughtException", JSON.stringify(error));
      client.postRuntimeError(JSON.stringify(error), () => process.exit(128));
    },
    unhandledRejection: (error) => {
      console.log("unhandledRejection", JSON.stringify(error));
      client.postRuntimeError(JSON.stringify(error), () => process.exit(128));
    }
  }

  process.on("unhandledRejection", (error) => {
    // TODO: post startup error
    errorCallbacks.unhandledRejection(error);
  });

  process.on("uncaughtException", (error) => {
    // TODO: post startup error
    errorCallbacks.uncaughtException(error);
  });

  ExitListener.reset();
  process.on("beforeExit", ExitListener.invoke);

  const handlerFunc = await loadFunction(appDir, handler);

  new Runtime(client, handlerFunc, errorCallbacks).scheduleInvoke();
}

await run(appDir, handler);
