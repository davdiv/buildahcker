import { createHash } from "crypto";
import { mkdir, rm } from "fs/promises";
import type { AtomicStep, Container } from "../../container";
import { resolveParentInContainer } from "../../resolveInContainer";
import type { CopyableFile, DirectoryContent } from "./base";
import {
  hashDirectoryContent,
  normalizeDirectoryEntries,
  normalizeRelativePath,
} from "./base";
import { dirname } from "path";
import { DiskDirectory } from "./disk";

const writeEntriesToContainer = async (
  entries: Map<string, CopyableFile>,
  container: Container,
) => {
  for (const [filePath, file] of entries) {
    const destination = await container.resolve(filePath);
    await mkdir(dirname(destination), { recursive: true });
    await file.writeTo(destination);
  }
};

export const addRootDirectory = (path: string) => {
  const directory = new DiskDirectory(path, { uid: 0, gid: 0, mode: 0o755 }); // note that attributes are ignored
  const step: AtomicStep = async (container) => {
    await writeEntriesToContainer(await directory.getContent(), container);
  };
  step.getCacheKey = async () => {
    const hash = (await directory.getContentHash()).toString("base64url");
    return `ADD-ROOT-DIRECTORY-${hash}`;
  };
  return step;
};

export const addFiles = (files: DirectoryContent) => {
  const entries = normalizeDirectoryEntries(files);
  const step: AtomicStep = async (container) => {
    await writeEntriesToContainer(entries, container);
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
