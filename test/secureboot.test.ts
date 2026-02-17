import { readFile } from "fs/promises";
import { join } from "path";
import { expect, it } from "vitest";
import { exec } from "../src";
import { secureBoot } from "../src/alpine/secureboot";
import { apkCache, containerCache, logger, tempFolder } from "./testUtils";

it(
  "secureBoot should create all required files",
  { timeout: 120000 },
  async () => {
    await exec(["buildah", "pull", "alpine"], { logger });
    const outputDirectory = join(tempFolder, "secureboot");

    const result = await secureBoot({
      outputDirectory,
      apkCache,
      containerCache,
      logger,
    });

    expect(await result.key.certificatePath()).toBe(
      join(outputDirectory, "db.crt"),
    );
    expect(await result.key.privateKeyPath()).toBe(
      join(outputDirectory, "db.key"),
    );
    expect(result.authFiles["PK.auth"].sourceFilePath).toBe(
      join(outputDirectory, "PK.auth"),
    );
    expect(result.authFiles["KEK.auth"].sourceFilePath).toBe(
      join(outputDirectory, "KEK.auth"),
    );
    expect(result.authFiles["db.auth"].sourceFilePath).toBe(
      join(outputDirectory, "db.auth"),
    );

    const files: Record<string, Buffer> = {};
    for (const type of ["db", "KEK", "PK"]) {
      for (const extension of ["crt", "key", "esl", "auth"]) {
        const filePath = join(outputDirectory, `${type}.${extension}`);
        const content = await readFile(filePath);
        files[filePath] = content;
        expect(content.length).toBeGreaterThan(100);
      }
    }

    const secondResult = await secureBoot({
      outputDirectory,
      apkCache,
      containerCache,
      logger,
    });

    expect(secondResult).toEqual(result);

    for (const type of ["db", "KEK", "PK"]) {
      for (const extension of ["crt", "key", "esl", "auth"]) {
        const filePath = join(outputDirectory, `${type}.${extension}`);
        const content = await readFile(filePath);
        expect(content).toEqual(files[filePath]);
      }
    }
  },
);
