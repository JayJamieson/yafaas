import { Client } from "./client.js";
import * as ExitListener from "./exitListener.js";
import { loadFunction } from "./functionLoader.js";
import { Runtime } from "./runtime.js";
import { toSerializableError } from "./util.js";

/**
 * Heavily inspired from https://github.com/aws/aws-lambda-nodejs-runtime-interface-client/blob/main/src/index.mjs.
 * - Removed response streaming.
 * - Uses process.beforeExit concept to reinvoke handler function.
 * - Uses most of function loading code in UserFunction.js minus require support.
 * - Uses most of function invoke code in Runtime.js
 *
 * The focus should be on events bus and function manager. This is where the magic happens for proxying HTTP
 * requests to Request-Response function or Fire-and-Forget events from S3 where no response is needed.
 */
if (process.argv.length < 3) {
  console.log("No handler specified");
  console.log("Using default index.handler");
}

const appDir = process.env.FUNCTION_DIR || process.argv[2] || process.cwd(); // defaults /var/task
const handler = process.argv[3] || "index.handler"; // usually index.handler

console.log(`Executing '${handler}' in function directory '${appDir}'`);

async function run(appDir: string, handler: string) {
  if (!process.env.EVENTS_API) {
    throw new Error("EVENTS_API environment variable is required");
  }
  const client = new Client(process.env.EVENTS_API);

  let errorCallbacks = {
    uncaughtException: (error: Error) => {
      console.log("uncaughtException", JSON.stringify(toSerializableError(error)));
      process.exit(128)
      // TODO: implement runtime error endpoint
      // client.postRuntimeError(JSON.stringify(toSerializableError(error)), () => process.exit(128));
    },
    unhandledRejection: (error: Error) => {
      console.log("unhandledRejection", JSON.stringify(toSerializableError(error)));
      process.exit(128)
      // TODO: implement runtime error endpoint
      // client.postRuntimeError(JSON.stringify(toSerializableError(error)), () => process.exit(128));
    },
  };

  process.on("unhandledRejection", (error: Error) => {
    errorCallbacks.unhandledRejection(error);
  });

  process.on("uncaughtException", (error: Error) => {
    errorCallbacks.uncaughtException(error);
  });

  process.on("SIGINT", () => {
    console.log("SIGINT Exiting...");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.log("SIGTERM Exiting...");
    process.exit(0);
  });

  ExitListener.reset();
  process.on("beforeExit", ExitListener.invoke);


  const handlerFunc = await loadFunction(appDir, handler);

  new Runtime(client, handlerFunc, errorCallbacks).scheduleInvoke();
}

// Use when running as main process in docker container
// await run(appDir, handler);
// run(appDir, handler).catch((reason) => {
//    console.log(reason);
//    process.exit(1);
// });

try {
  await run(appDir, handler);
} catch (err) {
  console.error("Fatal error:", err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
}
