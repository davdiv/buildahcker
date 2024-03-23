import { createHash } from "crypto";
import { AtomicStep } from "../container";

export interface RunOptions {
  buildahArgs?: string[];
  buildahArgsNoHash?: string[];
  extraHashData?: string[];
}

export const run = (command: string[], options?: RunOptions) => {
  const step: AtomicStep = async (container) => {
    await container.run(command, [
      ...(options?.buildahArgs ?? []),
      ...(options?.buildahArgsNoHash ?? []),
    ]);
  };
  step.getCacheKey = async () => {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(command));
    hash.update(JSON.stringify(options?.buildahArgs ?? []));
    hash.update(JSON.stringify(options?.extraHashData ?? []));
    return `RUN-${hash.digest("base64url")}`;
  };
  return step;
};
