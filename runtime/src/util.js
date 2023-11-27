/**
 * @param {string | Error | undefined} error
 */
export function toError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      // @ts-ignore
      code: error.code,
      name: error.name,
      stack: error.stack,
    };
  }

  const err = new Error(error);

  return {
    message: err.message,
    // @ts-ignore
    code: err.code,
    name: err.name,
    stack: err.stack,
  };
}
