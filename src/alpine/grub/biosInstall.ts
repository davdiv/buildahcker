import { writeFile } from "fs/promises";
import { join } from "path";
import type { Writable } from "stream";
import { temporaryContainer } from "../..";
import type { CacheOptions } from "../apkAdd";
import type { OffsetAndSize } from "../partitions";
import { prepareApkPackages } from "../prepareApkPackages";
import { grubBiosSetup } from "./biosSetup";

export interface GrubBiosInstallOptions {
  imageFile: string | number;
  partition: OffsetAndSize;
  config?: string;
  prefix?: string;
  modules?: string[];
  cacheOptions?: CacheOptions;
  logger?: Writable;
}

const grubApkPackages = ["grub", "grub-bios", "grub-efi"];

export const grubBiosInstall = async ({
  imageFile,
  partition,
  modules,
  prefix,
  config,
  cacheOptions,
  logger,
}: GrubBiosInstallOptions) => {
  const grubImage = await prepareApkPackages({
    apkPackages: grubApkPackages,
    cacheOptions,
    logger,
  });
  await temporaryContainer(
    grubImage,
    async (container) => {
      await container.mount();
      if (config) {
        await writeFile(join(container.mountPath, "config.cfg"), config);
      }
      await container.run([
        "grub-mkimage",
        "-O",
        "i386-pc",
        "-p",
        prefix ?? "/boot/grub",
        "-o",
        "/core.img",
        ...(config ? ["-c", "/config.cfg"] : []),
        "--",
        ...(modules ?? []),
      ]);
      await grubBiosSetup({
        imageFile,
        partition: partition,
        bootFile: join(container.mountPath, "usr/lib/grub/i386-pc/boot.img"),
        coreFile: join(container.mountPath, "core.img"),
      });
    },
    {
      logger,
    },
  );
};
