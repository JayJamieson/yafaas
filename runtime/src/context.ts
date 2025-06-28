import {EventClient} from "./client.js";
import { ExitListener } from "./exit-listener.js";
import toSerializableError from "./util.js";

export namespace Context {
  type CallbackContext = {
    callback: (error: Error | null, result: unknown) => void;
    ctx: InvokeContext;
    markDone: () => void;
  };

  export interface InvokeContext {
    callbackWaitsForEmptyEventLoop: boolean;
    eventId: string;
    succeed: (result?: unknown) => void;
    fail: (error?: Error | null) => void;
    done: (error?: Error | null, result?: unknown) => void;
  }

  function buildRawCallbackContext(
    client: EventClient.Client,
    eventId: string,
    scheduleNext: () => void
  ): CallbackContext {
    const postError = (error: Error, callback: () => void) => {
      const errorBody = toSerializableError(error);
      console.error("Error", JSON.stringify(errorBody));
      client.postError(eventId, errorBody, callback);
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
      client.postEventResponse(eventId, result, callback);
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

    const ctx = {
      get callbackWaitsForEmptyEventLoop() {
        return waitForEmptyEventLoop;
      },
      set callbackWaitsForEmptyEventLoop(value) {
        waitForEmptyEventLoop = value;
      },
      succeed: succeed,
      fail: fail,
      done: done,
      eventId: eventId,
    };

    return {
      callback,
      ctx: ctx,
      markDone: function () {
        isInvokeDone = true;
      },
    };
  }

  /**
   * Wraps callback context functions with onlyOnce wrapper to ensure idempotency.
   */
  function wrapCallbackContext(
    callback: (error: Error | null, result: unknown) => void,
    ctx: InvokeContext,
    markDone: () => void
  ) {
    let completed = false;

    const onlyOnce = function <T extends (...args: any[]) => void>(
      toWrap: T
    ): T {
      return function (...args: any[]) {
        if (!completed) {
          toWrap.apply(null, args);
          completed = true;
        }
      } as T;
    };

    ctx.succeed = onlyOnce(ctx.succeed);
    ctx.fail = onlyOnce(ctx.fail);
    ctx.done = onlyOnce(ctx.done);

    return { callback: onlyOnce(callback), ctx: ctx, markDone };
  }

  export function create(
    client: EventClient.Client,
    id: string,
    scheduleInvoke: () => void
  ) {
    const rawCallbackContext = buildRawCallbackContext(
      client,
      id,
      scheduleInvoke
    );

    return wrapCallbackContext(
      rawCallbackContext.callback,
      rawCallbackContext.ctx,
      rawCallbackContext.markDone
    );
  }
}
