import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url);
export function loadTypeScript(file, overrides = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const record = { exports: {} };
    cache.set(filename, record);
    const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    const localRequire = (id) => {
      if (id in overrides) return overrides[id];
      if (id.startsWith("@/"))
        return load(path.resolve("src", id.slice(2) + ".ts"));
      if (id.startsWith("."))
        return load(path.resolve(path.dirname(filename), id + ".ts"));
      return require(id);
    };
    const run = vm.runInThisContext(
      `(function(require,module,exports){${output}\n})`,
      { filename },
    );
    run(localRequire, record, record.exports);
    return record.exports;
  }
  return load(file);
}
