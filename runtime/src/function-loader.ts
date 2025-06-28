import fs from "node:fs/promises";
import Module from "node:module";
import path from "node:path";

/**
 * Attempts to load a user function relative to application directory.
 * NOTE: Only works with ESM modules because ESM is best :)
 */
export default async function loadFunction(appDir: string, handler: string): Promise<() => Promise<unknown>> {
  const [module, handlerName] = splitHandlerString(handler);

  let app = await tryImport(appDir, module);
  const handlerFunc = resolveHandler(app, handlerName);

  if (!handlerFunc) {
    console.log(`${handler} is undefined or not exported`);
    throw new HandlerNotFound(`${handler} is undefined or not exported`);
  }

  if (typeof handlerFunc !== "function") {
    throw new HandlerNotFound(`${handler} is not a function`);
  }

  return handlerFunc;
}

async function tryImport(appDir: string, filename: string): Promise<Module> {
  const fileDir = path.resolve(appDir, filename);
  const filepath = `${fileDir}.mjs`;

  try {
    await fs.stat(filepath);
    return await import(filepath);
  } catch (e: unknown) {
    if (e instanceof SyntaxError) {
      throw new UserCodeSyntaxError(e.message);
    } else if (e && typeof e === 'object' && 'code' in e && e.code === "MODULE_NOT_FOUND") {
      const _require = Module.createRequire(import.meta.url);
      console.log("globalPaths", JSON.stringify(_require('module').globalPaths));
      throw new ImportModuleError(e instanceof Error ? e.message : 'Module not found');
    } else {
      throw e;
    }
  }
}

function resolveHandler(module: Module, handlerName: string): any {
  return handlerName.split(".").reduce((nested: any, key: string) => {
    return nested && nested[key];
  }, module);
}

function splitHandlerString(handler: string): [module: string, handler: string] {
  let match = handler.match(/^([^.]*)\.(.*)$/);
  if (!match || match.length != 3) {
    throw new Error(`Bad handler format, got: ${handler} wanted: <module name>.<handler name>`);
  }

  return [match[1] as string, match[2] as string]; // [module, handler-name]
}

class HandlerNotFound extends Error {}
class UserCodeSyntaxError extends Error {}
class ImportModuleError extends Error {}
