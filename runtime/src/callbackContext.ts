import { Client } from "./client.js";
import * as ExitListener from "./exitListener.js";
import { toSerializableError } from "./util.js";

type RawCallbackContext = {
  callback: (error: Error | null, result: unknown) => void,
  callbackContext: CallbackContext,
  markDone: () => void
};

export type CallbackContext = {
  callbackWaitsForEmptyEventLoop: boolean,
  succeed: (result?: unknown) => void,
  fail: (error?: Error | null) => void,
  done: (error?: Error | null, result?: unknown) => void
}

function buildRawCallbackContext(client: Client, id: string, scheduleNext: () => void): RawCallbackContext {

  const postError = (error: Error, callback: () => void) => {
    const errorBody = toSerializableError(error);
    console.error("Error", JSON.stringify(errorBody));
    client.postError(id, errorBody, callback);
  };

  let isInvokeDone = false;

  const complete = (result: unknown, callback: () => void): void => {
    if (isInvokeDone) {
      console.error(
        "Invocation has completed. Cannot call complete again for same invocation"
      );
      return;
    }

    isInvokeDone = true;
    client.postEventResponse(id, result, callback);
  };

  let waitForEmptyEventLoop = true;

  const callback = function (error: Error | null, result: unknown) {
    ExitListener.reset();
    if (error !== undefined && error !== null) {
      postError(error, scheduleNext);
    } else {
      if (!waitForEmptyEventLoop) {
        complete(result, scheduleNext);
      } else {
        ExitListener.set(() => {
          setImmediate(() => {
            complete(result, scheduleNext);
          });
        });
      }
    }
  };

  const done = (error?: Error | null, result?: unknown) => {
    ExitListener.reset();
    if (error !== undefined && error !== null) {
      postError(error, scheduleNext);
    } else {
      complete(result, scheduleNext);
    }
  };

  const succeed = (result?: unknown) => {
    done(null, result);
  };

  const fail = (error?: Error | null) => {
    if (error === undefined || error === null) {
      done(null, { message: "handled" });
    } else {
      done(error, {});
    }
  };

  const callbackContext = {
    get callbackWaitsForEmptyEventLoop() {
      return waitForEmptyEventLoop;
    },
    set callbackWaitsForEmptyEventLoop(value) {
      waitForEmptyEventLoop = value;
    },
    succeed: succeed,
    fail: fail,
    done: done,
  };

  return {
    callback,
    callbackContext,
    markDone: function () {
      isInvokeDone = true;
    },
  };
}

/**
 * Wraps callback context functions with onlyOnce wrapper to ensure idempotency.
 */
function wrapCallbackContext(callback: (error: Error | null, result: unknown) => void, callbackContext: CallbackContext, markDone: () => void) {
  let completed = false;

  const onlyOnce = function <T extends (...args: any[]) => void>(toWrap: T): T {
    return function (...args: any[]) {
      if (!completed) {
        toWrap.apply(null, args);
        completed = true;
      }
    } as T;
  };

  callbackContext.succeed = onlyOnce(callbackContext.succeed);
  callbackContext.fail = onlyOnce(callbackContext.fail);
  callbackContext.done = onlyOnce(callbackContext.done);

  return {callback: onlyOnce(callback), callbackContext, markDone};
}

export function build(client: Client, id: string, scheduleInvoke: () => void) {
  const rawCallbackContext = buildRawCallbackContext(
    client,
    id,
    scheduleInvoke
  );

  return wrapCallbackContext(rawCallbackContext.callback, rawCallbackContext.callbackContext, rawCallbackContext.markDone);
}
