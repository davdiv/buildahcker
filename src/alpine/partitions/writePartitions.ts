import { close, createReadStream, createWriteStream, open } from "fs";
import { pipeline } from "stream/promises";

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
  outputFile: string;
  partitions: PartitionConfig[];
}

export const writePartitions = async (config: WritePartitionsOptions) => {
  const outputFile = await new Promise<number>((resolve, reject) =>
    open(config.outputFile, "r+", (error, fd) =>
      error ? reject(error) : resolve(fd),
    ),
  );
  try {
    for (const partition of config.partitions) {
      const outputStream = createWriteStream("", {
        fd: outputFile,
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
    await new Promise((resolve) => close(outputFile, resolve));
  }
};
