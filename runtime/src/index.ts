import { exit } from "process";
import { EventClient } from "./client.js";
import { ExitListener } from "./exit-listener.js";
import loadFunction from "./function-loader.js";
import { Runtime } from "./runtime.js";
import toSerializableError from "./util.js";

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
  console.error("No handler and run directory specified");
  console.log("Run as: node /app/dir/here index.handler");
  exit(1);
}

if (!process.env.EVENT_ENDPOINT) {
  console.error("No event endpoint provided in EVENT_ENDPOINT");
  exit(1);
}

const EVENT_ENDPOINT = process.env.EVENT_ENDPOINT;
const appDir = process.argv[2] || "/var/task";
const handler = process.argv[3] || "index.handler";

console.log(`Executing '${handler}' in function directory '${appDir}'`);

async function run(appDir: string, handler: string) {
  if (!EVENT_ENDPOINT) {
    throw new Error("EVENT_ENDPOINT environment variable is required");
  }

  const client = new EventClient.Client(EVENT_ENDPOINT);

  let errorCallbacks: Runtime.ErrorCallbacks = {
    uncaughtException: (error: Error) => {
      console.log(
        "uncaughtException",
        JSON.stringify(toSerializableError(error))
      );
      client.postRuntimeError(JSON.stringify(toSerializableError(error)), () =>
        process.exit(128)
      );
      process.exit(128);
    },
    unhandledRejection: (error: Error) => {
      console.log(
        "unhandledRejection",
        JSON.stringify(toSerializableError(error))
      );
      client.postRuntimeError(JSON.stringify(toSerializableError(error)), () =>
        process.exit(128)
      );
      process.exit(128);
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

  new Runtime.Executor(client, handlerFunc, errorCallbacks).scheduleInvoke();
}

try {
  await run(appDir, handler);
} catch (err) {
  console.error(
    "Fatal error:",
    err instanceof Error ? err.stack || err.message : err
  );
  process.exit(1);
}
