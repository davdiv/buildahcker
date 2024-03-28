import { close, open } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve } from "path";

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
