import { join } from "path";
import type { Writable } from "stream";
import type { AtomicStep, ImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import type { FileInImage } from "../../fileInImage";
import { useFilesInImages } from "../../fileInImage";
import { ImageBuilder } from "../../imageBuilder";
import { MemFile, addFiles, run } from "../../steps";
import { grubBiosSetup, grubMkimageStep } from "../grub";
import { mksquashfsStep } from "../mksquashfs";
import { mkvfatfsStep } from "../mkvfatfs";
import type { Partition, PartitionConfig } from "../partitions";
import { PartitionType, parted, writePartitions } from "../partitions";
import { prepareApkPackages } from "../prepareApkPackages";
import { createHash } from "crypto";
import { stat } from "fs/promises";

const minEFIPartitionSize = 33 * 1024 * 1024;

export interface ABPartitionsGrubPartitionOptions {
  linuxDiskDevice?: string;
  grubSourceImage: string;
  grubSourcePath?: string;
  grubEnvPartitionIndex: number;
  rootPartitionAIndex: number;
  rootPartitionBIndex: number;
  squashfsToolsSource?: ImageOrContainer;
  apkCache?: string;
  containerCache?: ContainerCache;
  logger?: Writable;
}

export const abpartitionsGrubPartition = async ({
  linuxDiskDevice = "/dev/sda",
  grubSourceImage,
  grubSourcePath = "/usr/lib/grub",
  grubEnvPartitionIndex,
  rootPartitionAIndex,
  rootPartitionBIndex,
  squashfsToolsSource,
  apkCache,
  containerCache,
  logger,
}: ABPartitionsGrubPartitionOptions): Promise<FileInImage> => {
  const grubImageBuilder = await ImageBuilder.from(grubSourceImage, {
    containerCache,
    logger,
  });
  await grubImageBuilder.executeStep([
    addFiles({
      [join(grubSourcePath, "grub.cfg")]: new MemFile({
        content: `
insmod all_video
set envfile=(hd0,gpt${grubEnvPartitionIndex})+1024
load_env --file $envfile buildahcker_stable buildahcker_new
if [ ( $buildahcker_new == b ) -o ( buildahcker_stable == b ) ] ; then
  set default=b
  set fallback=a
else
  set default=a
  set fallback=b
fi
if [ buildahcker_new != n ] ; then
  set buildahcker_new=n
  save_env --file $envfile buildahcker_stable buildahcker_new
fi
if [ ( $buildahcker_stable != a ) -a ( $buildahcker_stable != b ) ] ; then
  set buildahcker_stable=n
fi
export buildahcker_params
timeout=3
menuentry A --id=a {
  set root=(hd0,gpt${rootPartitionAIndex})
  set buildahcker_params="buildahcker_current=a buildahcker_stable=$buildahcker_stable buildahcker_other_root=${linuxDiskDevice}${rootPartitionBIndex} root=${linuxDiskDevice}${rootPartitionAIndex}"
  configfile /boot/grub.cfg
}
menuentry B --id=b {
  set root=(hd0,gpt${rootPartitionBIndex})
  set buildahcker_params="buildahcker_current=b buildahcker_stable=$buildahcker_stable buildahcker_other_root=${linuxDiskDevice}${rootPartitionAIndex} root=${linuxDiskDevice}${rootPartitionBIndex}"
  configfile /boot/grub.cfg
}
`,
      }),
    }),
    mksquashfsStep({
      inputFolder: grubSourcePath,
      outputFile: "/buildahcker.img",
      squashfsToolsSource,
      apkCache,
      containerCache,
      logger,
    }),
  ]);
  return { imageId: grubImageBuilder.imageId, file: "buildahcker.img" };
};

export interface ABPartitionsGrubEnvPartitionOptions {
  grubSourceImage: string;
  containerCache?: ContainerCache;
  logger?: Writable;
}

export const abpartitionsGrubEnvPartition = async ({
  grubSourceImage,
  containerCache,
  logger,
}: ABPartitionsGrubEnvPartitionOptions): Promise<FileInImage> => {
  const grubEnvBuilder = await ImageBuilder.from(grubSourceImage, {
    containerCache,
    logger,
  });
  await grubEnvBuilder.executeStep([
    run(["grub-editenv", "/buildahcker.img", "create"]),
    run([
      "grub-editenv",
      "/buildahcker.img",
      "set",
      "buildahcker_stable=a",
      "buildahcker_new=n",
    ]),
  ]);
  return { imageId: grubEnvBuilder.imageId, file: "buildahcker.img" };
};

export interface ABPartitionsEfiPartitionOptions {
  grubSourceImage: string;
  grubPartitionIndex: number;
  efiPartitionSize: number;
  mtoolsSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const abpartitionsEfiPartition = async ({
  grubSourceImage,
  grubPartitionIndex,
  efiPartitionSize,
  mtoolsSource,
  containerCache,
  apkCache,
  logger,
}: ABPartitionsEfiPartitionOptions): Promise<FileInImage> => {
  const builder = await ImageBuilder.from(
    "scratch", // TODO: allow passing this as a parameter?
    {
      containerCache,
      logger,
    },
  );
  await builder.executeStep([
    grubMkimageStep({
      outputCoreFile: "efi/EFI/boot/bootx64.efi",
      grubSource: grubSourceImage,
      target: "x86_64-efi",
      modules: ["part_gpt", "squash4"],
      prefix: `(hd0,gpt${grubPartitionIndex})/`,
      containerCache,
      apkCache,
      logger,
    }),
    mkvfatfsStep({
      inputFolder: "efi",
      outputFile: "/buildahcker.img",
      outputFileSize: efiPartitionSize,
      mtoolsSource,
      apkCache,
      containerCache,
      logger,
    }),
  ]);
  return { imageId: builder.imageId, file: "buildahcker.img" };
};

export interface ABPartitionsBiosPartitionOptions {
  grubSourceImage: string;
  grubPartitionIndex: number;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const abpartitionsBiosPartition = async ({
  grubSourceImage,
  grubPartitionIndex,
  containerCache,
  apkCache,
  logger,
}: ABPartitionsBiosPartitionOptions): Promise<{
  boot: FileInImage;
  core: FileInImage;
}> => {
  const builder = await ImageBuilder.from("scratch", {
    containerCache,
    logger,
  });
  await builder.executeStep([
    grubMkimageStep({
      outputCoreFile: "buildahcker_grub_core.img",
      outputBootFile: "buildahcker_grub_boot.img",
      grubSource: grubSourceImage,
      target: "i386-pc",
      modules: ["biosdisk", "part_gpt", "squash4"],
      prefix: `(hd0,gpt${grubPartitionIndex})/`,
      containerCache,
      apkCache,
      logger,
    }),
  ]);
  return {
    core: { imageId: builder.imageId, file: "buildahcker_grub_core.img" },
    boot: { imageId: builder.imageId, file: "buildahcker_grub_boot.img" },
  };
};

export interface ABPartitionsDiskOptions {
  bootType?: "bios" | "efi" | "both";
  linuxDiskDevice?: string;
  efiPartitionSize?: number;
  biosBootPartitionSize?: number;
  rootPartition?: FileInImage;
  rootPartitionSize: number;
  grubSourceImage?: string;
  grubSourcePath?: string;
  partedSource?: ImageOrContainer;
  mtoolsSource?: ImageOrContainer;
  squashfsToolsSource?: ImageOrContainer;
  apkCache?: string;
  containerCache?: ContainerCache;
  logger?: Writable;
}

export const abpartitionsDisk = async ({
  bootType = "both",
  linuxDiskDevice,
  efiPartitionSize,
  biosBootPartitionSize,
  rootPartition,
  rootPartitionSize,
  grubSourceImage,
  grubSourcePath,
  partedSource,
  mtoolsSource,
  squashfsToolsSource,
  apkCache,
  containerCache,
  logger,
}: ABPartitionsDiskOptions): Promise<FileInImage> => {
  const useBios = bootType === "bios" || bootType === "both";
  const useEfi = bootType === "efi" || bootType === "both";
  if (!grubSourceImage) {
    grubSourceImage = await prepareApkPackages({
      apkPackages: [
        ...(useEfi ? ["grub-efi"] : []),
        ...(useBios ? ["grub-bios"] : []),
      ],
      apkCache,
      containerCache,
      logger,
    });
  }
  const partitionsMap: Record<
    number,
    Pick<Partition, "name" | "type"> &
      (
        | { size?: number; file: FileInImage }
        | { size: number; file?: FileInImage }
      )
  > = {};

  let curPartitionIndex = 0;
  const biosDataPartitionIndex = useBios ? ++curPartitionIndex : -1;
  const efiPartitionIndex = useEfi ? ++curPartitionIndex : -1;
  const grubEnvPartitionIndex = ++curPartitionIndex;
  const grubPartitionIndex = ++curPartitionIndex;
  const rootPartitionAIndex = ++curPartitionIndex;
  const rootPartitionBIndex = ++curPartitionIndex;

  partitionsMap[grubEnvPartitionIndex] = {
    type: PartitionType.LinuxData,
    name: "grubenv",
    file: await abpartitionsGrubEnvPartition({
      grubSourceImage,
      containerCache,
      logger,
    }),
  };

  const biosBoot = useBios
    ? await abpartitionsBiosPartition({
        grubSourceImage,
        grubPartitionIndex,
        containerCache,
        apkCache,
        logger,
      })
    : undefined;

  if (biosBoot) {
    partitionsMap[biosDataPartitionIndex] = {
      type: PartitionType.BiosBoot,
      name: "biosboot",
      size: biosBootPartitionSize,
      file: biosBoot.core,
    };
  }
  if (useEfi) {
    efiPartitionSize = Math.max(minEFIPartitionSize, efiPartitionSize ?? 0);
    partitionsMap[efiPartitionIndex] = {
      name: "efi",
      type: PartitionType.EfiSystem,
      file: await abpartitionsEfiPartition({
        grubSourceImage,
        grubPartitionIndex,
        mtoolsSource,
        apkCache,
        containerCache,
        efiPartitionSize,
        logger,
      }),
    };
  }

  partitionsMap[grubPartitionIndex] = {
    name: "grub",
    type: PartitionType.LinuxData,
    file: await abpartitionsGrubPartition({
      linuxDiskDevice,
      grubSourceImage,
      grubSourcePath,
      grubEnvPartitionIndex,
      rootPartitionAIndex,
      rootPartitionBIndex,
      squashfsToolsSource,
      apkCache,
      containerCache,
      logger,
    }),
  };
  partitionsMap[rootPartitionAIndex] = {
    name: "systemA",
    type: PartitionType.LinuxData,
    size: rootPartitionSize,
    file: rootPartition,
  };
  partitionsMap[rootPartitionBIndex] = {
    name: "systemB",
    type: PartitionType.LinuxData,
    size: rootPartitionSize,
  };

  const builder = await ImageBuilder.from("scratch", {
    containerCache,
    logger,
  });
  const step: AtomicStep = async (container) =>
    await useFilesInImages(async (getFile) => {
      const outputFile = await container.resolve("buildahcker.img");
      const partitions: Partition[] = [];
      for (let i = 1; i <= curPartitionIndex; i++) {
        const partitionInfo = partitionsMap[i];
        partitions.push({
          name: partitionInfo.name,
          size:
            partitionInfo.size ??
            (await stat(await getFile(partitionInfo.file!))).size,
          type: partitionInfo.type,
        });
      }
      const partedRes = await parted({
        partitions,
        outputFile,
        partedSource,
        apkCache,
        containerCache,
        logger,
      });
      const partitionsToWrite: PartitionConfig[] = [];
      for (let i = 1; i <= curPartitionIndex; i++) {
        const partitionInfo = partitionsMap[i];
        if (partitionInfo.file) {
          partitionsToWrite.push({
            inputFile: await getFile(partitionInfo.file),
            output: partedRes[i - 1],
          });
        }
      }
      await writePartitions({
        outputFile,
        partitions: partitionsToWrite,
      });
      if (biosBoot) {
        await grubBiosSetup({
          imageFile: outputFile,
          bootFile: await getFile(biosBoot.boot),
          coreFile: await getFile(biosBoot.core),
          partition: partedRes[biosDataPartitionIndex - 1],
        });
      }
    });
  step.getCacheKey = async () => {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(partitionsMap));
    return `ABPARTITIONSDISK-${hash.digest("base64url")}`;
  };
  await builder.executeStep(step);

  return {
    imageId: builder.imageId,
    file: "buildahcker.img",
  };
};
