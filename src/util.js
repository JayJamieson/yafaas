export function toError(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack,
    };
  }

  const err = new Error(error);

  return {
    message: err.message,
    code: err.code,
    name: err.name,
    stack: err.stack,
  };
}
