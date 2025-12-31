import { expect, it } from "vitest";
import { apkCache, pacmanCache, containerCache, logger } from "./testUtils";
import {
  addFiles,
  dracut,
  exec,
  ImageBuilder,
  MemDirectory,
  MemFile,
  mkerofsStep,
  pacmanInstall,
  pacmanRemovePacman,
  prepareApkPackagesAndRun,
  rmFiles,
  run,
  ukify,
  useFilesInImages,
  veritytab,
} from "../src";
import { stripVTControlCharacters } from "util";

it(
  "should work to create an archlinux system",
  {
    timeout: 600000,
  },
  async () => {
    await exec(["buildah", "pull", "archlinux"], { logger });

    const rootBuilder = await ImageBuilder.from(
      "docker.io/library/archlinux:latest",
      {
        logger,
        commitOptions: {
          timestamp: 0,
        },
        containerCache,
      },
    );
    await rootBuilder.executeStep([
      pacmanInstall(["linux", "dracut", "systemd-ukify"], {
        pacmanCache,
      }),
      pacmanRemovePacman([], logger),
      rmFiles(["/var", "/boot"]),
      addFiles({
        "etc/fstab": new MemFile({
          content: "tmpfs /var tmpfs defaults,size=1g 0 0",
        }),
        "etc/machine-id": new MemFile({
          content: "dfeaf88c031662725e1c2417ca30d84a",
        }),
        "usr/lib/systemd/system/buildahckertest.service": new MemFile({
          content: `[Unit]
Description=Buildahcker test result

[Service]
Type=oneshot
StandardOutput=journal+console
ExecStart=echo BUILDAHCKER-TEST-SUCCESS
ExecStart=sleep 3
ExecStart=systemctl poweroff

[Install]
WantedBy=multi-user.target
`,
          mode: 0o755,
        }),
        var: new MemDirectory(),
        boot: new MemDirectory(),
      }),
      run(["systemctl", "enable", "buildahckertest"]),
    ]);

    const imageBuilder = rootBuilder.clone();
    await imageBuilder.executeStep([
      mkerofsStep({
        inputFolder: ".",
        outputFile: "/rootfs.img",
        metadataFile: "/rootfs.json",
        veritySetup: {
          apkCache,
          containerCache,
          logger,
        },
        apkCache,
        containerCache,
        logger,
      }),
      veritytab({
        volumes: [
          {
            name: "rootfs",
            metadataFile: "/rootfs.json",
          },
        ],
      }),
      dracut({
        outputFile: "/initrd.img",
        addModules: ["systemd-veritysetup"],
        installFiles: ["/etc/veritytab"],
      }),
      ukify({
        outputFile: "/boot.efi",
        initrd: "/initrd.img",
        cmdline: "root=/dev/mapper/rootfs console=ttyS0",
      }),
    ]);

    await useFilesInImages(async (getFile) => {
      const apkPackages = ["qemu-system-x86_64", "ovmf"];
      const result = await prepareApkPackagesAndRun({
        apkPackages,
        command: [
          "qemu-system-x86_64",
          "-m",
          "1G",
          "-drive",
          "if=pflash,format=raw,unit=0,file=/usr/share/ovmf/bios.bin,readonly=on",
          "-object",
          "rng-random,id=rng0,filename=/dev/urandom",
          "-device",
          "virtio-rng-pci,rng=rng0",
          "-netdev",
          "user,id=net0,net=192.168.88.0/24,tftp=./,bootfile=boot.efi",
          "-device",
          "virtio-net-pci,netdev=net0",
          "-drive",
          "format=raw,file=/disk.img,if=virtio",
          "-nographic",
          "-boot",
          "order=n",
        ],
        buildahRunOptions: [
          "-v",
          `${await getFile({ imageId: imageBuilder.imageId, file: "/rootfs.img" })}:/disk.img`,
          "-v",
          `${await getFile({ imageId: imageBuilder.imageId, file: "/boot.efi" })}:/boot.efi`,
        ],
        apkCache,
        containerCache,
        logger,
      });
      expect(
        stripVTControlCharacters(result.stdout.toString("utf8")),
      ).toContain("BUILDAHCKER-TEST-SUCCESS");
    });
  },
);
