import { close, open, read } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { promisify } from "util";

export const prepareOutputFile = async (outputFile: string) => {
  outputFile = resolve(outputFile);
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, "");
  return outputFile;
};

export const openFile = async (pathOrFd: string | number, flags: string) =>
  typeof pathOrFd === "number"
    ? pathOrFd
    : await new Promise<number>((resolve, reject) =>
        open(pathOrFd, flags, (error, fd) =>
          error ? reject(error) : resolve(fd),
        ),
      );

export const closeFile = async (fd: number, pathOrFd: string | number) =>
  typeof pathOrFd === "number"
    ? undefined
    : new Promise((resolve) => close(fd, resolve));

const promisifiedRead = promisify(read);
export const readFromFile = async (
  fd: number,
  offset: number,
  length: number,
) => {
  const { buffer, bytesRead } = await promisifiedRead(fd, {
    buffer: Buffer.alloc(length),
    position: offset,
  });
  if (bytesRead !== length) {
    throw new Error(`Could not read ${bytesRead} bytes from file`);
  }
  return buffer;
};
