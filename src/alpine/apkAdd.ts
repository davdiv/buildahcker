import { mkdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type { RunOptions } from "../steps/run";
import { run } from "../steps/run";

export interface ApkAddOptions {
  apkCache?: string;
}

export const apkAdd = (
  packages: string[],
  { apkCache }: ApkAddOptions = {},
) => {
  const runOptions: RunOptions = {};
  if (apkCache) {
    runOptions.buildahArgsNoHash = [
      "--volume",
      `${apkCache}:/etc/apk/cache:rw`,
    ];
    runOptions.extraHashData = ["--volume", `:/etc/apk/cache:rw`];
    runOptions.beforeRun = async () => {
      await mkdir(apkCache, { recursive: true });
    };
  }
  return run(["apk", "add", ...packages], runOptions);
};

let _defaultApkCache: string | undefined;
export const defaultApkCache = () => {
  if (!_defaultApkCache) {
    _defaultApkCache = join(homedir(), ".buildahcker", "cache", "apk");
  }
  return _defaultApkCache;
};
