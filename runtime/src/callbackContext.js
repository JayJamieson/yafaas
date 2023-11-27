import * as ExitListener from "./exitListener.js";
import { toError } from "./util.js";

/** @typedef {import("./client.js").Client} Client */

/**
 * @param {Client} client
 * @param {string} id
 * @param {Function} scheduleNext
 * @returns {[Function, {callbackWaitsForEmptyEventLoop: boolean, succeed: Function, fail: Function, done: Function}, Function]}
 */
function buildRawCallbackContext(client, id, scheduleNext) {
  /**
   *
   * @param {Error} error
   * @param {Function} callback
   */
  const postError = (error, callback) => {
    const errorBody = toError(error);
    console.error("Error", JSON.stringify(errorBody));
    client.postError(id, errorBody, callback);
  };

  let isInvokeDone = false;

  /**
   *
   * @param {object} result
   * @param {Function} callback
   * @returns
   */
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

  /**
   *
   * @param {Error|null} error
   * @param {object} result
   */
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

  /**
   * @param {Error|null} error
   * @param {object} result
   */
  const done = (error, result) => {
    ExitListener.reset();
    if (error !== undefined && error !== null) {
      postError(error, scheduleNext);
    } else {
      complete(result, scheduleNext);
    }
  };

  /**
   * @param {object} result
   */
  const succeed = (result) => {
    done(null, result);
  };

  /**
   * @param {Error} error
   */
  const fail = (error) => {
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
 * @param {Function} callback
 * @param {{callbackWaitsForEmptyEventLoop: boolean, succeed: Function, fail: Function, done: Function}} callbackContext
 * @param {Function} markDone
 * @returns {[Function, {callbackWaitsForEmptyEventLoop: boolean, succeed: Function, fail: Function, done: Function}, Function]}
 */
function wrapCallbackContext(callback, callbackContext, markDone) {
  let completed = false;

  /**
   * @param {Function} toWrap
   * @returns {Function}
   */
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
 * @param {Function} scheduleInvoke
 * @returns {[Function, {callbackWaitsForEmptyEventLoop: boolean, succeed: Function, fail: Function, done: Function}, Function]}
 */
export function build(client, id, scheduleInvoke) {
  const rawCallbackContext = buildRawCallbackContext(
    client,
    id,
    scheduleInvoke
  );

  return wrapCallbackContext(...rawCallbackContext);
}
