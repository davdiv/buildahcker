import { writeFile } from "fs/promises";
import { join } from "path";
import type { Writable } from "stream";
import { temporaryContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import type { OffsetAndSize } from "../partitions";
import { prepareApkPackages } from "../prepareApkPackages";
import { grubBiosSetup } from "./biosSetup";

export interface GrubBiosInstallOptions {
  imageFile: string | number;
  partition: OffsetAndSize;
  config?: string;
  prefix?: string;
  modules?: string[];
  logger?: Writable;
  containerCache?: ContainerCache;
  apkCache?: string;
}

const grubApkPackages = ["grub", "grub-bios", "grub-efi"];

export const grubBiosInstall = async ({
  imageFile,
  partition,
  modules,
  prefix,
  config,
  containerCache,
  apkCache,
  logger,
}: GrubBiosInstallOptions) => {
  const grubImage = await prepareApkPackages({
    apkPackages: grubApkPackages,
    containerCache,
    apkCache,
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
