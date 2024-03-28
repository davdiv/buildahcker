import type { Writable } from "stream";
import type { CommitOptions } from "../container";
import { temporaryContainer } from "../container";
import { ImageBuilder } from "../imageBuilder";
import type { CacheOptions } from "./apkAdd";
import { apkAdd } from "./apkAdd";

export interface InstallAndRunOptions {
  baseImage?: string;
  apkPackages: string[];
  command: string[];
  buildahRunOptions: string[];
  cacheOptions?: CacheOptions;
  commitOptions?: CommitOptions;
  logger?: Writable;
}

export const installAndRun = async ({
  baseImage = "alpine",
  apkPackages,
  command,
  buildahRunOptions,
  cacheOptions,
  commitOptions,
  logger,
}: InstallAndRunOptions) => {
  const imageBuilder = await ImageBuilder.from(baseImage, {
    containerCache: cacheOptions?.containerCache,
    commitOptions,
    logger,
  });
  await imageBuilder.executeStep(
    apkAdd(apkPackages, { apkCache: cacheOptions?.apkCache }),
  );
  return await temporaryContainer(
    imageBuilder.imageId,
    async (container) => await container.run(command, buildahRunOptions),
    { logger },
  );
};
