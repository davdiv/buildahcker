import { lstat, mkdir, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { beforeEach, expect, it } from "vitest";
import {
  Container,
  FileSystemCache,
  ImageBuilder,
  WritableBuffer,
  exec,
} from "../src";
import { apkAdd, apkRemoveApk } from "../src/alpine";
import { safelyJoinSubpath } from "../src/steps/files/paths";

let tempFolder: string;
beforeEach(async () => {
  const folder = await mkdtemp(join(tmpdir(), "buildahcker-test-"));
  tempFolder = folder;

  return async () => {
    await rm(folder, { recursive: true });
  };
});

let logger: WritableBuffer;
beforeEach(() => {
  const buffer = new WritableBuffer();
  logger = buffer;
  return async () => {
    buffer.end();
    console.log((await buffer.promise).toString("utf8"));
  };
});

const statFileInImage = async (imageId: string, path: string) => {
  const container = await Container.from(imageId, { logger });
  try {
    await container.mount();
    const fullPath = await safelyJoinSubpath(
      container.mountPath,
      path,
      true,
      false,
    );
    try {
      return await lstat(fullPath);
    } catch (e: any) {
      if (e.code === "ENOENT") {
        return null;
      }
      throw e;
    }
  } finally {
    await container.remove();
  }
};

it(
  "should work to add then remove packages",
  {
    timeout: 120000,
  },
  async () => {
    const baseImage = "alpine:latest";
    const cache = new FileSystemCache(join(tempFolder, "containers-cache"));
    const apkCache = join(tempFolder, "apk-cache");
    await mkdir(apkCache, { recursive: true });

    async function createImage() {
      const builder = await ImageBuilder.from(baseImage, {
        logger,
        cache,
      });
      await builder.executeStep(
        apkAdd(["linux-lts", "linux-firmware-none"], {
          cache: apkCache,
        }),
      );
      expect(
        (await statFileInImage(builder.imageId, "/sbin/mkinitfs"))?.isFile(),
      ).toBe(true);
      await builder.executeStep(apkRemoveApk(["mkinitfs"]));
      return builder.imageId;
    }
    await exec(["buildah", "pull", baseImage], { logger });

    const image1 = await createImage();
    expect(await statFileInImage(image1, "/sbin/mkinitfs")).toBe(null);
    const image2 = await createImage();
    expect(image1).toEqual(image2);
  },
);
