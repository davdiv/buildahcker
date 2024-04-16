import { readFile } from "fs/promises";
import { closeFile, openFile, readFromFile } from "../../fileUtils";
import type { OffsetAndSize } from "../partitions";
import { writePartitions } from "../partitions";

const GRUB_DISK_SECTOR_SIZE = 0x200;
const GRUB_DISK_SECTOR_BITS = 9;
const GRUB_BOOT_MACHINE_BPB_START = 0x3;
const GRUB_BOOT_MACHINE_BPB_END = 0x5a;
const GRUB_BOOT_MACHINE_KERNEL_SECTOR = 0x5c;
const GRUB_BOOT_MACHINE_PART_START = 0x1b8;
const GRUB_BOOT_MACHINE_PART_END = 0x1fe;
const GRUB_BOOT_MACHINE_DRIVE_CHECK = 0x66;
const BLOCK_SIZE = 12;
const FIRST_BLOCK_OFFSET = GRUB_DISK_SECTOR_SIZE - BLOCK_SIZE;
const SECOND_BLOCK_OFFSET = FIRST_BLOCK_OFFSET - BLOCK_SIZE;
const GRUB_BOOT_I386_PC_KERNEL_SEG = 0x800;

export interface GrubBiosSetupOptions {
  imageFile: string | number;
  partition: OffsetAndSize;
  bootFile: string;
  coreFile: string;
}

const writeBlockStart = (
  memory: Buffer,
  blockListOffset: number,
  start: bigint,
) => memory.writeBigUint64LE(start, blockListOffset);
const writeBlockLen = (memory: Buffer, blockListOffset: number, len: number) =>
  memory.writeUint16LE(len, blockListOffset + 8);
const writeBlockSegment = (
  memory: Buffer,
  blockListOffset: number,
  segment: number,
) => memory.writeUint16LE(segment, blockListOffset + 10);

export const grubBiosSetup = async (options: GrubBiosSetupOptions) => {
  const imageFile = options.imageFile;
  const fd = await openFile(imageFile, "r+");
  try {
    const existingBootSector = await readFromFile(fd, 0, GRUB_DISK_SECTOR_SIZE);
    const bootSector = await readFile(options.bootFile);
    let coreFile = await readFile(options.coreFile);

    if (bootSector.length !== GRUB_DISK_SECTOR_SIZE) {
      throw new Error(
        `The boot file should have a size of ${GRUB_DISK_SECTOR_SIZE} bytes.`,
      );
    }

    const extraCoreFileLength = coreFile.length % GRUB_DISK_SECTOR_SIZE;
    if (extraCoreFileLength !== 0) {
      coreFile = Buffer.concat([
        coreFile,
        Buffer.alloc(GRUB_DISK_SECTOR_SIZE - extraCoreFileLength),
      ]);
    }

    // Copy the possible DOS BPB
    existingBootSector.copy(
      bootSector,
      GRUB_BOOT_MACHINE_BPB_START,
      GRUB_BOOT_MACHINE_BPB_START,
      GRUB_BOOT_MACHINE_BPB_END,
    );

    // Copy the partition table
    existingBootSector.copy(
      bootSector,
      GRUB_BOOT_MACHINE_PART_START,
      GRUB_BOOT_MACHINE_PART_START,
      GRUB_BOOT_MACHINE_PART_END,
    );

    const firstSector = BigInt(
      options.partition.offset >> GRUB_DISK_SECTOR_BITS,
    );

    // Write position of grub core in boot sector:
    bootSector.writeBigUint64LE(firstSector, GRUB_BOOT_MACHINE_KERNEL_SECTOR);

    // workaround for some buggy bios:
    bootSector.writeUInt8(0x90, GRUB_BOOT_MACHINE_DRIVE_CHECK);
    bootSector.writeUInt8(0x90, GRUB_BOOT_MACHINE_DRIVE_CHECK + 1);

    writeBlockStart(coreFile, FIRST_BLOCK_OFFSET, firstSector + 1n);
    writeBlockLen(
      coreFile,
      FIRST_BLOCK_OFFSET,
      (coreFile.length >> GRUB_DISK_SECTOR_BITS) - 1,
    );
    writeBlockSegment(
      coreFile,
      FIRST_BLOCK_OFFSET,
      GRUB_BOOT_I386_PC_KERNEL_SEG + (GRUB_DISK_SECTOR_SIZE >> 4),
    );
    writeBlockStart(coreFile, SECOND_BLOCK_OFFSET, 0n);
    writeBlockLen(coreFile, SECOND_BLOCK_OFFSET, 0);
    writeBlockSegment(coreFile, SECOND_BLOCK_OFFSET, 0);

    await writePartitions({
      outputFile: fd,
      partitions: [
        {
          inputBuffer: bootSector,
          output: { offset: 0, size: GRUB_DISK_SECTOR_SIZE },
        },
        {
          inputBuffer: coreFile,
          output: options.partition,
        },
      ],
    });
  } finally {
    await closeFile(fd, imageFile);
  }
};
