import { open } from "fs/promises";
import { posix } from "path";
import { resolveInContainer } from "../resolveInContainer";

export interface ApkInstalledPackageInfo {
  packageName?: string;
  directories: string[];
  files: string[];
}

const emptyInstalledPackage = (): ApkInstalledPackageInfo => {
  return {
    directories: [],
    files: [],
  };
};

export class ApkInstalledDatabaseParser {
  #currentPackage: ApkInstalledPackageInfo = emptyInstalledPackage();
  #currentDirectory = ".";
  packagesMap = new Map<string, ApkInstalledPackageInfo>();

  addLine(line: string) {
    if (line.length === 0) {
      this.#currentPackage = emptyInstalledPackage();
      this.#currentDirectory = ".";
      return;
    }
    if (line[1] != ":") {
      throw new Error("Unexpected line syntax!");
    }
    const firstChar = line[0];
    const parameter = line.substring(2);
    switch (firstChar) {
      case "P": {
        this.#currentPackage.packageName = parameter;
        this.packagesMap.set(parameter, this.#currentPackage);
        break;
      }
      case "F": {
        this.#currentDirectory = parameter;
        this.#currentPackage.directories.push(parameter);
        break;
      }
      case "R": {
        const fileName = posix.join(this.#currentDirectory, parameter);
        this.#currentPackage.files.push(fileName);
        break;
      }
    }
  }
}

export const readApkInstalledDatabase = async (mountPath: string) => {
  const installedDbPath = await resolveInContainer(
    mountPath,
    "lib/apk/db/installed",
  );
  const file = await open(installedDbPath);
  try {
    const db = new ApkInstalledDatabaseParser();
    for await (const line of file.readLines()) {
      db.addLine(line);
    }
    return db;
  } finally {
    await file.close();
  }
};
