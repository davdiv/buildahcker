import type { Writable } from "stream";
import { prepareApkPackagesAndRun } from "..";
import type { Container } from "../../container";
import { withImageOrContainer } from "../../container";
import { safelyJoinSubpath } from "../../steps/files/paths";
import type { CacheOptions } from "../apkAdd";
import { prepareOutputFile } from "../prepareOutputFile";

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
  outputFile = await prepareOutputFile(outputFile);
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
      await prepareApkPackagesAndRun({
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
