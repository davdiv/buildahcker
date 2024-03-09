import { Cache } from "./cache";
import {
  CommitOptions,
  Container,
  ContainerOptions,
  Step,
  StepExecutor,
} from "./container";
import { getFullImageID } from "./inspect";

export interface ImageBuilderOptions extends ContainerOptions {
  cache?: Cache;
  commitOptions?: CommitOptions;
}

export class ImageBuilder implements StepExecutor {
  #imageId: string;

  private constructor(
    imageId: string,
    public options?: ImageBuilderOptions,
  ) {
    this.#imageId = imageId;
  }

  static async from(image: string, options?: ImageBuilderOptions) {
    const imageId = await getFullImageID(image, options);
    if (!imageId) {
      throw new Error(`Could not get information about image ${image}`);
    }
    return new ImageBuilder(imageId, options);
  }

  clone() {
    return new ImageBuilder(this.#imageId, this.options);
  }

  get imageId() {
    return this.#imageId;
  }

  async #executeStepInOneContainer(step: Step, fromImageId?: string) {
    const container = await Container.from(
      fromImageId ?? this.#imageId,
      this.options,
    );
    try {
      await container.executeStep(step);
      const res = await container.commit(this.options?.commitOptions);
      if (fromImageId) {
        this.#imageId = res;
      }
      return res;
    } finally {
      await container.remove();
    }
  }

  async executeStep(step: Step) {
    const cache = this.options?.cache;
    if (!cache) {
      await this.#executeStepInOneContainer(step);
      return;
    }
    if (Array.isArray(step)) {
      for (const part of step) {
        await this.executeStep(part);
      }
      return;
    }
    const imageId = this.#imageId;
    let newImageId: string | undefined;
    let operationCacheKey = await step.getCacheKey?.();
    if (operationCacheKey) {
      newImageId = await cache.getEntry(imageId, operationCacheKey);
      if (newImageId) {
        try {
          newImageId = await getFullImageID(newImageId, this.options);
        } catch {
          newImageId = undefined;
        }
      }
    }
    if (!newImageId) {
      newImageId = await this.#executeStepInOneContainer(step, imageId);
      if (operationCacheKey) {
        await cache.setEntry(imageId, operationCacheKey, newImageId);
      }
    }
    this.#imageId = newImageId;
  }
}
