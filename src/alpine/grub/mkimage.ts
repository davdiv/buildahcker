import { cp, writeFile } from "fs/promises";
import { join } from "path";
import type { Writable } from "stream";
import type { AtomicStep, ImageOrContainer } from "../../container";
import { withImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import { prepareOutputFile } from "../../fileUtils";
import { prepareApkPackages } from "../prepareApkPackages";
import { createHash } from "crypto";
import {
  grubBiosSetupPrepareBoot,
  grubBiosSetupPrepareCore,
} from "./biosSetup";

export interface GrubMkImageOptions {
  outputCoreFile: string;
  outputBootFile?: string;
  biosSetupDiskOffset?: number;
  modules?: string[];
  prefix?: string;
  target?: string;
  config?: string;
  pubkey?: string;
  memdisk?: string;
  disableCli?: boolean;
  disableShimLock?: boolean;
  grubSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const grubMkimage = async ({
  outputCoreFile,
  outputBootFile,
  biosSetupDiskOffset,
  modules,
  prefix,
  config,
  pubkey,
  memdisk,
  disableCli,
  disableShimLock,
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
            "-o",
            "core.img",
            ...(config ? ["-c", "config.cfg"] : []),
            ...(memdisk ? ["-m", "memdisk.img"] : []),
            ...(pubkey ? ["-k", "pubkey.key"] : []),
            ...(disableCli ? ["--disable-cli"] : []),
            ...(disableShimLock ? ["--disable-shim-lock"] : []),
            ...(prefix ? ["-p", prefix] : []),
            "--",
            ...(modules ?? []),
          ],
          [
            "--workingdir",
            tempFolder.pathInContainer,
            "-v",
            `${outputCoreFile}:${tempFolder.pathInContainer}/core.img:rw`,
            ...(memdisk
              ? [
                  "-v",
                  `${memdisk}:${tempFolder.pathInContainer}/memdisk.img:ro`,
                ]
              : []),
            ...(pubkey
              ? ["-v", `${pubkey}:${tempFolder.pathInContainer}/pubkey.key:ro`]
              : []),
          ],
        );
        if (outputBootFile) {
          outputBootFile = await prepareOutputFile(outputBootFile);
          await cp(
            await container.resolve(`usr/lib/grub/${target}/boot.img`),
            outputBootFile,
          );
        }
        if (biosSetupDiskOffset) {
          await grubBiosSetupPrepareCore({
            diskOffset: biosSetupDiskOffset,
            outputCoreFile,
          });
          if (outputBootFile) {
            await grubBiosSetupPrepareBoot({
              diskOffset: biosSetupDiskOffset,
              outputBootFile,
            });
          }
        }
      } finally {
        await tempFolder.remove();
      }
    },
    { logger },
  );
};

// Note that paths in grubMkimageStep are inside the container
export const grubMkimageStep = ({
  outputCoreFile: outputCoreFileInContainer,
  outputBootFile: outputBootFileInContainer,
  biosSetupDiskOffset,
  modules,
  prefix,
  config,
  memdisk: memdiskInContainer,
  pubkey: pubkeyInContainer,
  disableCli,
  disableShimLock,
  target,
  ...otherOptions
}: GrubMkImageOptions) => {
  const step: AtomicStep = async (container) => {
    const outputCoreFile = await container.resolve(outputCoreFileInContainer);
    const outputBootFile = outputBootFileInContainer
      ? await container.resolve(outputBootFileInContainer)
      : undefined;
    const memdisk = memdiskInContainer
      ? await container.resolve(memdiskInContainer)
      : undefined;
    const pubkey = pubkeyInContainer
      ? await container.resolve(pubkeyInContainer)
      : undefined;
    await grubMkimage({
      outputCoreFile,
      outputBootFile,
      biosSetupDiskOffset,
      modules,
      prefix,
      config,
      memdisk,
      pubkey,
      disableCli,
      disableShimLock,
      target,
      ...otherOptions,
    });
  };
  step.getCacheKey = async () => {
    const hash = createHash("sha256");
    hash.update(
      JSON.stringify({
        outputCoreFile: outputCoreFileInContainer,
        outputBootFile: outputBootFileInContainer,
        biosSetupDiskOffset,
        modules,
        prefix,
        config,
        memdisk: memdiskInContainer,
        pubkey: pubkeyInContainer,
        disableCli,
        disableShimLock,
        target,
      }),
    );
    return `GRUB-MKIMAGE-${hash.digest("base64url")}`;
  };
  return step;
};
