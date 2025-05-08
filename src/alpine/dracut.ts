import { mkdir, readdir } from "fs/promises";
import { run } from "../steps";

export interface DracutOptions {
  outputFile: string;
  addModules?: string[];
  installFiles?: string[];
  extraOptions?: string[];
}

export const dracut = ({
  outputFile,
  addModules,
  installFiles,
  extraOptions = [],
}: DracutOptions) => {
  const command = ["dracut", outputFile, "--no-hostonly"];
  addModules?.forEach((module) => {
    command.push("--add", module);
  });
  installFiles?.forEach((file) => {
    command.push("--install", file);
  });
  command.push(...extraOptions);
  return run(command, {
    extraHashData: ["--kver", "AUTOKERNELVERSION"],
    async beforeRun(container, command) {
      await mkdir(await container.resolve("var/tmp"), { recursive: true });
      const kernelVersions = await readdir(
        await container.resolve("lib/modules"),
      );
      if (kernelVersions.length != 1) {
        throw new Error(
          `Expected exactly one kernel version in lib/modules, found: ${kernelVersions.join(
            ", ",
          )}`,
        );
      }
      command.push("--kver", kernelVersions[0]);
    },
  });
};
