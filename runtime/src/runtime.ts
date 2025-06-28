import { ExitListener } from "./exit-listener.js";
import { Context } from "./context.js";
import toSerializableError from "./util.js";
import {EventClient} from "./client.js";

export namespace Runtime {
  export type ErrorCallback = (error: Error) => void;

  export type ErrorCallbacks = {
    uncaughtException: ErrorCallback;
    unhandledRejection: ErrorCallback;
  };

  export type HandlerFunc = (
    event: unknown,
    ctx: any,
    callback: any
  ) => Promise<any>;

  export class Executor {
    client: EventClient.Client;
    errorCallbacks: ErrorCallbacks;
    runOnce: () => Promise<void>;
    handler: HandlerFunc;

    constructor(
      client: EventClient.Client,
      handlerFunc: HandlerFunc,
      errorCallbacks: ErrorCallbacks
    ) {
      this.client = client;
      this.errorCallbacks = errorCallbacks;
      this.handler = handlerFunc;
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
      let { body, eventId } = await this.client.nextEvent();

      let { callback, ctx, markDone } = Context.create(
        this.client,
        eventId,
        this.scheduleInvoke.bind(this)
      );

      try {
        this.setErrorCallbacks(ctx.eventId);
        this.setExitListener(ctx.eventId, markDone);

        let result = this.handler(JSON.parse(body), ctx, callback);

        if (isPromise(result)) {
          result.then(ctx.succeed, ctx.fail).catch(ctx.fail);
        }
      } catch (error) {
        callback(error as Error, undefined);
      }
    }

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

    private setExitListener(eventId: string, markDone: () => void) {
      ExitListener.set(() => {
        markDone();
        this.client.postEventResponse(eventId, {}, () => this.scheduleInvoke());
        console.log("Scheduling next invocation and waiting for events...");
      });
    }
  }
}

const isPromise = (maybePromise: Promise<any>) =>
  maybePromise &&
  maybePromise instanceof Promise &&
  maybePromise.then &&
  typeof maybePromise.then === "function";
