import * as ExitListener from "./exitListener.js";
import * as CallbackContextBuilder from "./callbackContext.js";

/** @typedef {import("./client").Client} Client */
export class Runtime {
  /**
   * @param {Client} client
   * @param {function} handlerFunc
   * @param {object} errorCallbacks
   */
  constructor(client, handlerFunc, errorCallbacks) {
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
    let [callback, callbackContext, markDone] = CallbackContextBuilder.build(
      this.client,
      ctx.eventId,
      this.scheduleInvoke.bind(this)
    );

    try {
      this.#setErrorCallbacks(ctx.eventId);
      this.#setExitListener(ctx.eventId, markDone);

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
      callback(error);
    }
  }

  #setErrorCallbacks(eventId) {
    this.errorCallbacks.uncaughtException = (error) => {
      this.client.postError(eventId, error, () => {
        process.exit(128);
      });
    };

    this.errorCallbacks.unhandledRejection = (error) => {
      this.client.postError(eventId, error, () => {
        process.exit(128);
      });
    };
  }

  #setExitListener(eventId, markDone) {
    ExitListener.set(() => {
      markDone();
      this.client.postEventResponse(eventId, null, () => this.scheduleInvoke());
    });
  }
}

class Context {
  constructor(headers) {
    this.headers = headers;
  }

  get eventId() {
    return this.headers["event-id"];
  }

  /**
   *
   * @param {object} callbacks
   */
  addCallbacks(callbacks) {
    return Object.assign(callbacks, { time: Date.now() });
  }
}

const isPromise = (maybePromise) =>
  maybePromise && maybePromise.then && typeof maybePromise.then === "function";
