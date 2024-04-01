import { mkdir, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { beforeEach } from "vitest";
import type { ContainerCache } from "../src";
import { FSContainerCache, WritableBuffer } from "../src";

export let tempFolder: string;
export let apkCache: string;
export let containerCache: ContainerCache;
beforeEach(async () => {
  const tempRootFolder = join(__dirname, "..", "temp");
  await mkdir(tempRootFolder, { recursive: true });
  const folder = await mkdtemp(join(tempRootFolder, "buildahcker-test-"));
  tempFolder = folder;
  apkCache = join(folder, "apk");
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
