import fs from "node:fs/promises";
import path from "node:path";

/**
 * Attempts to load a user function relative to application directory.
 * NOTE: Only works with ESM modules because ESM is best :)
 *
 * @param {string} appDir
 * @param {string} handler form of `filename.functionName
 * @returns {function~handlerFunc}
 */
export async function loadFunction(appDir, handler) {
  const [module, handlerName] = splitHandlerString(handler);

  let app = await tryImport(appDir, module);
  const handlerFunc = resolveHandler(app, handlerName);

  if (!handlerFunc) {
    throw new HandlerNotFound(`${handler} is undefined or not exported`);
  }

  if (typeof handlerFunc !== "function") {
    throw new HandlerNotFound(`${handler} is not a function`);
  }

  return handlerFunc;
}

async function tryImport(appDir, filename) {
  const fileDir = path.resolve(appDir, filename);
  const filepath = `${fileDir}.mjs`;

  try {
    const _ = await fs.stat(filepath);

    return await import(filepath);
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new UserCodeSyntaxError(e);
    } else if (e.code !== undefined && e.code === "MODULE_NOT_FOUND") {
      console.log("globalPaths", JSON.stringify(require("module").globalPaths));
      throw new ImportModuleError(e);
    } else {
      throw e;
    }
  }
}

/**
 * Resolve the user's handler function from the module.
 */
function resolveHandler(module, prop) {
  return prop.split(".").reduce((nested, key) => {
    return nested && nested[key];
  }, module);
}

/**
 * Splits handler string to handler file/module and name of
 * exported function handler.
 *
 * @param {string} handler
 * @returns {string[]}
 */
function splitHandlerString(handler) {
  let match = handler.match(/^([^.]*)\.(.*)$/);
  if (!match || match.length != 3) {
    throw new Error("Bad handler");
  }
  return [match[1], match[2]]; // [module, function-name]
}

class HandlerNotFound extends Error {}
class UserCodeSyntaxError extends Error {}
class ImportModuleError extends Error {}
