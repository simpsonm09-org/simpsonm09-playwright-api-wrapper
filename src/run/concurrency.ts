import { ERROR_CODES, RunFailure } from "./errors.js";

/** Bounded concurrency with immediate rejection instead of queueing. */
export class ConcurrencyGate {
  private active = 0;

  constructor(private readonly max: number) {}

  tryAcquire(): (() => void) | undefined {
    if (this.active >= this.max) return undefined;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }

  acquire(): () => void {
    const release = this.tryAcquire();
    if (release === undefined) {
      throw new RunFailure(
        ERROR_CODES.CONCURRENCY_LIMIT,
        `Concurrency limit of ${this.max} reached`,
      );
    }
    return release;
  }

  get activeCount(): number {
    return this.active;
  }
}
