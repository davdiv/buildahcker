import { mkdtemp, rm } from "fs/promises";
import { join, relative, sep } from "path";
import type { ExecOptions } from "./exec";
import { exec } from "./exec";
import {
  resolveInContainer,
  resolveParentInContainer,
} from "./resolveInContainer";

export interface AtomicStep {
  (container: Container): Promise<void>;
  getCacheKey?(): Promise<string | undefined>;
}

export type Step = AtomicStep | Step[];

export interface StepExecutor {
  executeStep(step: Step): Promise<void>;
}

export interface ContainerOptions extends ExecOptions {}

export interface CommitOptions {
  timestamp?: number;
}

export class Container implements StepExecutor {
  #name: string | null = null;
  #mountPath: string | null = null;

  private constructor(
    name: string | null,
    public options?: ContainerOptions,
  ) {
    this.#name = name;
  }

  static async from(image: string, options?: ContainerOptions) {
    const output = await exec(["buildah", "from", image], options);
    const name = output.stdout.toString("utf8").trim() || null;
    if (!name) {
      throw new Error(`Failed to create a container from ${image}.`);
    }
    return new Container(name, options);
  }

  get name() {
    const res = this.#name;
    if (!res) {
      throw new Error("The container has been destroyed!");
    }
    return res;
  }

  get mountPath() {
    const res = this.#mountPath;
    if (!res) {
      throw new Error("The container is not mounted!");
    }
    return res;
  }

  async mount() {
    let res = this.#mountPath;
    if (!res) {
      const name = this.name;
      const output = await exec(["buildah", "mount", name], this.options);
      res = output.stdout.toString("utf8").trim() || null;
      if (!res) {
        throw new Error(`Could not mount container ${name}`);
      }
      this.#mountPath = res;
    }
    return res;
  }

  toPathInContainer(absolutePath: string) {
    const rel = relative(this.mountPath, absolutePath).split(sep);
    if (rel[0] === "..") {
      throw new Error("Path is not in container");
    }
    rel.unshift("");
    return rel.join(sep);
  }

  async tempFolder() {
    const tmp = await this.resolve("tmp");
    const tempFolder = await mkdtemp(join(tmp, "buildahcker-"));
    return {
      pathInHost: tempFolder,
      pathInContainer: this.toPathInContainer(tempFolder),
      remove: async () => {
        await rm(tempFolder, { recursive: true, force: true });
      },
    };
  }

  async resolve(subPath: string, strictDotDot?: boolean) {
    await this.mount();
    return await resolveInContainer(this.mountPath, subPath, strictDotDot);
  }

  async resolveParent(subPath: string, strictDotDot?: boolean) {
    await this.mount();
    return await resolveParentInContainer(
      this.mountPath,
      subPath,
      strictDotDot,
    );
  }

  async remove() {
    const backupName = this.#name;
    if (backupName) {
      this.#name = null;
      this.#mountPath = null;
      await exec(["buildah", "rm", backupName], this.options);
    }
  }

  async run(command: string[], buildahOptions: string[] = []) {
    return await exec(
      ["buildah", "run", ...buildahOptions, "--", this.name, ...command],
      this.options,
    );
  }

  async commit({ timestamp = Date.now() }: CommitOptions = {}) {
    return (
      await exec(
        [
          "buildah",
          "commit",
          "--timestamp",
          `${Math.round(timestamp / 1000)}`,
          this.name,
        ],
        this.options,
      )
    ).stdout
      .toString("utf8")
      .trim();
  }

  async executeStep(step: Step) {
    if (Array.isArray(step)) {
      for (const part of step) {
        await this.executeStep(part);
      }
    } else {
      await step(this);
    }
  }
}

export const temporaryContainer = async <T>(
  image: string,
  fn: (container: Container) => Promise<T>,
  containerOptions?: ContainerOptions,
) => {
  const container = await Container.from(image, containerOptions);
  try {
    return await fn(container);
  } finally {
    await container.remove();
  }
};

export type ImageOrContainer = Container | string;

export const withImageOrContainer = async <T>(
  source: ImageOrContainer,
  fn: (container: Container) => Promise<T>,
  containerOptions?: ContainerOptions,
) => {
  if (typeof source === "string") {
    return await temporaryContainer(source, fn, containerOptions);
  }
  return await fn(source);
};

export const runInImageOrContainer = async ({
  source,
  command,
  buildahRunOptions,
  ...containerOptions
}: {
  source: ImageOrContainer;
  command: string[];
  buildahRunOptions?: string[];
} & ContainerOptions) =>
  await withImageOrContainer(
    source,
    async (container) => await container.run(command, buildahRunOptions),
    containerOptions,
  );
