import crc32 from "crc/crc32";
import { randomUUID } from "crypto";
import { truncate } from "fs/promises";
import { prepareOutputFile } from "../../fileUtils";
import type { OffsetAndSize, PartitionConfig } from "./writePartitions";
import { writePartitions } from "./writePartitions";

export enum PartitionType {
  EfiSystem = "C12A7328-F81F-11D2-BA4B-00A0C93EC93B",
  BiosBoot = "21686148-6449-6E6F-744E-656564454649",
  LinuxData = "0FC63DAF-8483-4772-8E79-3D69D8477DE4",
}

export interface Partition {
  size: number;
  name: string;
  type: PartitionType;
  guid?: string;
}

export interface PartedOptions {
  outputFile: string;
  guid?: string;
  partitions: Partition[];
}

const copyGuid = (guid: string, outputBuffer: Buffer, offest: number) => {
  const typeBuffer = Buffer.from(guid.replaceAll("-", ""), "hex");
  if (typeBuffer.length != 16) {
    throw new Error(`Invalid GUID: ${guid}`);
  }
  typeBuffer.copy(outputBuffer, offest);
};

export const parted = async (config: PartedOptions) => {
  // cf https://wiki.osdev.org/GPT or https://en.wikipedia.org/wiki/GUID_Partition_Table
  const offsets: OffsetAndSize[] = [];
  const sectorSize = 512; // bytes
  const maxPartitions = 128;
  const partitionEntrySize = 16 + 16 + 8 + 8 + 8 + 72;
  const gptTableSize = Math.ceil(
    (sectorSize + sectorSize + maxPartitions * partitionEntrySize) / sectorSize,
  ); // sectors
  const partitionsBuffer = Buffer.alloc(maxPartitions * partitionEntrySize);
  let size = gptTableSize; // sectors
  let partitionNumber = 0;
  for (const partition of config.partitions) {
    const begin = size;
    const partitionSize = Math.ceil(partition.size / sectorSize / 2048) * 2048;
    size += partitionSize;
    offsets.push({
      offset: begin * sectorSize,
      size: partitionSize * sectorSize,
    });
    const partitionEntry = Buffer.alloc(partitionEntrySize);
    copyGuid(partition.type, partitionEntry, 0);
    copyGuid(partition.guid ?? randomUUID(), partitionEntry, 0x10);
    partitionEntry.writeBigInt64LE(BigInt(begin), 0x20);
    partitionEntry.writeBigInt64LE(BigInt(begin + partitionSize - 1), 0x28);
    partitionEntry.write(partition.name, 0x38, 72, "utf-16le");
    partitionEntry.copy(partitionsBuffer, partitionNumber * partitionEntrySize);
    partitionNumber++;
  }
  size += gptTableSize;

  const outputFile = await prepareOutputFile(config.outputFile);
  await truncate(outputFile, size * sectorSize);
  const partitionTable: PartitionConfig[] = [];
  const protectiveMBR = Buffer.alloc(sectorSize);
  protectiveMBR.write("000200", 0x1be + 1, "hex"); // CHS Address of partition start // TODO: check this is the correct value?
  protectiveMBR.writeUInt8(0xee, 0x1be + 0x4); // Partition type: GPT protective
  protectiveMBR.write("FFFFFF", 0x1be + 1, "hex"); // CHS address of last GPT protective partition sector // TODO: compute the correct value?
  protectiveMBR.writeUint32LE(1, 0x1be + 0x8); // LBA of GPT protective partition start
  protectiveMBR.writeUint32LE(Math.min(0xffffffff, size - 1), 0x1be + 0xc); // Number of sectors in GPT protective partition
  protectiveMBR.writeUint8(0x55, 0x1fe);
  protectiveMBR.writeUint8(0xaa, 0x1ff);
  const headerAddress = 1;
  const altHeaderAddress = size - 1;
  const partitionsEntriesAddress = 2;
  const altPartitionsEntriesAddress = size - gptTableSize;
  const partitionTableHeader = Buffer.alloc(sectorSize);
  partitionTableHeader.write("EFI PART", 0, "ascii");
  partitionTableHeader.write("00000100", 8, "hex"); // version 1.0
  partitionTableHeader.writeUInt32LE(0x5c, 0xc); // version 1.0
  partitionTableHeader.writeBigUInt64LE(BigInt(headerAddress), 0x18);
  partitionTableHeader.writeBigUInt64LE(BigInt(altHeaderAddress), 0x20);
  partitionTableHeader.writeBigUInt64LE(BigInt(gptTableSize), 0x28);
  partitionTableHeader.writeBigUInt64LE(
    BigInt(altPartitionsEntriesAddress - 1),
    0x30,
  );
  copyGuid(config.guid ?? randomUUID(), partitionTableHeader, 0x38);
  partitionTableHeader.writeBigUInt64LE(BigInt(partitionsEntriesAddress), 0x48);
  partitionTableHeader.writeUInt32LE(maxPartitions, 0x50);
  partitionTableHeader.writeUInt32LE(partitionEntrySize, 0x54);
  partitionTableHeader.writeUInt32LE(crc32(partitionsBuffer), 0x58);
  partitionTableHeader.writeUint32LE(
    crc32(partitionTableHeader.subarray(0, 0x5c)),
    0x10,
  );
  const altPartitionTableHeader = Buffer.from(partitionTableHeader);
  altPartitionTableHeader.writeBigUInt64LE(BigInt(altHeaderAddress), 0x18);
  altPartitionTableHeader.writeBigUInt64LE(BigInt(headerAddress), 0x20);
  altPartitionTableHeader.writeBigUInt64LE(
    BigInt(altPartitionsEntriesAddress),
    0x48,
  );
  altPartitionTableHeader.writeUint32LE(0, 0x10);
  altPartitionTableHeader.writeUint32LE(
    crc32(altPartitionTableHeader.subarray(0, 0x5c)),
    0x10,
  );
  partitionTable.push(
    {
      inputBuffer: protectiveMBR,
      output: { offset: 0, size: protectiveMBR.length },
    },
    {
      inputBuffer: partitionTableHeader,
      output: {
        offset: headerAddress * sectorSize,
        size: partitionTableHeader.length,
      },
    },
    {
      inputBuffer: partitionsBuffer,
      output: {
        offset: partitionsEntriesAddress * sectorSize,
        size: partitionsBuffer.length,
      },
    },
    {
      inputBuffer: partitionsBuffer,
      output: {
        offset: altPartitionsEntriesAddress * sectorSize,
        size: partitionsBuffer.length,
      },
    },
    {
      inputBuffer: altPartitionTableHeader,
      output: {
        offset: altHeaderAddress * sectorSize,
        size: altPartitionTableHeader.length,
      },
    },
  );
  await writePartitions({
    outputFile,
    partitions: partitionTable,
  });
  return offsets;
};
