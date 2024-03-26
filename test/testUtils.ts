import { mkdir, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { beforeEach } from "vitest";
import { FSContainerCache, WritableBuffer } from "../src";
import { CacheOptions } from "../src/alpine";

export let tempFolder: string;
export let cacheOptions: CacheOptions;
beforeEach(async () => {
  const tempRootFolder = join(__dirname, "..", "temp");
  await mkdir(tempRootFolder, { recursive: true });
  const folder = await mkdtemp(join(tempRootFolder, "buildahcker-test-"));
  tempFolder = folder;
  const apkCache = join(folder, "apk");
  await mkdir(apkCache);
  const containerCachePath = join(folder, "container");
  cacheOptions = {
    apkCache,
    containerCache: new FSContainerCache(containerCachePath),
  };

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
