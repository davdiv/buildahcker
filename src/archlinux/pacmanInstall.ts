import { mkdir } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type { RunOptions } from "../steps/run";
import { run } from "../steps/run";

export interface PacmanInstallOptions {
  pacmanCache?: string;
}

export const pacmanInstall = (
  packages: string[],
  { pacmanCache }: PacmanInstallOptions = {},
) => {
  const runOptions: RunOptions = {};
  if (pacmanCache) {
    runOptions.buildahArgsNoHash = [
      "--volume",
      `${pacmanCache}:/var/cache/pacman/pkg:rw`,
    ];
    runOptions.extraHashData = ["--volume", `:/var/cache/pacman/pkg:rw`];
    runOptions.beforeRun = async () => {
      await mkdir(pacmanCache, { recursive: true });
    };
  }
  return run(["pacman", "-Syu", "--noconfirm", "--", ...packages], runOptions);
};

let _defaultPacmanCache: string | undefined;
export const defaultPacmanCache = () => {
  if (!_defaultPacmanCache) {
    _defaultPacmanCache = join(homedir(), ".buildahcker", "cache", "pacman");
  }
  return _defaultPacmanCache;
};
