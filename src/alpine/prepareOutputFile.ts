import { mkdir, writeFile } from "fs/promises";
import { dirname, resolve } from "path";

export const prepareOutputFile = async (outputFile: string) => {
  outputFile = resolve(outputFile);
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, "");
  return outputFile;
};
