"use strict";

const EXIT_SYMBOL = Symbol.for("yafaas.beforeExit");
const noop = () => {};

export function invoke() {
  global[EXIT_SYMBOL]();
}

export function reset() {
  global[EXIT_SYMBOL] = noop;
}

/**
 * Set the global exit handler. Used to add new task into event loop
 * or stop execution entirely
 * @param {Function} handler
 */
export function set(handler) {
  global[EXIT_SYMBOL] = handler;
}
