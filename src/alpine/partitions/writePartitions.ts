import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { closeFile, openFile } from "../../fileUtils";
import { stat } from "fs/promises";

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
        const inputSize =
          partition.input?.size ??
          (await stat(partition.inputFile)).size - inputStart;
        if (inputSize > partition.output.size) {
          throw new Error(
            `Partition too small for content: ${inputSize} > ${partition.output.size}`,
          );
        }
        const inputStream = createReadStream(partition.inputFile, {
          start: inputStart,
          end: inputStart + inputSize,
          autoClose: false,
        });
        try {
          await pipeline(inputStream, outputStream);
        } finally {
          await inputStream.close();
        }
      } else {
        if (partition.inputBuffer.length > partition.output.size) {
          throw new Error(
            `Partition too small for content: ${partition.inputBuffer.length} > ${partition.output.size}`,
          );
        }
        await new Promise<void>((resolve, reject) =>
          outputStream.write(partition.inputBuffer, (error) =>
            error ? reject(error) : resolve(),
          ),
        );
      }
    }
  } finally {
    await closeFile(fd, pathOrFd);
  }
};
