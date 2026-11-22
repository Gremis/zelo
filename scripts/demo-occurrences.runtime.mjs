import { existsSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

export function registerServerImports(root) {
  const require = createRequire(new URL("package.json", root));
  const nextHeaders = pathToFileURL(require.resolve("next/headers")).href;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.startsWith("@/"))
        return {
          url: new URL(`src/${specifier.slice(2)}.ts`, root).href,
          shortCircuit: true,
        };
      if (specifier === "next/headers")
        return { url: nextHeaders, shortCircuit: true };
      if (
        specifier.startsWith(".") &&
        context.parentURL?.startsWith(new URL("src/", root).href)
      ) {
        const candidate = new URL(`${specifier}.ts`, context.parentURL);
        if (existsSync(candidate))
          return { url: candidate.href, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
}
