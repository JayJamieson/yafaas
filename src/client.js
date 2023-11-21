import { request } from "undici";

export class Client {

  /**
   * Create client for interacting with function events API.
   * @param {string} endpoint
   */
  constructor(endpoint) {
    this.endpoint = endpoint;

    this.defaultOptions = {
      blocking: true,
      bodyTimeout: 1000000,
      headerTimeout: 100000,
    };
  }

  nextEvent() {
    const options = {
      ...this.defaultOptions,
      method: "GET",
      path: "yafaas/events/next"
    }

    return request(this.endpoint, options);
  }

  /**
   * Send function invocation response to event bus.
   *
   * @param {string} id
   * @param {string} data
   */
  postEventResponse(id, data) {
    const options = {
      ...this.defaultOptions,
      method: "GET",
      path: `yafaas/events/${id}/response`,
      body: data
    }

    return request(this.endpoint, options);
  }

  /**
   * Send runtime error probably unrelated to function invocation to
   * to event bus.
   *
   * @param {string} error
   */
  postRuntimeError(error) {
    const options = {
      ...this.defaultOptions,
      method: "GET",
      path: "yafaas/error",
      body: error
    }

    return request(this.endpoint, options);
  }

  /**
   * Respond with error from function invocation to event bus.
   *
   * @param {string} id
   * @param {string} error
   */
  postError(id, error) {
    const options = {
      ...this.defaultOptions,
      method: "GET",
      path: `yafaas/function/${id}/error`,
      body: error
    }

    return request(this.endpoint, options);
  }

}
