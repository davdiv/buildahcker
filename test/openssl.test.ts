import { join } from "path";
import { it } from "vitest";
import { exec } from "../src";
import { mkcert } from "../src/alpine/openssl";
import {
  apkCache,
  checkNonEmptyFileExists,
  containerCache,
  logger,
  tempFolder,
} from "./testUtils";

it("mkcert should succeed", { timeout: 30000 }, async () => {
  await exec(["buildah", "pull", "alpine"], { logger });
  const outputFile = join(tempFolder, "certificate.pem");
  const keyFile = join(tempFolder, "key.pem");

  await mkcert({
    certificateFile: outputFile,
    keyFile,
    options: {
      subject: "/CN=localhost",
      validDays: 365,
    },
    apkCache,
    containerCache,
    logger,
  });

  await checkNonEmptyFileExists(outputFile);
  await checkNonEmptyFileExists(keyFile);
});
