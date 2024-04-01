import { expect, it } from "vitest";
import { ImageBuilder, exec } from "../src";
import { apkAdd, apkRemoveApk } from "../src/alpine";
import { apkCache, containerCache, logger, statFileInImage } from "./testUtils";

it(
  "should work to add then remove packages",
  {
    timeout: 120000,
  },
  async () => {
    const baseImage = "alpine:latest";

    async function createImage() {
      const builder = await ImageBuilder.from(baseImage, {
        logger,
        containerCache,
      });
      await builder.executeStep(
        apkAdd(["linux-lts", "linux-firmware-none"], {
          apkCache,
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
