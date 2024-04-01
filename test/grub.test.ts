import { stat } from "fs/promises";
import { join } from "path";
import { expect, it } from "vitest";
import { ImageBuilder, exec } from "../src";
import { apkAdd, prepareApkPackagesAndRun } from "../src/alpine";
import { grubBiosInstall } from "../src/alpine/grub";
import { mksquashfs } from "../src/alpine/mksquashfs";
import {
  PartitionType,
  parted,
  writePartitions,
} from "../src/alpine/partitions";
import { apkCache, containerCache, logger, tempFolder } from "./testUtils";

it("grub installation should succeed", { timeout: 120000 }, async () => {
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
  await mksquashfs({
    source: builder.imageId,
    pathInSource: "/usr/lib/grub",
    outputFile: squashfsImage,
    apkCache,
    containerCache,
    logger,
  });
  const squashfsImageSize = (await stat(squashfsImage)).size;
  const diskImage = join(tempFolder, "disk.img");
  const partitions = await parted({
    outputFile: diskImage,
    partitions: [
      {
        name: "grub",
        size: 100000,
        type: PartitionType.BiosBoot,
      },
      {
        name: "linux",
        size: squashfsImageSize,
        type: PartitionType.LinuxData,
      },
    ],
    apkCache,
    containerCache,
    logger,
  });
  await grubBiosInstall({
    imageFile: diskImage,
    partition: partitions[0],
    modules: ["biosdisk", "part_gpt", "squash4"],
    prefix: "(hd0,2)",
    config: `insmod echo\necho -e "BUILDAHCKER-SUCCESS\\n\\n"\ninsmod sleep\ninsmod halt\nsleep 3\nhalt\n`,
    apkCache,
    containerCache,
    logger,
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
      "--drive",
      "format=raw,file=/disk.img",
      "-nographic",
    ],
    buildahRunOptions: ["-v", `${diskImage}:/disk.img`],
    apkCache,
    containerCache,
    logger,
  });
  expect(result.stdout.toString("utf8")).toContain("BUILDAHCKER-SUCCESS");
});
