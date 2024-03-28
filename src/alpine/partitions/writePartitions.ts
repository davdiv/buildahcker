import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { closeFile, openFile } from "../fileUtils";

export interface OffsetAndSize {
  offset: number;
  size: number;
}

export interface PartitionConfigFromFile {
  inputFile: string;
  input?: OffsetAndSize;
  output: OffsetAndSize;
}

export interface PartitionConfigFromBuffer {
  inputBuffer: Buffer;
  output: OffsetAndSize;
}

export type PartitionConfig =
  | PartitionConfigFromBuffer
  | PartitionConfigFromFile;

export interface WritePartitionsOptions {
  outputFile: string | number;
  partitions: PartitionConfig[];
}

export const writePartitions = async (config: WritePartitionsOptions) => {
  const pathOrFd = config.outputFile;
  const fd = await openFile(pathOrFd, "r+");
  try {
    for (const partition of config.partitions) {
      const outputStream = createWriteStream("", {
        fd,
        start: partition.output.offset,
        autoClose: false,
      });
      if ("inputFile" in partition) {
        const inputStart = partition.input?.offset ?? 0;
        const inputStream = createReadStream(partition.inputFile, {
          start: inputStart,
          end:
            inputStart +
            Math.min(partition.output.size, partition.input?.size ?? Infinity),
          autoClose: false,
        });
        try {
          await pipeline(inputStream, outputStream);
        } finally {
          await inputStream.close();
        }
      } else {
        await new Promise<void>((resolve, reject) =>
          outputStream.write(
            partition.inputBuffer.subarray(
              0,
              Math.min(partition.output.size, partition.inputBuffer.length),
            ),
            (error) => (error ? reject(error) : resolve()),
          ),
        );
      }
    }
  } finally {
    await closeFile(fd, pathOrFd);
  }
};
