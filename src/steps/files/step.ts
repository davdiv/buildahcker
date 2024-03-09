import { AtomicStep } from "../../container";
import {
  DirectoryContent,
  hashDirectoryContent,
  normalizeDirectoryEntries,
  writeDirectoryContent,
} from "./base";

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
