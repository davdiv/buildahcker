import type { Writable } from "stream";
import type { ImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import { prepareOutputFile } from "../fileUtils";
import { prepareApkPackagesAndRun } from "../prepareApkPackages";

export interface MksquashfsOptions {
  inputFolder: string;
  outputFile: string;
  squashfsToolsSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const mksquashfs = async ({
  inputFolder,
  squashfsToolsSource,
  outputFile,
  containerCache,
  apkCache,
  logger,
}: MksquashfsOptions) => {
  outputFile = await prepareOutputFile(outputFile);
  await prepareApkPackagesAndRun({
    apkPackages: ["squashfs-tools"],
    existingSource: squashfsToolsSource,
    command: ["mksquashfs", "/in", "/out", "-noappend", "-no-xattrs"],
    buildahRunOptions: [
      "-v",
      `${inputFolder}:/in:ro`,
      "-v",
      `${outputFile}:/out:rw`,
    ],
    containerCache,
    apkCache,
    logger,
  });
};
