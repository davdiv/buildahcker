import { Writable } from "stream";
import { temporaryContainer } from "../container";
import { ImageBuilder } from "../imageBuilder";
import { CacheOptions, apkAdd } from "./apkAdd";

export interface InstallAndRunOptions {
  apkPackages: string[];
  command: string[];
  buildahRunOptions: string[];
  cacheOptions?: CacheOptions;
  logger?: Writable;
}

export const installAndRun = async ({
  apkPackages,
  command,
  buildahRunOptions,
  cacheOptions,
  logger,
}: InstallAndRunOptions) => {
  const imageBuilder = await ImageBuilder.from("alpine", {
    containerCache: cacheOptions?.containerCache,
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
