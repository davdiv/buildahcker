import { createHash } from "crypto";
import { rm } from "fs/promises";
import type { Writable } from "stream";
import type { AtomicStep } from "../container";
import { rmFiles } from "../steps/files/step";
import { removeIfEmpty } from "../fileUtils";

export const pacmanManuallyRemove = (packages: string[], logger?: Writable) => {
  packages = packages.sort();
  const step: AtomicStep = async (container) => {
    const output = await container.run([
      "pacman",
      "-lq",
      "-Q",
      "--",
      ...packages,
    ]);
    const files = output.stdout.toString("utf8").trim().split("\n");
    const directories: string[] = [];
    for (const file of files) {
      if (file.endsWith("/")) {
        directories.unshift(file);
        continue;
      }
      const fileFullPath = await container.resolveParent(file);
      logger?.write(`rm ${file}\n`);
      await rm(fileFullPath, { force: true });
    }
    for (const directory of directories) {
      const fullPath = await container.resolveParent(directory);
      await removeIfEmpty(fullPath);
    }
  };
  step.getCacheKey = async () => {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(packages));
    return `PACMAN-REMOVE-${hash.digest("base64url")}`;
  };
  return step;
};

export const pacmanRemovePacman = (
  packages: string[] = [],
  logger?: Writable,
) => [
  pacmanManuallyRemove(["pacman", ...packages], logger),
  rmFiles([
    "var/lib/pacman",
    "var/cache/pacman",
    "usr/share/pacman",
    "usr/share/libalpm",
    "etc/pacman.d",
  ]),
];
