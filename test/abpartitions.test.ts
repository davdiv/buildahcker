import { expect, it } from "vitest";
import {
  ImageBuilder,
  MemDirectory,
  MemFile,
  addFiles,
  exec,
  useFilesInImages,
} from "../src";
import {
  abpartitionsDisk,
  abpartitionsRootPartition,
  apkAdd,
  prepareApkPackagesAndRun,
} from "../src/alpine";
import { apkCache, containerCache, logger } from "./testUtils";

it(
  "should work to configure a/b partitions",
  {
    timeout: 600000,
  },
  async () => {
    await exec(["buildah", "pull", "alpine"], { logger });
    const rootImageBuilder = await ImageBuilder.from("alpine", {
      containerCache,
      logger,
    });
    await rootImageBuilder.executeStep([
      addFiles({
        "etc/mkinitfs": new MemDirectory(),
        "etc/mkinitfs/mkinitfs.conf": new MemFile({
          content: `features="base virtio squashfs"\n`,
        }),
        init: new MemFile({
          content:
            "#!/bin/sh\n[ -d /sys/firmware/efi ] && echo BUILDAHCKER-SUCCESS-UEFI || echo BUILDAHCKER-SUCCESS-BIOS\nsleep 3\npoweroff -f",
          mode: 0o555,
        }),
      }),
      apkAdd(["linux-lts", "linux-firmware-none"], { apkCache }),
    ]);
    const rootPartition = await abpartitionsRootPartition({
      sourceRootImage: rootImageBuilder.imageId,
      kernelCmdline: "init=/init console=ttyS0",
      apkCache,
      containerCache,
      logger,
    });
    const diskImage = await abpartitionsDisk({
      linuxDiskDevice: "/dev/vda",
      rootPartitionSize: 500 * 1024 * 1024,
      rootPartition,
      apkCache,
      containerCache,
      logger,
    });
    await useFilesInImages(async (getFile) => {
      const apkPackages = ["qemu-system-x86_64", "ovmf"];
      const resultBios = await prepareApkPackagesAndRun({
        apkPackages,
        command: [
          "qemu-system-x86_64",
          "-m",
          "1G",
          "-drive",
          "format=raw,file=/disk.img,if=virtio",
          "-nographic",
        ],
        buildahRunOptions: ["-v", `${await getFile(diskImage)}:/disk.img`],
        apkCache,
        containerCache,
        logger,
      });
      expect(resultBios.stdout.toString("utf8")).toContain(
        "BUILDAHCKER-SUCCESS-BIOS",
      );
      const resultEfi = await prepareApkPackagesAndRun({
        apkPackages,
        command: [
          "qemu-system-x86_64",
          "-m",
          "1G",
          "-drive",
          "if=pflash,format=raw,unit=0,file=/usr/share/ovmf/bios.bin,readonly=on",
          "-drive",
          "format=raw,file=/disk.img,if=virtio",
          "-nographic",
        ],
        buildahRunOptions: ["-v", `${await getFile(diskImage)}:/disk.img`],
        apkCache,
        containerCache,
        logger,
      });
      expect(resultEfi.stdout.toString("utf8")).toContain(
        "BUILDAHCKER-SUCCESS-UEFI",
      );
    });
  },
);
