// Image textures for the 3D view: asks the host for image files a material names, decodes PNG, JPEG, WebP and the
// like with the browser and OpenEXR with three.js, and scales them down so 4K and 8K maps fit in GPU memory.
import * as THREE from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import type { ImageFileMessage, ReadImageMessage } from "../messages.ts";
import type { RenderTexture } from "./scene-model.ts";

/** Longest side of a decoded texture; larger images are scaled down. */
export const MAX_TEXTURE_SIZE = 2048;

/** Sends ReadImageMessages and matches the host's ImageFileMessage replies to them. */
export class ImageFileRequests {
  private nextRequestId = 1;
  private readonly pending = new Map<number, { resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void }>();

  constructor(private readonly postToHost: (message: ReadImageMessage) => void) {}

  read(filepath: string): Promise<Uint8Array> {
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.postToHost({ type: "readImage", requestId, filepath });
    });
  }

  handleReply(message: ImageFileMessage) {
    const request = this.pending.get(message.requestId);
    if (!request) return;
    this.pending.delete(message.requestId);
    if (message.bytes) request.resolve(asBytes(message.bytes));
    else request.reject(new Error(message.errorMessage ?? "the image could not be read"));
  }
}

const asBytes = (bytes: unknown) => (bytes instanceof Uint8Array ? bytes : new Uint8Array((bytes as ArrayBufferView).buffer, (bytes as ArrayBufferView).byteOffset, (bytes as ArrayBufferView).byteLength));

const isOpenExr = (bytes: Uint8Array) => bytes[0] === 0x76 && bytes[1] === 0x2f && bytes[2] === 0x31 && bytes[3] === 0x01;

/** Decodes image file bytes into a texture whose first row is the image's bottom row, as Blender's UVs expect. */
export async function decodeTexture(bytes: Uint8Array, texture: Pick<RenderTexture, "isColor" | "imageName">): Promise<THREE.Texture> {
  const decoded = isOpenExr(bytes) ? decodeOpenExr(bytes, texture.isColor) : await decodeWithBrowser(bytes, texture.isColor);
  decoded.name = texture.imageName;
  decoded.wrapS = THREE.RepeatWrapping;
  decoded.wrapT = THREE.RepeatWrapping;
  decoded.generateMipmaps = true;
  decoded.minFilter = THREE.LinearMipmapLinearFilter;
  decoded.needsUpdate = true;
  return decoded;
}

async function decodeWithBrowser(bytes: Uint8Array, isColor: boolean): Promise<THREE.Texture> {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>]);
  // Decode once at full size to learn the dimensions only when a resize is needed; createImageBitmap needs both.
  const full = await createImageBitmap(blob, { imageOrientation: "flipY", premultiplyAlpha: "none", colorSpaceConversion: "none" });
  let bitmap = full;
  const scale = Math.min(1, MAX_TEXTURE_SIZE / Math.max(full.width, full.height));
  if (scale < 1) {
    bitmap = await createImageBitmap(full, { resizeWidth: Math.max(1, Math.round(full.width * scale)), resizeHeight: Math.max(1, Math.round(full.height * scale)), resizeQuality: "high", premultiplyAlpha: "none", colorSpaceConversion: "none" });
    full.close();
  }
  const texture = new THREE.Texture(bitmap);
  texture.flipY = false; // createImageBitmap already flipped it
  texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return texture;
}

/**
 * OpenEXR rows come bottom-up from EXRLoader, with 4 values per pixel for RGB(A) files and 1 for luminance-only (Y) files.
 * Values are box-filtered down to MAX_TEXTURE_SIZE and stored as 8-bit RGBA; a Y channel fills R, G and B, because
 * three.js reads roughness from G and metalness from B.
 */
function decodeOpenExr(bytes: Uint8Array, isColor: boolean): THREE.Texture {
  const loader = new EXRLoader().setDataType(THREE.FloatType);
  const { width, height, data } = loader.parse(bytes.slice().buffer) as unknown as { width: number; height: number; data: Float32Array };
  const sourceChannels = data.length / (width * height);
  if (sourceChannels !== 1 && sourceChannels !== 4) throw new Error(`OpenEXR with ${sourceChannels} channels per pixel is not supported`);
  const step = Math.max(1, Math.ceil(Math.max(width, height) / MAX_TEXTURE_SIZE));
  const outputWidth = Math.ceil(width / step);
  const outputHeight = Math.ceil(height / step);
  const pixels = new Uint8Array(outputWidth * outputHeight * 4);
  // Color images keep their precision in the dark tones by storing sRGB-encoded values.
  const encode = (value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    const encoded = !isColor ? clamped : clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255);
  };
  const sum = new Float64Array(4);
  for (let outputY = 0; outputY < outputHeight; outputY += 1) {
    const endY = Math.min(height, (outputY + 1) * step);
    for (let outputX = 0; outputX < outputWidth; outputX += 1) {
      const endX = Math.min(width, (outputX + 1) * step);
      sum.fill(0);
      let count = 0;
      for (let y = outputY * step; y < endY; y += 1) {
        for (let x = outputX * step; x < endX; x += 1) {
          const source = (y * width + x) * sourceChannels;
          for (let channel = 0; channel < sourceChannels; channel += 1) sum[channel]! += data[source + channel]!;
          count += 1;
        }
      }
      const target = (outputY * outputWidth + outputX) * 4;
      for (let channel = 0; channel < 3; channel += 1) pixels[target + channel] = encode(sum[sourceChannels === 1 ? 0 : channel]! / count);
      pixels[target + 3] = sourceChannels === 4 ? Math.round(Math.min(1, Math.max(0, sum[3]! / count)) * 255) : 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, outputWidth, outputHeight, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.flipY = false;
  texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return texture;
}
