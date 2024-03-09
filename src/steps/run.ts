import { createHash } from "crypto";
import { AtomicStep } from "../container";

export const run = (command: string[]) => {
  const step: AtomicStep = async (container) => {
    await container.run(command);
  };
  step.getCacheKey = async () => {
    const hash = createHash("sha256");
    hash.update(JSON.stringify(command));
    return `RUN-${hash.digest("base64url")}`;
  };
  return step;
};
