import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { Writable } from "stream";
import { installAndRun } from "..";
import { Container, withImageOrContainer } from "../../container";
import { safelyJoinSubpath } from "../../steps/files/paths";
import { CacheOptions } from "../apkAdd";

export interface MksquashfsOptions {
  source: string | Container;
  outputFile: string;
  pathInSource?: string;
  cacheOptions?: CacheOptions;
  logger?: Writable;
}

export const mksquashfs = async ({
  source,
  outputFile,
  pathInSource = ".",
  cacheOptions,
  logger,
}: MksquashfsOptions) => {
  outputFile = resolve(outputFile);
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, "");
  await withImageOrContainer(
    source,
    async (container) => {
      await container.mount();
      const sourcePath =
        pathInSource !== "."
          ? await safelyJoinSubpath(
              container.mountPath,
              pathInSource,
              true,
              false,
            )
          : container.mountPath;
      await installAndRun({
        apkPackages: ["squashfs-tools"],
        command: ["mksquashfs", "/in", "/out", "-noappend", "-no-xattrs"],
        buildahRunOptions: [
          "-v",
          `${sourcePath}:/in:ro`,
          "-v",
          `${outputFile}:/out:rw`,
        ],
        cacheOptions,
        logger,
      });
    },
    { logger },
  );
};
