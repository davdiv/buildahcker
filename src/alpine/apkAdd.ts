import { mkdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type { ContainerCache } from "../containerCache";
import { defaultContainerCache } from "../containerCache";
import type { RunOptions } from "../steps/run";
import { run } from "../steps/run";

export interface ApkAddOptions {
  apkCache?: string;
}

export const apkAdd = (packages: string[], options?: ApkAddOptions) => {
  const runOptions: RunOptions = {};
  if (options?.apkCache) {
    runOptions.buildahArgsNoHash = [
      "--volume",
      `${options.apkCache}:/etc/apk/cache:rw`,
    ];
    runOptions.extraHashData = ["--volume", `:/etc/apk/cache:rw`];
  }
  return run(["apk", "add", ...packages], runOptions);
};

let _defaultApkCache: string | undefined;
export const defaultApkCache = async () => {
  if (!_defaultApkCache) {
    _defaultApkCache = join(homedir(), ".buildahcker", "cache", "apk");
    await mkdir(_defaultApkCache, { recursive: true });
  }
  return _defaultApkCache;
};

export interface CacheOptions {
  containerCache?: ContainerCache;
  apkCache?: string;
}

let _defaultCacheOptions: CacheOptions;
export const defaultCacheOptions = async () => {
  if (!_defaultCacheOptions) {
    _defaultCacheOptions = {
      containerCache: defaultContainerCache(),
      apkCache: await defaultApkCache(),
    };
  }
  return _defaultCacheOptions;
};
