import { createHash } from "crypto";
import { chmod, chown, stat } from "fs/promises";
import type { AtomicStep } from "../../container";
import type { FileAttributes } from "./base";
import { normalizeDirectoryEntries } from "./base";

export const setFileAttributes = (
  files: Record<string, Partial<FileAttributes>>,
) => {
  const entries = normalizeDirectoryEntries(files);
  const step: AtomicStep = async (container) => {
    for (const [filePath, { mode, uid, gid }] of entries) {
      const destination = await container.resolve(filePath);
      if (mode != null) {
        await chmod(destination, mode);
      }
      if (uid != null || gid != null) {
        await chown(
          destination,
          uid ?? (await stat(destination)).uid,
          gid ?? (await stat(destination)).gid,
        );
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
