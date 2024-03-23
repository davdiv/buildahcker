import { homedir } from "os";
import { join } from "path";
import { RunOptions, run } from "../steps/run";
import { mkdir } from "fs/promises";

export interface ApkAddOptions {
  cache?: string;
}

export const apkAdd = (packages: string[], options?: ApkAddOptions) => {
  const runOptions: RunOptions = {};
  if (options?.cache) {
    runOptions.buildahArgsNoHash = [
      "--volume",
      `${options.cache}:/etc/apk/cache:rw`,
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
