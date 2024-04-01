import type { Writable } from "stream";
import type { CommitOptions } from "../container";
import { temporaryContainer } from "../container";
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

export interface PrepareApkPackagesAndRunOptions
  extends PrepareApkPackagesOptions {
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
  command,
  buildahRunOptions,
  ...installOptions
}: PrepareApkPackagesAndRunOptions) =>
  await temporaryContainer(
    await prepareApkPackages(installOptions),
    async (container) => await container.run(command, buildahRunOptions),
    { logger: installOptions.logger },
  );
