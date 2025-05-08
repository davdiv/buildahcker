import { readdir } from "fs/promises";
import { run } from "../steps";
import { type SbsignOptions, sbsignStep } from "./sbsign";

export interface UkifyOptions {
  outputFile: string;
  splash?: string;
  initrd?: string;
  cmdline?: string;
  sign?: Omit<SbsignOptions, "inputFile" | "outputFile">;
}

export const ukify = ({
  outputFile,
  splash,
  initrd,
  cmdline,
  sign,
}: UkifyOptions) => {
  const command = ["ukify", "build", `--output=${outputFile}`];
  if (splash) {
    command.push(`--splash=${splash}`);
  }
  if (initrd) {
    command.push(`--initrd=${initrd}`);
  }
  if (cmdline) {
    command.push(`--cmdline=${cmdline}`);
  }
  const steps = [
    run(command, {
      extraHashData: ["--linux=/lib/modules/AUTOKERNELVERSION/vmlinuz"],
      async beforeRun(container, command) {
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
        command.push(`--linux=/lib/modules/${kernelVersions[0]}/vmlinuz`);
      },
    }),
  ];
  if (sign) {
    steps.push(
      sbsignStep({
        inputFile: outputFile,
        outputFile,
        ...sign,
      }),
    );
  }
  return steps;
};
