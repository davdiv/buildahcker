import { stat } from "fs/promises";
import { join } from "path";
import { expect, it } from "vitest";
import { ImageBuilder, exec, temporaryContainer } from "../src";
import { apkAdd, prepareApkPackagesAndRun } from "../src/alpine";
import { grubBiosSetup, grubMkimage } from "../src/alpine/grub";
import { mksquashfs } from "../src/alpine/mksquashfs";
import { mkvfatfs } from "../src/alpine/mkvfatfs";
import {
  PartitionType,
  parted,
  writePartitions,
} from "../src/alpine/partitions";
import { apkCache, containerCache, logger, tempFolder } from "./testUtils";
import { stripVTControlCharacters } from "util";

it("grub bios installation should succeed", { timeout: 120000 }, async () => {
  const source = "alpine";
  await exec(["buildah", "pull", source], { logger });
  const builder = await ImageBuilder.from(source, {
    logger,
    commitOptions: {
      timestamp: 0,
    },
    containerCache,
  });
  await builder.executeStep([
    apkAdd(["grub", "grub-bios"], {
      apkCache,
    }),
  ]);
  const squashfsImage = join(tempFolder, "squashfs.img");
  const grubCoreFile = join(tempFolder, "grubCore.img");
  const grubBootFile = join(tempFolder, "grubBoot.img");
  await temporaryContainer(builder.imageId, async (container) => {
    await mksquashfs({
      inputFolder: await container.resolve("usr/lib/grub"),
      outputFile: squashfsImage,
      apkCache,
      containerCache,
      logger,
    });
    await grubMkimage({
      outputCoreFile: grubCoreFile,
      outputBootFile: grubBootFile,
      grubSource: container,
      target: "i386-pc",
      modules: ["biosdisk", "part_gpt", "squash4"],
      prefix: "(hd0,2)/",
      config: `insmod echo\necho -e "BUILDAHCKER-SUCCESS\\n\\n"\ninsmod sleep\ninsmod halt\nsleep 3\nhalt\n`,
      apkCache,
      containerCache,
      logger,
    });
  });
  const squashfsImageSize = (await stat(squashfsImage)).size;
  const grubCoreImageSize = (await stat(grubCoreFile)).size;
  const diskImage = join(tempFolder, "disk.img");
  const partitions = await parted({
    outputFile: diskImage,
    partitions: [
      {
        name: "grub",
        size: grubCoreImageSize,
        type: PartitionType.BiosBoot,
      },
      {
        name: "linux",
        size: squashfsImageSize,
        type: PartitionType.LinuxData,
      },
    ],
  });
  await grubBiosSetup({
    imageFile: diskImage,
    partition: partitions[0],
    bootFile: grubBootFile,
    coreFile: grubCoreFile,
  });
  await writePartitions({
    outputFile: diskImage,
    partitions: [
      {
        inputFile: squashfsImage,
        output: partitions[1],
      },
    ],
  });
  const result = await prepareApkPackagesAndRun({
    apkPackages: ["qemu-system-x86_64"],
    command: [
      "qemu-system-x86_64",
      "-drive",
      "format=raw,file=/disk.img",
      "-nographic",
    ],
    buildahRunOptions: ["-v", `${diskImage}:/disk.img`],
    apkCache,
    containerCache,
    logger,
  });
  expect(stripVTControlCharacters(result.stdout.toString("utf8"))).toContain(
    "BUILDAHCKER-SUCCESS",
  );
});

it("grub efi installation should succeed", { timeout: 120000 }, async () => {
  const source = "alpine";
  await exec(["buildah", "pull", source], { logger });
  const builder = await ImageBuilder.from(source, {
    logger,
    commitOptions: {
      timestamp: 0,
    },
    containerCache,
  });
  await builder.executeStep([
    apkAdd(["grub", "grub-efi"], {
      apkCache,
    }),
  ]);
  const squashfsImage = join(tempFolder, "squashfs.img");
  const efiImage = join(tempFolder, "efi.img");
  const grubCoreFile = join(tempFolder, "efi", "EFI", "boot", "bootx64.efi");
  await temporaryContainer(builder.imageId, async (container) => {
    await mksquashfs({
      inputFolder: await container.resolve("usr/lib/grub"),
      outputFile: squashfsImage,
      apkCache,
      containerCache,
      logger,
    });
    await grubMkimage({
      outputCoreFile: grubCoreFile,
      grubSource: container,
      target: "x86_64-efi",
      modules: ["part_gpt", "squash4"],
      prefix: "(hd0,gpt2)/",
      config: `insmod echo\necho -e "BUILDAHCKER-SUCCESS\\n\\n"\ninsmod sleep\ninsmod halt\nsleep 3\nhalt\n`,
      apkCache,
      containerCache,
      logger,
    });
    const grubCoreImageSize = (await stat(grubCoreFile)).size;
    await mkvfatfs({
      inputFolder: join(tempFolder, "efi"),
      outputFile: efiImage,
      outputFileSize: Math.max(grubCoreImageSize, 33 * 1024 * 1024),
      apkCache,
      containerCache,
      logger,
    });
  });
  const squashfsImageSize = (await stat(squashfsImage)).size;
  const efiImageSize = (await stat(efiImage)).size;

  const diskImage = join(tempFolder, "disk.img");
  const partitions = await parted({
    outputFile: diskImage,
    partitions: [
      {
        name: "efi",
        size: efiImageSize,
        type: PartitionType.EfiSystem,
      },
      {
        name: "linux",
        size: squashfsImageSize,
        type: PartitionType.LinuxData,
      },
    ],
  });
  await writePartitions({
    outputFile: diskImage,
    partitions: [
      {
        inputFile: efiImage,
        output: partitions[0],
      },
      {
        inputFile: squashfsImage,
        output: partitions[1],
      },
    ],
  });
  const result = await prepareApkPackagesAndRun({
    apkPackages: ["qemu-system-x86_64", "ovmf"],
    command: [
      "qemu-system-x86_64",
      "-drive",
      "if=pflash,format=raw,unit=0,file=/usr/share/ovmf/bios.bin,readonly=on",
      "-drive",
      "format=raw,file=/disk.img",
      "-nographic",
    ],
    buildahRunOptions: ["-v", `${diskImage}:/disk.img`],
    apkCache,
    containerCache,
    logger,
  });
  expect(stripVTControlCharacters(result.stdout.toString("utf8"))).toContain(
    "BUILDAHCKER-SUCCESS",
  );
});
