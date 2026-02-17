import { lstat, mkdir, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { beforeEach, expect } from "vitest";
import type { ContainerCache } from "../src";
import { FSContainerCache, WritableBuffer, temporaryContainer } from "../src";

export let tempFolder: string;
export let apkCache: string;
export let pacmanCache: string;
export let containerCache: ContainerCache;
beforeEach(async () => {
  const tempRootFolder = join(__dirname, "..", "temp");
  await mkdir(tempRootFolder, { recursive: true });
  const folder = await mkdtemp(join(tempRootFolder, "buildahcker-test-"));
  tempFolder = folder;
  apkCache = join(folder, "apk");
  pacmanCache = join(folder, "pacman");
  containerCache = new FSContainerCache(join(folder, "container"));

  return async () => {
    await rm(folder, { recursive: true });
  };
});

export let logger: WritableBuffer;
beforeEach(() => {
  const buffer = new WritableBuffer();
  logger = buffer;
  return async () => {
    buffer.end();
    console.log((await buffer.promise).toString("utf8"));
  };
});

export const statFileInImage = async (imageId: string, path: string) =>
  await temporaryContainer(
    imageId,
    async (container) => {
      const fullPath = await container.resolve(path);
      try {
        return await lstat(fullPath);
      } catch (e: any) {
        if (e.code === "ENOENT") {
          return null;
        }
        throw e;
      }
    },
    { logger },
  );

export const checkNonEmptyFileExists = async (file: string) => {
  const res = await lstat(file);
  expect(res.isFile()).toBe(true);
  expect(res.size).toBeGreaterThan(1);
};
