const EXIT_SYMBOL = Symbol.for("yafaas.beforeExit");
const noop = () => {};

type YafaasGlobal = typeof globalThis & {
  [EXIT_SYMBOL]: () => void
}

/**
 * Invokes the beforeExit function, if set this will schedule a new invoke of the handler
 * function or exit execution if set to noop handler.
 */
export function invoke() {
  (globalThis as YafaasGlobal)[EXIT_SYMBOL]();
}

/**
 * Sets exist handler to noop function causing the next scheduled invoke to exit
 */
export function reset() {
  (globalThis as YafaasGlobal)[EXIT_SYMBOL] = noop;
}

/**
 * Set the global exit handler. Used to add new task into event loop
 * or stop execution entirely
 */
export function set(handler: () => void) {
  (globalThis as YafaasGlobal)[EXIT_SYMBOL] = handler;
}
