import type { Writable } from "stream";
import type { CommitOptions, ImageOrContainer } from "../container";
import { runInImageOrContainer } from "../container";
import type { ContainerCache } from "../containerCache";
import { ImageBuilder } from "../imageBuilder";
import { apkAdd } from "./apkAdd";

export interface PrepareApkPackagesOptions {
  baseImage?: string;
  apkPackages: string[];
  commitOptions?: CommitOptions;
  logger?: Writable;
  apkCache?: string;
  containerCache?: ContainerCache;
}

export interface PrepareApkPackagesAndRunOptions extends PrepareApkPackagesOptions {
  existingSource?: ImageOrContainer;
  command: string[];
  buildahRunOptions: string[];
}

export const prepareApkPackages = async ({
  baseImage = "alpine",
  apkPackages,
  commitOptions,
  logger,
  apkCache,
  containerCache,
}: PrepareApkPackagesOptions) => {
  const imageBuilder = await ImageBuilder.from(baseImage, {
    containerCache,
    commitOptions,
    logger,
  });
  await imageBuilder.executeStep(apkAdd(apkPackages, { apkCache }));
  return imageBuilder.imageId;
};

export const prepareApkPackagesAndRun = async ({
  existingSource,
  command,
  buildahRunOptions,
  ...installOptions
}: PrepareApkPackagesAndRunOptions) =>
  await runInImageOrContainer({
    source: existingSource ?? (await prepareApkPackages(installOptions)),
    command,
    buildahRunOptions,
    logger: installOptions.logger,
  });
