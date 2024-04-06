import { truncate } from "fs/promises";
import type { Writable } from "stream";
import type { ImageOrContainer } from "../../container";
import type { ContainerCache } from "../../containerCache";
import { prepareOutputFile } from "../fileUtils";
import { prepareApkPackagesAndRun } from "../prepareApkPackages";
import type { OffsetAndSize } from "./writePartitions";

export enum PartitionType {
  EfiSystem = "C12A7328-F81F-11D2-BA4B-00A0C93EC93B",
  BiosBoot = "21686148-6449-6E6F-744E-656564454649",
  LinuxData = "0FC63DAF-8483-4772-8E79-3D69D8477DE4",
}

export interface Partition {
  size: number;
  name: string;
  type: PartitionType;
}

export interface PartedOptions {
  outputFile: string;
  partitions: Partition[];
  partedSource?: ImageOrContainer;
  containerCache?: ContainerCache;
  apkCache?: string;
  logger?: Writable;
}

export const parted = async (config: PartedOptions) => {
  const offsets: OffsetAndSize[] = [];
  const sectorSize = 512; // bytes
  const gptTableSize = 2048; // sectors
  let size = gptTableSize; // sectors
  const cmdLine = ["-s", "/out", "unit", "s", "mklabel", "gpt"];
  let partitionNumber = 0;
  for (const partition of config.partitions) {
    partitionNumber++;
    const begin = size;
    const partitionSize = Math.ceil(partition.size / sectorSize / 2048) * 2048;
    size += partitionSize;
    offsets.push({
      offset: begin * sectorSize,
      size: partitionSize * sectorSize,
    });
    cmdLine.push("mkpart", partition.name, `${begin}`, `${size - 1}`);
    cmdLine.push("type", `${partitionNumber}`, partition.type);
  }
  cmdLine.push("print");
  size += gptTableSize;

  const outputFile = await prepareOutputFile(config.outputFile);
  await truncate(outputFile, size * sectorSize);
  await prepareApkPackagesAndRun({
    apkPackages: ["parted"],
    existingSource: config.partedSource,
    command: ["parted", ...cmdLine],
    buildahRunOptions: ["-v", `${outputFile}:/out:rw`],
    containerCache: config.containerCache,
    apkCache: config.apkCache,
    logger: config.logger,
  });
  return offsets;
};
