import { isConversationHistoryStorageError } from './storage.ts';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const CLIENT_CHAT_REQUEST_BODY_BUDGET_BYTES = Math.floor(3.5 * 1024 * 1024);
export const MAX_PROCESSED_IMAGE_BYTES = 900 * 1024;
const OUTPUT_MEDIA_TYPE = 'image/jpeg';
const FULL_IMAGE_MAX_EDGE = 1280;
const FULL_IMAGE_QUALITY = 0.82;
const MIN_FULL_IMAGE_MAX_EDGE = 768;
const MIN_FULL_IMAGE_QUALITY = 0.68;
const THUMBNAIL_MAX_EDGE = 96;
const THUMBNAIL_QUALITY = 0.6;
const MAX_IMAGE_ATTACHMENTS = 4;

export type ImageProcessingErrorCode =
  | 'invalid-file-type'
  | 'original-file-too-large'
  | 'image-read-failed'
  | 'image-decode-failed'
  | 'canvas-unavailable'
  | 'image-encode-failed'
  | 'processed-image-too-large'
  | 'request-payload-too-large';

const USER_MESSAGES: Record<ImageProcessingErrorCode, string> = {
  'invalid-file-type': 'i couldn’t read that image. try a screenshot or jpg/png?',
  'original-file-too-large': 'that photo was too large. try one photo or a closer crop?',
  'image-read-failed': 'i couldn’t read that image. try a screenshot or jpg/png?',
  'image-decode-failed': 'i couldn’t read that image. try a screenshot or jpg/png?',
  'canvas-unavailable': 'i couldn’t process that photo on this device. try a screenshot or jpg/png?',
  'image-encode-failed': 'i couldn’t process that photo on this device. try a screenshot or jpg/png?',
  'processed-image-too-large': 'photo upload was too big. try one photo at a time?',
  'request-payload-too-large': 'photo upload was too big. try one photo at a time?',
};

export class ImageProcessingError extends Error {
  readonly code: ImageProcessingErrorCode;
  readonly userMessage: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ImageProcessingErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ImageProcessingError';
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
    this.details = details;
  }
}

export class ChatRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ChatRequestError';
    this.status = status;
  }
}

export interface ProcessedImage {
  fullImage: string;
  thumbnail: string;
  mediaType: string;
}

interface ImageLike {
  width?: number;
  height?: number;
  naturalWidth?: number;
  naturalHeight?: number;
}

interface CanvasContextLike {
  fillStyle: string;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  drawImage: (image: unknown, x: number, y: number, w: number, h: number) => void;
}

interface CanvasLike {
  width: number;
  height: number;
  getContext: (type: '2d') => CanvasContextLike | null;
  toDataURL: (mediaType: string, quality?: number) => string;
}

export interface ProcessImageOptions {
  loadImage?: (file: FileLike) => Promise<ImageLike>;
  createCanvasElement?: () => CanvasLike;
  fullMaxEdge?: number;
  fullQuality?: number;
  minFullMaxEdge?: number;
  minFullQuality?: number;
  maxFullImageBytes?: number;
  thumbnailMaxEdge?: number;
  thumbnailQuality?: number;
}

interface FileLike {
  type?: string;
  size?: number | string;
  name?: string;
}

function validateImageFile(file: FileLike | null | undefined): asserts file is FileLike {
  if (!file || typeof file.type !== 'string' || !file.type.startsWith('image/')) {
    throw new ImageProcessingError('invalid-file-type', 'Please choose an image file.', {
      type: file?.type,
      name: file?.name,
    });
  }

  if (Number(file.size) > MAX_UPLOAD_BYTES) {
    throw new ImageProcessingError('original-file-too-large', 'Image files must be 20MB or smaller.', {
      size: file.size,
      maxBytes: MAX_UPLOAD_BYTES,
      name: file.name,
    });
  }
}

function getImageDimensions(image: ImageLike): { width: number; height: number } {
  return {
    width: image.naturalWidth ?? image.width ?? 0,
    height: image.naturalHeight ?? image.height ?? 0,
  };
}

function getResizedDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) {
    return { width, height };
  }

  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function createCanvasElement(): CanvasLike {
  return document.createElement('canvas') as unknown as CanvasLike;
}

function readFileAsDataUrl(file: FileLike): Promise<string> {
  if (typeof FileReader === 'undefined') {
    return Promise.reject(
      new ImageProcessingError('image-read-failed', 'Could not read image file.', {
        name: file.name,
      }),
    );
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => resolve(reader.result as string));
    reader.addEventListener('error', () => reject(
      new ImageProcessingError('image-read-failed', 'Could not read image file.', {
        name: file.name,
      }),
    ));
    reader.readAsDataURL(file as unknown as Blob);
  });
}

async function loadImageFromFile(file: FileLike): Promise<ImageLike> {
  const dataUrl = await readFileAsDataUrl(file);

  if (typeof Image === 'undefined') {
    throw new ImageProcessingError('image-decode-failed', 'Could not load image file.', {
      name: file.name,
    });
  }

  return new Promise<ImageLike>((resolve, reject) => {
    const image = new Image();

    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(
      new ImageProcessingError('image-decode-failed', 'Could not load image file.', {
        name: file.name,
      }),
    ));
    image.src = dataUrl;
  });
}

function renderImageToDataUrl(
  image: ImageLike,
  {
    maxEdge,
    quality,
    createCanvasElement: createCanvas,
  }: { maxEdge: number; quality: number; createCanvasElement: () => CanvasLike },
): string {
  const { width, height } = getImageDimensions(image);
  if (width <= 0 || height <= 0) {
    throw new ImageProcessingError('image-decode-failed', 'Could not read image dimensions.', {
      width,
      height,
    });
  }

  const resized = getResizedDimensions(width, height, maxEdge);
  const canvas = createCanvas();
  canvas.width = resized.width;
  canvas.height = resized.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new ImageProcessingError('canvas-unavailable', 'Could not process image.', {
      maxEdge,
      quality,
    });
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, resized.width, resized.height);
  context.drawImage(image, 0, 0, resized.width, resized.height);

  try {
    return canvas.toDataURL(OUTPUT_MEDIA_TYPE, quality);
  } catch (error) {
    throw new ImageProcessingError('image-encode-failed', 'Could not encode image.', {
      maxEdge,
      quality,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

function normalizeCompressionSettings(
  maxEdge: number,
  quality: number,
  minMaxEdge: number,
  minQuality: number,
): Array<{ maxEdge: number; quality: number }> {
  const settings = [
    { maxEdge, quality },
    { maxEdge, quality: Math.min(quality, 0.78) },
    { maxEdge: Math.min(maxEdge, 1152), quality: Math.min(quality, 0.78) },
    { maxEdge: Math.min(maxEdge, 1024), quality: Math.min(quality, 0.76) },
    { maxEdge: Math.min(maxEdge, 896), quality: Math.min(quality, 0.72) },
    { maxEdge: Math.min(maxEdge, minMaxEdge), quality: Math.min(quality, minQuality) },
  ].map((setting) => ({
    maxEdge: Math.max(minMaxEdge, setting.maxEdge),
    quality: Math.max(minQuality, Number(setting.quality.toFixed(2))),
  }));

  return settings.filter((setting, index) => {
    const previous = settings[index - 1];
    return !previous || previous.maxEdge !== setting.maxEdge || previous.quality !== setting.quality;
  });
}

function renderAdaptiveFullImageToDataUrl(
  image: ImageLike,
  {
    createCanvasElement: createCanvas,
    maxEdge,
    quality,
    minMaxEdge,
    minQuality,
    maxBytes,
  }: {
    createCanvasElement: () => CanvasLike;
    maxEdge: number;
    quality: number;
    minMaxEdge: number;
    minQuality: number;
    maxBytes: number;
  },
): string {
  let lastSize = 0;
  let lastSetting = { maxEdge, quality };

  for (const setting of normalizeCompressionSettings(maxEdge, quality, minMaxEdge, minQuality)) {
    const dataUrl = renderImageToDataUrl(image, {
      createCanvasElement: createCanvas,
      maxEdge: setting.maxEdge,
      quality: setting.quality,
    });
    const byteSize = estimateDataUrlBytes(dataUrl);
    lastSize = byteSize;
    lastSetting = setting;

    if (byteSize <= maxBytes) {
      return dataUrl;
    }
  }

  throw new ImageProcessingError('processed-image-too-large', 'Processed image is too large.', {
    maxBytes,
    byteSize: lastSize,
    maxEdge: lastSetting.maxEdge,
    quality: lastSetting.quality,
  });
}

function encodeByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }

  return value.length;
}

export function estimateDataUrlBytes(dataUrl: string): number {
  return encodeByteLength(dataUrl);
}

export function estimateJsonPayloadBytes(value: unknown): number {
  return encodeByteLength(JSON.stringify(value));
}

export function assertChatRequestWithinImageBudget(
  requestBody: unknown,
  budgetBytes = CLIENT_CHAT_REQUEST_BODY_BUDGET_BYTES,
): void {
  const byteSize = estimateJsonPayloadBytes(requestBody);

  if (byteSize > budgetBytes) {
    throw new ImageProcessingError('request-payload-too-large', 'Chat image request is too large.', {
      byteSize,
      budgetBytes,
    });
  }
}

export function isImageProcessingError(error: unknown): error is ImageProcessingError {
  return error instanceof ImageProcessingError;
}

export function imageUploadUserMessage(error: unknown): string {
  return isImageProcessingError(error)
    ? error.userMessage
    : 'something glitched. try again?';
}

function isChatRequestError(error: unknown): error is ChatRequestError {
  return error instanceof ChatRequestError;
}

function isQuotaOrStorageLikeError(error: unknown): boolean {
  if (isConversationHistoryStorageError(error)) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  return /quota|storage|localStorage/i.test(`${error.name} ${error.message}`);
}

function isNetworkLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error instanceof TypeError ||
    /network|fetch|load failed|failed to fetch|connection/i.test(`${error.name} ${error.message}`)
  );
}

export function photoSendUserMessage(error: unknown, hasAttachment: boolean): string {
  if (isImageProcessingError(error)) {
    return error.userMessage;
  }

  if (hasAttachment && isQuotaOrStorageLikeError(error)) {
    return 'my photo memory got too full. i cleaned it up — try sending that again?';
  }

  if (isChatRequestError(error)) {
    if (error.status === 413) {
      return 'photo upload was too big. try one photo at a time?';
    }

    if (hasAttachment && error.status === 400) {
      return 'i couldn’t read that image. try a screenshot or jpg/png?';
    }

    if (hasAttachment && error.status >= 500) {
      return 'my photo brain hiccuped. try that one again?';
    }
  }

  if (hasAttachment && isNetworkLikeError(error)) {
    return 'connection glitched while sending the photo. try again?';
  }

  return hasAttachment
    ? 'photo send glitched. try that one again?'
    : imageUploadUserMessage(error);
}

/**
 * Resize and compress a user-selected image for Claude upload and chat history.
 */
export async function processImageForUpload(
  file: FileLike,
  options: ProcessImageOptions = {},
): Promise<ProcessedImage> {
  validateImageFile(file);

  const loadImage = options.loadImage ?? loadImageFromFile;
  const createCanvas = options.createCanvasElement ?? createCanvasElement;
  let image: ImageLike;

  try {
    image = await loadImage(file);
  } catch (error) {
    if (isImageProcessingError(error)) {
      throw error;
    }

    throw new ImageProcessingError('image-decode-failed', 'Could not load image file.', {
      name: file.name,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  const canvasOptions = { createCanvasElement: createCanvas };

  return {
    fullImage: renderAdaptiveFullImageToDataUrl(image, {
      ...canvasOptions,
      maxEdge: options.fullMaxEdge ?? FULL_IMAGE_MAX_EDGE,
      quality: options.fullQuality ?? FULL_IMAGE_QUALITY,
      minMaxEdge: options.minFullMaxEdge ?? MIN_FULL_IMAGE_MAX_EDGE,
      minQuality: options.minFullQuality ?? MIN_FULL_IMAGE_QUALITY,
      maxBytes: options.maxFullImageBytes ?? MAX_PROCESSED_IMAGE_BYTES,
    }),
    thumbnail: renderImageToDataUrl(image, {
      ...canvasOptions,
      maxEdge: options.thumbnailMaxEdge ?? THUMBNAIL_MAX_EDGE,
      quality: options.thumbnailQuality ?? THUMBNAIL_QUALITY,
    }),
    mediaType: OUTPUT_MEDIA_TYPE,
  };
}

export async function processImagesForChatUpload(
  files: FileLike[],
  options: ProcessImageOptions = {},
): Promise<ProcessedImage[]> {
  const processedImages: ProcessedImage[] = [];

  for (const file of files.slice(0, MAX_IMAGE_ATTACHMENTS)) {
    processedImages.push(await processImageForUpload(file, options));
  }

  return processedImages;
}
