import { request } from "undici";

export class Client {


  /**
   * Create client for interacting with function events API
   * @param {String} endpoint
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

}
