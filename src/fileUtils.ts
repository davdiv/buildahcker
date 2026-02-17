import { close, open, read } from "fs";
import { mkdir, readdir, readFile, rmdir, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { promisify } from "util";

export const removeIfEmpty = async (directory: string) => {
  try {
    const content = await readdir(directory);
    if (content.length === 0) {
      await rmdir(directory);
    }
  } catch (e: any) {
    if (e.code !== "ENOENT") {
      throw e;
    }
  }
};

export const readOrCreateFile = async (
  filePath: string,
  defaultContent: () => Buffer | Promise<Buffer>,
): Promise<Buffer> => {
  try {
    return await readFile(filePath);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      const content = await defaultContent();
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, content);
      return content;
    }
    throw error;
  }
};

export const readOrCreateStringFile = async (
  filePath: string,
  defaultContent: () => string | Promise<string>,
  encoding?: BufferEncoding,
): Promise<string> =>
  (
    await readOrCreateFile(filePath, async () =>
      Buffer.from(await defaultContent(), encoding),
    )
  ).toString(encoding);

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
