import { createHash } from "crypto";
import type { AtomicStep, Container } from "../container";

export interface RunOptions {
  beforeRun?: (
    container: Container,
    command: string[],
  ) => void | string[] | Promise<void | string[]>;
  buildahArgs?: string[];
  buildahArgsNoHash?: string[];
  extraHashData?: string[];
}

export const run = (command: string[], options?: RunOptions) => {
  const step: AtomicStep = async (container) => {
    let updatedCommand = [...command];
    updatedCommand =
      (await options?.beforeRun?.(container, updatedCommand)) ?? updatedCommand;
    await container.run(updatedCommand, [
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
