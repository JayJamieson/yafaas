import * as ExitListener from "./exitListener.js";
import * as CallbackContextBuilder from "./callbackContext.js";
import { toSerializableError } from "./util.js";
import { Client } from "./client.js";

export type ErrorCallback = (error: Error) => void;
export type ErrorCallbacks = {
  uncaughtException: ErrorCallback;
  unhandledRejection: ErrorCallback;
};

export type HandlerFunc = (event: unknown, ctx: any, callback: any) => Promise<any>;


export class Runtime {
  client: Client;
  handler: HandlerFunc;
  errorCallbacks: ErrorCallbacks;
  runOnce: () => Promise<void>;

  constructor(
    client: Client,
    handlerFunc: HandlerFunc,
    errorCallbacks: ErrorCallbacks
  ) {
    this.client = client;

    this.handler = handlerFunc;
    this.errorCallbacks = errorCallbacks;
    this.runOnce = this.handleOnce;
  }

  scheduleInvoke() {
    let current = this;
    setImmediate(() => {
      current.runOnce().then(
        () => {},
        (error) => {
          console.log(`Error encountered at Top Level: ${error.toString()}`);
          this.errorCallbacks.uncaughtException(error);
        }
      );
    });
  }

  async handleOnce() {
    // wait for event
    let { body, headers } = await this.client.nextEvent();
    let ctx = new Context(headers);
    let {callback, callbackContext, markDone} = CallbackContextBuilder.build(
      this.client,
      ctx.eventId,
      this.scheduleInvoke.bind(this)
    );

    try {
      this.setErrorCallbacks(ctx.eventId);
      this.setExitListener(ctx.eventId, markDone);

      // user function code aka not a Lambda
      let result = this.handler(
        JSON.parse(body),
        ctx.addCallbacks(callbackContext),
        callback
      );

      if (isPromise(result)) {
        result
          .then(callbackContext.succeed, callbackContext.fail)
          .catch(callbackContext.fail);
      }
    } catch (error) {
      callback(error as Error, undefined);
    }
  }

  /**
   * @param {string} eventId
   */
  private setErrorCallbacks(eventId: string) {
    this.errorCallbacks.uncaughtException = (error: Error) => {
      const err = toSerializableError(error);
      this.client.postError(eventId, err, () => {
        console.error("Runtime:uncaughtException", err);
        process.exit(128);
      });
    };

    this.errorCallbacks.unhandledRejection = (error: Error) => {
      const err = toSerializableError(error);
      this.client.postError(eventId, err, () => {
        console.error("Runtime:unhandledRejection", err);
        process.exit(128);
      });
    };
  }

  /**
   *
   * @param {string} eventId
   * @param {Function} markDone
   */
  private setExitListener(eventId: string, markDone: () => void) {
    ExitListener.set(() => {
      markDone();
      this.client.postEventResponse(eventId, {}, () => this.scheduleInvoke());
      console.log("Scheduling next invocation and waiting for events...");
    });
  }
}

class Context {
  private headers: any;

  constructor(headers: any) {
    this.headers = headers;
  }

  get eventId() {
    // @ts-ignore
    return this.headers["event-id"];
  }

  public addCallbacks(callbacks: any) {
    return Object.assign(callbacks, { time: Date.now() });
  }
}

/**
 *
 * @param {Function|Promise<any>} maybePromise
 * @returns
 */
const isPromise = (maybePromise: any) =>
  maybePromise &&
  maybePromise instanceof Promise &&
  maybePromise.then &&
  typeof maybePromise.then === "function";
