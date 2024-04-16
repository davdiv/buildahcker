import { cp } from "fs/promises";
import type { ContainerOptions } from "./container";
import { Container } from "./container";
import { prepareOutputFile } from "./fileUtils";

export interface FileInImage {
  imageId: string;
  file: string;
}

export const useFilesInImages = async <T>(
  fn: (getFile: (file: FileInImage | string) => Promise<string>) => Promise<T>,
  containerOptions?: ContainerOptions,
): Promise<T> => {
  const containerMap = new Map<string, Container>();
  try {
    return await fn(async (file) => {
      if (typeof file != "string") {
        let container = containerMap.get(file.imageId);
        if (!container) {
          container = await Container.from(file.imageId, containerOptions);
          containerMap.set(file.imageId, container);
        }
        file = await container.resolve(file.file);
      }
      return file;
    });
  } finally {
    for (const container of containerMap.values()) {
      await container.remove();
    }
  }
};

export const copyFileInImage = async (
  inputFile: FileInImage | string,
  outputFile: string,
) => {
  outputFile = await prepareOutputFile(outputFile);
  await useFilesInImages(async (getFile) => {
    await cp(await getFile(inputFile), outputFile);
  });
};
