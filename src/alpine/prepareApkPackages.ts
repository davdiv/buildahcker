import type { Writable } from "stream";
import type { CommitOptions } from "../container";
import { temporaryContainer } from "../container";
import { ImageBuilder } from "../imageBuilder";
import type { CacheOptions } from "./apkAdd";
import { apkAdd } from "./apkAdd";

export interface PrepareApkPackagesOptions {
  baseImage?: string;
  apkPackages: string[];
  cacheOptions?: CacheOptions;
  commitOptions?: CommitOptions;
  logger?: Writable;
}

export interface PrepareApkPackagesAndRunOptions
  extends PrepareApkPackagesOptions {
  command: string[];
  buildahRunOptions: string[];
}

export const prepareApkPackages = async ({
  baseImage = "alpine",
  apkPackages,
  cacheOptions,
  commitOptions,
  logger,
}: PrepareApkPackagesOptions) => {
  const imageBuilder = await ImageBuilder.from(baseImage, {
    containerCache: cacheOptions?.containerCache,
    commitOptions,
    logger,
  });
  await imageBuilder.executeStep(
    apkAdd(apkPackages, { apkCache: cacheOptions?.apkCache }),
  );
  return imageBuilder.imageId;
};

export const prepareApkPackagesAndRun = async ({
  command,
  buildahRunOptions,
  ...installOptions
}: PrepareApkPackagesAndRunOptions) =>
  await temporaryContainer(
    await prepareApkPackages(installOptions),
    async (container) => await container.run(command, buildahRunOptions),
    { logger: installOptions.logger },
  );
