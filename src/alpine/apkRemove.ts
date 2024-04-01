import { createHash } from "crypto";
import { readdir, rm, rmdir } from "fs/promises";
import type { Writable } from "stream";
import type { AtomicStep } from "../container";
import { rmFiles } from "../steps/files/step";
import { readApkInstalledDatabase } from "./apkInstalledDatabase";

const removeIfEmpty = async (directory: string) => {
  try {
    const content = await readdir(directory);
    if (content.length === 0) {
      await rmdir(directory);
    }
  } catch (e: any) {
    if (e.code !== "ENOENT") {
      throw e;
    }
  }
};

export const apkManuallyRemove = (packages: string[], logger?: Writable) => {
  packages = packages.sort();
  const step: AtomicStep = async (container) => {
    const mountPath = await container.mount();
    const db = await readApkInstalledDatabase(mountPath);
    const filesToRemove: string[] = [];
    const directoriesToRemove: string[] = [];
    for (const packageName of packages) {
      const packageInfo = db.packagesMap.get(packageName);
      if (!packageInfo) {
        logger?.write(`Package not installed: ${packageName}\n`);
        continue;
      }
      filesToRemove.push(...packageInfo.files);
      directoriesToRemove.push(...packageInfo.directories);
    }
    for (const file of filesToRemove) {
      const fileFullPath = await container.resolveParent(file);
      logger?.write(`rm ${file}\n`);
      await rm(fileFullPath, { force: true });
    }
    directoriesToRemove.sort().reverse();
    for (const directory of directoriesToRemove) {
      const fullPath = await container.resolveParent(directory);
      await removeIfEmpty(fullPath);
    }
  };
  step.getCacheKey = async () => {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(packages));
    return `APK-REMOVE-${hash.digest("base64url")}`;
  };
  return step;
};

export const apkRemoveApk = (packages: string[] = [], logger?: Writable) => [
  apkManuallyRemove(["apk-tools", ...packages], logger),
  rmFiles([
    "var/lib/apk",
    "lib/apk",
    "etc/apk",
    "usr/share/apk",
    "var/cache/apk",
  ]),
];
