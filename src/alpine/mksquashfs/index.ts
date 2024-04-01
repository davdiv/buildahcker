import type { Writable } from "stream";
import type { Container } from "../../container";
import { withImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import { prepareOutputFile } from "../fileUtils";
import { prepareApkPackagesAndRun } from "../prepareApkPackages";

export interface MksquashfsOptions {
  source: string | Container;
  outputFile: string;
  pathInSource?: string;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const mksquashfs = async ({
  source,
  outputFile,
  pathInSource = ".",
  containerCache,
  apkCache,
  logger,
}: MksquashfsOptions) => {
  outputFile = await prepareOutputFile(outputFile);
  await withImageOrContainer(
    source,
    async (container) => {
      const sourcePath = await container.resolve(pathInSource);
      await prepareApkPackagesAndRun({
        apkPackages: ["squashfs-tools"],
        command: ["mksquashfs", "/in", "/out", "-noappend", "-no-xattrs"],
        buildahRunOptions: [
          "-v",
          `${sourcePath}:/in:ro`,
          "-v",
          `${outputFile}:/out:rw`,
        ],
        containerCache,
        apkCache,
        logger,
      });
    },
    { logger },
  );
};
