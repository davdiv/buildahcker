import { createHash } from "crypto";
import { rm } from "fs/promises";
import type { AtomicStep } from "../../container";
import type { DirectoryContent } from "./base";
import {
  hashDirectoryContent,
  normalizeDirectoryEntries,
  writeDirectoryContent,
} from "./base";
import { normalizeRelativePath, safelyJoinSubpath } from "./paths";

export const addFiles = (files: DirectoryContent) => {
  const entries = normalizeDirectoryEntries(files);
  const step: AtomicStep = async (container) => {
    const mountPath = await container.mount();
    await writeDirectoryContent(mountPath, entries, true);
  };
  step.getCacheKey = async () => {
    const hash = (await hashDirectoryContent(entries)).toString("base64url");
    return `ADD-FILES-${hash}`;
  };
  return step;
};

export const rmFiles = (files: string[]) => {
  files = files.map(normalizeRelativePath).sort();
  const step: AtomicStep = async (container) => {
    const mountPath = await container.mount();
    for (const relativeFilePath of files) {
      const fullPath = await safelyJoinSubpath(
        mountPath,
        relativeFilePath,
        true,
        true,
      );
      await rm(fullPath, { force: true, recursive: true });
    }
  };
  step.getCacheKey = async () => {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(files));
    return `RM-FILES-${hash.digest("base64url")}`;
  };
  return step;
};
