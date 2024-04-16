import type { Writable } from "stream";
import type { ImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import type { FileInImage } from "../../fileInImage";
import { ImageBuilder } from "../../imageBuilder";
import { MemFile, addFiles } from "../../steps";
import { mksquashfsStep } from "../mksquashfs";

export interface ABPartitionsRootPartitionOptions {
  kernelCmdline?: string;
  rootPartitionGrubCfg?: string;
  sourceRootImage: string;
  sourceRootInitrdPath?: string;
  sourceRootKernelPath?: string;
  squashfsToolsSource?: ImageOrContainer;
  updateToolPath?: string;
  apkCache?: string;
  containerCache?: ContainerCache;
  logger?: Writable;
}

export const abpartitionsRootPartition = async ({
  kernelCmdline,
  rootPartitionGrubCfg = "/boot/grub.cfg",
  sourceRootImage,
  sourceRootInitrdPath = "/boot/initramfs-lts",
  sourceRootKernelPath = "/boot/vmlinuz-lts",
  squashfsToolsSource,
  updateToolPath = "/sbin/buildahckerABTool",
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
      [rootPartitionGrubCfg]: new MemFile({
        content: `linux ${sourceRootKernelPath} $buildahcker_params${kernelCmdline ? ` ${kernelCmdline}` : ""}${sourceRootInitrdPath ? `\ninitrd ${sourceRootInitrdPath}` : ""}\n`,
      }),
      [updateToolPath]: new MemFile({
        content: `#!/bin/sh
set -e

function readCmdline() {
  cat /proc/cmdline | sed -nE 's/^.*[[:space:]]'"$1"'=([^[:space:]]*)([[:space:]]|$).*$/\\1/p'
}

BUILDHACKER_CURRENT="$(readCmdline buildahcker_current)"
BUILDHACKER_CURRENT_ROOT="$(readCmdline root)"
BUILDHACKER_OTHER_ROOT="$(readCmdline buildahcker_other_root)"
BUILDHACKER_GRUBENV="$(readCmdline buildahcker_grubenv)"
BUILDHACKER_GRUBENV_DEVICE="$(readCmdline buildahcker_grubenv_device)"

if [ -z "$BUILDHACKER_CURRENT" ] || [ -z "$BUILDHACKER_OTHER_ROOT" ] || [ -z "$BUILDHACKER_GRUBENV" ] || [ -z "$BUILDHACKER_GRUBENV_DEVICE" ] ; then
  echo Not running in expected buildahcker A/B partition environment.
  exit 1
fi

case "$BUILDHACKER_CURRENT" in
  'a')
    BUILDHACKER_OTHER=b
  ;;
  'b')
    BUILDHACKER_OTHER=a
  ;;
  *)
    echo Invalid buildahcker_current value: $BUILDHACKER_CURRENT
    exit 1
  ;;
esac

mkdir -p /run/buildahcker-ab-grubenv
if ! mountpoint /run/buildahcker-ab-grubenv &> /dev/null ; then
  mount -o ro -t vfat $BUILDHACKER_GRUBENV_DEVICE /run/buildahcker-ab-grubenv
fi

function readGrubenv() {
  grub-editenv "/run/buildahcker-ab-grubenv$BUILDHACKER_GRUBENV" list | sed -nE 's/(^.*[[:space:]]|^)'"$1"'=([^[:space:]]*)([[:space:]]|$).*$/\\2/p'
}

function updateGrubenv() {
  mount -o remount,rw /run/buildahcker-ab-grubenv
  grub-editenv "/run/buildahcker-ab-grubenv$BUILDHACKER_GRUBENV" set "$@"
  mount -o remount,ro /run/buildahcker-ab-grubenv
}

BUILDAHCKER_STABLE=$(readGrubenv buildahcker_stable)
BUILDAHCKER_NEW=$(readGrubenv buildahcker_new)

case "$*" in
  'show' | '')
    echo Current: "$BUILDHACKER_CURRENT"
    echo Current root: "$BUILDHACKER_CURRENT_ROOT"
    echo Other: "$BUILDHACKER_OTHER"
    echo Other root: "$BUILDHACKER_OTHER_ROOT"
    echo Stable: "$BUILDAHCKER_STABLE"
    if [ "$BUILDAHCKER_STABLE" != "$BUILDHACKER_CURRENT" ] ; then
      echo "Warning: current system is not marked as stable!"
    fi
    if [ "$BUILDAHCKER_NEW" != "n" ] ; then
      echo "Warning: next reboot will be on $BUILDAHCKER_NEW"
    fi
    ;;
  'update')
    if [ "$BUILDAHCKER_STABLE" != "$BUILDHACKER_CURRENT" ]; then
      echo Current system is not marked as stable!
      echo Updates should only be done from a stable system.
      echo Use mark-stable or reboot the system before updating.
      exit 1
    fi
    echo "Target partition: $BUILDHACKER_OTHER_ROOT"
    echo "Update in progress..."
    dd of="$BUILDHACKER_OTHER_ROOT"
    echo "Finished writing on $BUILDHACKER_OTHER_ROOT"
    updateGrubenv buildahcker_new=$BUILDHACKER_OTHER
    echo Next reboot will be on "$BUILDHACKER_OTHER"!
    echo To cancel, use cancel-update or run update with a different update.
    ;;
  'cancel-update')
    if [ "$BUILDAHCKER_NEW" != "n" ]; then
      updateGrubenv buildahcker_new=n
      echo Update cancelled, next reboot will be on "$BUILDHACKER_STABLE"
    else
      echo There is no update in progress.
    fi
    ;;
  'mark-stable')
    if [ "$BUILDAHCKER_STABLE" != "$BUILDHACKER_CURRENT" ]; then
      updateGrubenv buildahcker_stable=$BUILDHACKER_CURRENT
      echo "Current system successfully marked as stable."
    else
      echo "Current system was already marked as stable."
    fi
    ;;
  'reboot-if-unstable')
    if [ "$BUILDAHCKER_STABLE" != "$BUILDHACKER_CURRENT" ]; then
      echo "Current system is not marked as stable, rebooting..."
      reboot
    fi
    ;;
  *)
    echo Invalid command: "$*"
    exit 1
    ;;
esac
`,
        mode: 0o500,
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
