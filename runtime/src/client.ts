import http from "node:http";
import { toSerializableError } from "./util.js";

interface EventResponse {
  body: string;
  headers: http.IncomingHttpHeaders;
}

export class Client {
  private agent: http.Agent;
  private host: string;
  private port: number;

  constructor(endpoint: string) {

    if (endpoint === undefined) {
      throw new Error("endpoint not provided, undefined or null");
    }

    const [host, port] = endpoint.split(":");

    if (host === undefined || port === undefined) {
      throw new Error("endpoint invalid, got: ${endpoint} wanted: <host>:<port>");
    }

    this.host = host;
    this.port = parseInt(port, 10);

    this.agent = new http.Agent({
      keepAlive: true,
      maxSockets: 1,
    });
  }

  nextEvent(): Promise<EventResponse> {
    const options = {
      hostname: this.host,
      port: this.port,
      path: "/yafaas/events/next",
      method: "GET",
      agent: this.agent,
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

  postEventResponse(id: string, event: unknown, callback: () => void): void {
    const data = JSON.stringify(event === undefined ? null : event);

    this.post(`/yafaas/events/${id}/response`, data, {}, callback);
  }

  postRuntimeError(error: Error | unknown, callback: () => void): void {
    const data = JSON.stringify(error === undefined ? null : error);

    this.post("/yafaas/error", data, {}, callback);
  }

  postError(id: string, error: Error | unknown, callback: () => void): void {
    const data = JSON.stringify(error === undefined ? null : error);

    this.post(`/yafaas/function/${id}/error`, data, {}, callback);
  }

  private post(
    path: string,
    body: string,
    headers: Record<string, string>,
    callback: () => void
  ): void {
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
      agent: this.agent,
    };

    const request = http.request(options, (response) => {
      response
        .on("end", () => {
          callback();
        })
        .on("error", (e: Error) => {
          console.log("response:error", toSerializableError(e));
          throw e;
        })
        .on("data", () => {});
    });

    request
      .on("error", (e: NodeJS.ErrnoException) => {
        if (e.code === "ECONNREFUSED") {
          console.log("Event service unreachable");
          console.log("message:", e.message);
          process.exit(128);
        }
        console.log("request:error", toSerializableError(e));
        throw e;
      })
      .end(body, "utf-8");
  }
}
