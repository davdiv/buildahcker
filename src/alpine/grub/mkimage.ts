import { cp, writeFile } from "fs/promises";
import { join } from "path";
import type { Writable } from "stream";
import type { ImageOrContainer } from "../../container";
import { withImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import { prepareOutputFile } from "../fileUtils";
import { prepareApkPackages } from "../prepareApkPackages";

export interface GrubMkImageOptions {
  outputCoreFile: string;
  outputBootFile?: string;
  modules?: string[];
  prefix?: string;
  target?: string;
  config?: string;
  grubSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const grubMkimage = async ({
  outputCoreFile,
  outputBootFile,
  modules,
  prefix,
  config,
  target,
  grubSource,
  containerCache,
  apkCache,
  logger,
}: GrubMkImageOptions) => {
  outputCoreFile = await prepareOutputFile(outputCoreFile);
  if (!grubSource) {
    grubSource = await prepareApkPackages({
      apkPackages: ["grub", "grub-bios", "grub-efi"],
      containerCache,
      apkCache,
      logger,
    });
  }
  await withImageOrContainer(
    grubSource,
    async (container) => {
      const tempFolder = await container.tempFolder();
      try {
        if (config) {
          await writeFile(join(tempFolder.pathInHost, "config.cfg"), config);
        }
        await container.run(
          [
            "grub-mkimage",
            "-O",
            target ?? "x86_64-efi",
            "-p",
            prefix ?? "/boot/grub",
            "-o",
            "core.img",
            ...(config ? ["-c", "config.cfg"] : []),
            "--",
            ...(modules ?? []),
          ],
          [
            "--workingdir",
            tempFolder.pathInContainer,
            "-v",
            `${outputCoreFile}:${tempFolder.pathInContainer}/core.img:rw`,
          ],
        );
        if (outputBootFile) {
          outputBootFile = await prepareOutputFile(outputBootFile);
          await cp(
            await container.resolve(`usr/lib/grub/${target}/boot.img`),
            outputBootFile,
          );
        }
      } finally {
        await tempFolder.remove();
      }
    },
    { logger },
  );
};
