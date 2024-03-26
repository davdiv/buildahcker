import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { Writable } from "stream";
import {
  Container,
  temporaryContainer,
  withImageOrContainer,
} from "../../container";
import { ImageBuilder } from "../../imageBuilder";
import { safelyJoinSubpath } from "../../steps/files/paths";
import { CacheOptions, apkAdd, defaultCacheOptions } from "../apkAdd";

export const getImageWithMksquashfs = async (cacheOptions?: CacheOptions) => {
  const imageBuilder = await ImageBuilder.from("alpine", {
    containerCache: cacheOptions?.containerCache,
  });
  await imageBuilder.executeStep(
    apkAdd(["squashfs-tools"], { apkCache: cacheOptions?.apkCache }),
  );
  return imageBuilder.imageId;
};

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
  if (!cacheOptions) {
    cacheOptions = await defaultCacheOptions();
  }
  outputFile = resolve(outputFile);
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, "");
  const mksquashImage = await getImageWithMksquashfs(cacheOptions);
  await withImageOrContainer(
    source,
    async (container) => {
      await temporaryContainer(
        mksquashImage,
        async (mksquashContainer) => {
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
          await mksquashContainer.run(
            ["mksquashfs", "/in", "/out", "-noappend", "-no-xattrs"],
            ["-v", `${sourcePath}:/in:ro`, "-v", `${outputFile}:/out:rw`],
          );
        },
        { logger },
      );
    },
    { logger },
  );
};
