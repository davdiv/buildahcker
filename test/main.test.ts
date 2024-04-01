import { lstat, readFile } from "fs/promises";
import { join } from "path";
import { expect, it } from "vitest";
import {
  DiskLocation,
  ImageBuilder,
  MemDirectory,
  MemFile,
  MemSymLink,
  addFiles,
  exec,
  rmFiles,
  run,
  temporaryContainer,
} from "../src";
import { containerCache, logger, statFileInImage } from "./testUtils";

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
        containerCache,
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
    await temporaryContainer(
      result,
      async (container) => {
        const mountPath = await container.mount();
        const indexInMount = join(mountPath, "app", "index.ts");
        expect(await readFile(indexInMount, "utf8")).toBe(
          await readFile(join(srcDir, "index.ts"), "utf8"),
        );
        expect(await lstat(indexInMount)).toMatchObject({ uid: 1, gid: 2 });
        expect(await readFile(join(mountPath, "etc", "issue"), "utf8")).toBe(
          "Hello",
        );
      },
      { logger },
    );
  },
);

it("should work to remove a file passing through a link", async () => {
  const builder = await ImageBuilder.from("scratch", {
    logger,
    containerCache,
  });
  await builder.executeStep([
    addFiles({
      bin: new MemDirectory(),
      "bin/echo": new MemFile({ content: "echo" }),
      mylink: new MemSymLink({ content: "/bin" }),
    }),
    rmFiles(["mylink/echo"]),
  ]);
  expect(await statFileInImage(builder.imageId, "mylink/echo")).toBe(null);
});

it("should work to remove a symbolic link", async () => {
  async function createImage() {
    const builder = await ImageBuilder.from("scratch", {
      logger,
      containerCache,
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
