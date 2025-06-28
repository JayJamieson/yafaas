export type SerializableError = {
  message: string;
  code: any;
  name: string;
  stack: string | undefined;
};

export default function toSerializableError(error: Error): SerializableError {
  return {
    message: error.message,
    // @ts-ignore
    code: error.code,
    name: error.name,
    stack: error.stack,
  };
}
