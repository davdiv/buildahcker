# Buildahcker

[![npm](https://img.shields.io/npm/v/buildahcker)](https://www.npmjs.com/package/buildahcker)

Buildahcker is a node.js library to create OCI (Open Container Initiative) container images (or docker images), based on [Buildah](https://buildah.io/) and a hash-based cache.
Have a look to the [API documentation here](https://davdiv.github.io/buildahcker/modules.html).

## Installation

```bash
npm install buildahcker --save-dev
```

## Usage

```typescript
import {
  ImageBuilder,
  run,
  addFiles,
  MemFile,
  DiskLocation,
} from "buildahcker";

const createImage = async () => {
  const builder = await ImageBuilder.from("alpine:latest", {
    logger: process.stdout,
    cache: new FileSystemCache("buildahcker-cache"),
  });
  await builder.executeStep([
    run(["apk", "add", "--no-cache", "nginx"]),
    addFiles({
      "etc/issue": new MemFile({
        content: "Hello",
      }),
      app: new DiskLocation("./app", {
        overrideAttributes: { uid: 1, gid: 2 },
      }),
    }),
  ]);
  console.log("Created image: ", builder.imageId);
};

createImage();
```
