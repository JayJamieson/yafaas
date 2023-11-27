import http from "node:http";
import { toError } from "./util.js";

export class Client {
  #agent;
  host;
  port;

  /**
   * Create client for interacting with function events API.
   * @param {string|undefined} endpoint
   */
  constructor(endpoint) {
    if(endpoint === undefined) {
      throw new Error("endpoint not provided, undefined or null");
    }

    const [host, port] = endpoint.split(":");
    this.host = host;
    this.port = parseInt(port, 10);

    this.#agent = new http.Agent({
      keepAlive: true,
      maxSockets: 1,
    });
  }

  /**
   * Gets next invocation event. Blocks until event is available
   * to be read from event bus.
   *
   * @returns {Promise<{body: string, headers: object}>}
   */
  nextEvent() {
    const options = {
      hostname: this.host,
      port: this.port,
      path: "/yafaas/events/next",
      method: "GET",
      agent: this.#agent,
    };

    return new Promise((resolve, reject) => {
      const request = http.request(options, (response) => {
        let data = "";
        response
          .setEncoding("utf-8")
          .on("data", (chunk) => {
            data += chunk;
          })
          .on("end", () => {
            resolve({
              body: data,
              headers: response.headers,
            });
          });
      });
      request
        .on("error", (error) => {
          reject(error);
        })
        .end();
    });
  }

  /**
   * Send function invocation response to event bus.
   * @param {string} id
   * @param {object} event
   * @param {Function} callback
   */
  postEventResponse(id, event, callback) {
    const data = JSON.stringify(event === undefined ? null : event);

    this.#post(`/yafaas/events/${id}/response`, data, {}, callback);
  }

  /**
   * Send runtime error probably unrelated to function invocation to
   * to event bus.
   *
   * @param {Error} error
   * @param {Function} callback
   */
  postRuntimeError(error, callback) {
    const data = JSON.stringify(error === undefined ? null : error);

    this.#post("/yafaas/error", data, {}, callback);
  }

  /**
   * Respond with error from function invocation to event bus.
   *
   * @param {string} id
   * @param {Error} error
   * @param {Function} callback
   */
  postError(id, error, callback) {
    const data = JSON.stringify(error === undefined ? null : error);

    this.#post(`/yafaas/function/${id}/error`, data, {}, callback);
  }

  /**
   * Send post request
   *
   * @param {string} path
   * @param {string} body
   * @param {object} headers
   * @param {Function} callback
   */
  #post(path, body, headers, callback) {
    const options = {
      hostname: this.host,
      port: this.port,
      path: path,
      method: "POST",
      headers: Object.assign(
        {
          "Content-Type": "application/json",
          "Content-Length": Buffer.from(body).length,
        },
        headers || {}
      ),
      agent: this.#agent,
    };

    const request = http.request(options, (response) => {
      response
        .on("end", () => {
          callback();
        })
        .on("error", (e) => {
          console.log("response:error",toError(e));
          throw e;
        })
        .on("data", () => {});
    });

    request
      .on("error", (e) => {
        // @ts-ignore
        if (e.code === "ECONNREFUSED") {
          console.error("Event service unreachable");
          console.log("message:", e.message);
          process.exit(128);
        }
        console.log("request:error",toError(e));
        throw e;
      })
      .end(body, "utf-8");
  }
}
