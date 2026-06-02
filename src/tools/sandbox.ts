import { resolve, relative, isAbsolute } from "node:path";

// Resolves `p` against `root` and ensures the result stays inside `root`.
export function resolveInRoot(root: string, p: string): string {
  const target = resolve(root, p);
  const rel = relative(root, target);
  if (rel !== "" && (rel.startsWith("..") || isAbsolute(rel))) {
    throw new Error(`Path escapes the project root: ${p}`);
  }
  return target;
}
