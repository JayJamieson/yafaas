import * as ExitListener from "./exitListener.js";
import { toError } from "./util.js";

/** @typedef {import("./client").Client} Client */


/**
 *
 * @param {Client} client
 * @param {string} id
 * @param {function} scheduleNext
 */
function buildRawCallbackContext(client, id, scheduleNext) {
  const postError = (error, callback) => {
    const errorBody = toError(error);
    console.error("Error", JSON.stringify(errorBody));
    client.postError(id, errorBody, callback);
  };

  let isInvokeDone = false;
  const complete = (result, callback) => {
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

  const callback = function (error, result) {
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

  const done = (error, result) => {
    ExitListener.reset();
    if (error !== undefined && error !== null) {
      postError(error, scheduleNext);
    } else {
      complete(result, scheduleNext);
    }
  };

  const succeed = (result) => {
    done(null, result);
  };

  const fail = (err) => {
    if (err === undefined || err === null) {
      done("handled");
    } else {
      done(err, null);
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

  return [
    callback,
    callbackContext,
    function () {
      isInvokeDone = true;
    },
  ];
}

/**
 * Wraps callback context such that only first call succeeds.
 * @param {function} callback
 * @param {object} callbackContext
 * @param {function} markDone
 */
function wrapCallbackContext(callback, callbackContext, markDone) {
  let completed = false;

  const onlyOnce = function (toWrap) {
    return function () {
      if (!completed) {
        toWrap.apply(null, arguments);
        completed = true;
      }
    };
  };

  callbackContext.succeed = onlyOnce(callbackContext.succeed);
  callbackContext.fail = onlyOnce(callbackContext.fail);
  callbackContext.done = onlyOnce(callbackContext.done);

  return [onlyOnce(callback), callbackContext, markDone];
}

/**
 * Build callback context object to pass to function and schedule next
 * run.
 *
 * @param {Client} client
 * @param {string} id
 * @param {function} scheduleInvoke
 */
export function build(client, id, scheduleInvoke) {
  const rawCallbackContext = buildRawCallbackContext(
    client,
    id,
    scheduleInvoke
  );

  return wrapCallbackContext(...rawCallbackContext);
}
