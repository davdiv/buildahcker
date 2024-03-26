import { mkdir, readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { dirname, join, resolve } from "path";

export interface ContainerCache {
  getEntry(
    imageId: string,
    operationCacheKey: string,
  ): Promise<string | undefined>;
  setEntry(
    imageId: string,
    operationCacheKey: string,
    resultImageId: string,
  ): Promise<void>;
}

const safeRegExp = /^[\w-]+$/;

export class FSContainerCache implements ContainerCache {
  cachePath: string;

  constructor(cachePath: string) {
    this.cachePath = resolve(cachePath);
  }

  #getFilePath(imageId: string, operationCacheKey: string) {
    if (!safeRegExp.test(imageId) || !safeRegExp.test(operationCacheKey)) {
      throw new Error(
        `Unsafe image id ${JSON.stringify(imageId)} or operation key ${JSON.stringify(operationCacheKey)}.`,
      );
    }
    return join(this.cachePath, imageId, operationCacheKey);
  }

  async getEntry(
    imageId: string,
    operationCacheKey: string,
  ): Promise<string | undefined> {
    const filePath = this.#getFilePath(imageId, operationCacheKey);
    try {
      return (await readFile(filePath, "utf8")).trim() || undefined;
    } catch {}
  }

  async setEntry(
    imageId: string,
    operationCacheKey: string,
    resultImageId: string,
  ): Promise<void> {
    const filePath = this.#getFilePath(imageId, operationCacheKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, resultImageId, "utf8");
  }
}

let _defaultContainersCache: FSContainerCache | undefined;
export const defaultContainerCache = () => {
  if (!_defaultContainersCache) {
    const cachePath = join(homedir(), ".buildahcker", "cache", "containers");
    _defaultContainersCache = new FSContainerCache(cachePath);
  }
  return _defaultContainersCache;
};
