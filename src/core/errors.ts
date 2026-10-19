/** Why a buffer could not be read as a .blend file. */
export type BlendErrorCode = "NOT_BLEND" | "UNSUPPORTED" | "CORRUPT";

export class BlendError extends Error {
  constructor(
    readonly code: BlendErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BlendError";
  }
}
