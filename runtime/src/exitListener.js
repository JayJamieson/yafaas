"use strict";

const EXIT_SYMBOL = Symbol.for("yafaas.beforeExit");
const noop = () => {};

export function invoke() {
  global[EXIT_SYMBOL]();
}

export function reset() {
  global[EXIT_SYMBOL] = noop;
}

export function set(handler) {
  global[EXIT_SYMBOL] = handler;
}
