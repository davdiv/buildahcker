import { createHash } from "crypto";
import { mkdir, rm } from "fs/promises";
import type { AtomicStep } from "../../container";
import { resolveParentInContainer } from "../../resolveInContainer";
import type { DirectoryContent } from "./base";
import {
  hashDirectoryContent,
  normalizeDirectoryEntries,
  normalizeRelativePath,
} from "./base";
import { dirname } from "path";

export const addFiles = (files: DirectoryContent) => {
  const entries = normalizeDirectoryEntries(files);
  const step: AtomicStep = async (container) => {
    for (const [filePath, file] of entries) {
      const destination = await container.resolve(filePath);
      await mkdir(dirname(destination), { recursive: true });
      await file.writeTo(destination);
    }
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
      const fullPath = await resolveParentInContainer(
        mountPath,
        relativeFilePath,
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
