import type { Writable } from "stream";
import type { ImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import { ImageBuilder } from "../../imageBuilder";
import { MemFile, addFiles } from "../../steps";
import { mksquashfsStep } from "../mksquashfs";
import type { FileInImage } from "../../fileInImage";

export interface ABPartitionsRootPartitionOptions {
  sourceRootImage: string;
  sourceRootKernelPath?: string;
  kernelCmdline?: string;
  sourceRootInitrdPath?: string;
  squashfsToolsSource?: ImageOrContainer;
  apkCache?: string;
  containerCache?: ContainerCache;
  logger?: Writable;
}

export const abpartitionsRootPartition = async ({
  sourceRootImage,
  sourceRootKernelPath = "/boot/vmlinuz-lts",
  kernelCmdline,
  sourceRootInitrdPath = "/boot/initramfs-lts",
  squashfsToolsSource,
  apkCache,
  containerCache,
  logger,
}: ABPartitionsRootPartitionOptions): Promise<FileInImage> => {
  const builder = await ImageBuilder.from(sourceRootImage, {
    containerCache,
    logger,
  });
  await builder.executeStep([
    addFiles({
      "boot/grub.cfg": new MemFile({
        content: `linux ${sourceRootKernelPath} $buildahcker_params${kernelCmdline ? ` ${kernelCmdline}` : ""}${sourceRootInitrdPath ? `\ninitrd ${sourceRootInitrdPath}` : ""}\n`,
      }),
    }),
    mksquashfsStep({
      inputFolder: ".",
      outputFile: "/buildahcker.img",
      squashfsToolsSource,
      apkCache,
      containerCache,
      logger,
    }),
  ]);
  return { imageId: builder.imageId, file: "buildahcker.img" };
};
