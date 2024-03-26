import { lstat, mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { beforeEach, expect, it } from "vitest";
import {
  Container,
  DiskLocation,
  FSContainerCache,
  ImageBuilder,
  MemFile,
  MemSymLink,
  WritableBuffer,
  addFiles,
  exec,
  rmFiles,
  run,
} from "../src";

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

it(
  "should work for a simple container",
  {
    timeout: 15000,
  },
  async () => {
    const srcDir = join(__dirname, "..", "src");
    const baseImage = "alpine:latest";

    async function createImage() {
      const builder = await ImageBuilder.from(baseImage, {
        logger,
        containerCache: new FSContainerCache(tempFolder),
      });
      await builder.executeStep([
        run(["apk", "add", "--no-cache", "nginx"]),
        addFiles({
          "etc/issue": new MemFile({
            content: "Hello",
          }),
          app: new DiskLocation(srcDir, {
            overrideAttributes: { uid: 1, gid: 2 },
          }),
        }),
      ]);
      return builder.imageId;
    }
    await exec(["buildah", "pull", baseImage], { logger });
    const result = await createImage();
    const result2 = await createImage();
    expect(result).toBe(result2);
    const container = await Container.from(result);
    try {
      const mountPath = await container.mount();
      const indexInMount = join(mountPath, "app", "index.ts");
      expect(await readFile(indexInMount, "utf8")).toBe(
        await readFile(join(srcDir, "index.ts"), "utf8"),
      );
      expect(await lstat(indexInMount)).toMatchObject({ uid: 1, gid: 2 });
      expect(await readFile(join(mountPath, "etc", "issue"), "utf8")).toBe(
        "Hello",
      );
    } finally {
      await container.remove();
    }
  },
);

it("should throw when doing unsafe operations (rm)", async () => {
  const builder = await ImageBuilder.from("scratch", {
    logger,
    containerCache: new FSContainerCache(tempFolder),
  });
  await expect(async () => {
    await builder.executeStep([
      addFiles({ mylink: new MemSymLink({ content: "/bin" }) }),
      rmFiles(["mylink/echo"]),
    ]);
  }).rejects.toThrow("Unsafe path containing a symbolic link");
});

it("should work to remove a symbolic link", async () => {
  async function createImage() {
    const builder = await ImageBuilder.from("scratch", {
      logger,
      containerCache: new FSContainerCache(tempFolder),
    });
    await builder.executeStep([
      addFiles({ mylink: new MemSymLink({ content: "/bin" }) }),
      rmFiles(["mylink"]),
    ]);
    return builder.imageId;
  }
  const result = await createImage();
  const result2 = await createImage();
  expect(result).toBe(result2);
});
