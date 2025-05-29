import { createHash } from "crypto";
import { chmod, lchown, lstat, readdir } from "fs/promises";
import type { AtomicStep } from "../../container";
import type { FileAttributes } from "./base";
import { normalizeDirectoryEntries } from "./base";
import { join } from "path";

export const setFileAttributes = (
  files: Record<
    string,
    Partial<FileAttributes & { recursive: boolean; dmode: number }>
  >,
) => {
  const entries = normalizeDirectoryEntries(files);
  const step: AtomicStep = async (container) => {
    for (const [
      filePath,
      { recursive, mode, dmode = mode, uid, gid },
    ] of entries) {
      const files = [await container.resolve(filePath)];
      while (files.length > 0) {
        const destination = files.shift()!;
        const statRes = await lstat(destination);
        if (statRes.isDirectory()) {
          if (dmode != null) {
            await chmod(destination, dmode);
          }
          if (recursive) {
            const content = await readdir(destination);
            files.push(...content.map((file) => join(destination, file)));
          }
        }
        const actualMode = statRes.isDirectory() ? dmode : mode;
        if (actualMode != null && !statRes.isSymbolicLink()) {
          await chmod(destination, actualMode);
        }
        if (uid != null || gid != null) {
          await lchown(destination, uid ?? statRes.uid, gid ?? statRes.gid);
        }
      }
    }
  };
  step.getCacheKey = async () => {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(files));
    return `SETATTRIBUTES-${hash.digest("base64url")}`;
  };
  return step;
};
