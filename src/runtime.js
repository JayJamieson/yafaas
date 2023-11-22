export class Runtime {

  constructor(client, handlerFunc, errorCallbacks) {
    this.client = client;
    this.handler = handlerFunc;
    this.errorCallbacks = errorCallbacks;
    this.runOnce = this.handleOnc;
  }

  async handleOnce() {
    // wait for event
    // build some sort of context
    // build callback functions
    // setup error handling
    // setup exitListener func
    // invoke function
  }

  #setErrorCallbacks(runId) {
    this.errorCallbacks.
  }
}
