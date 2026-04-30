export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const OUTPUT_MEDIA_TYPE = 'image/jpeg';
const FULL_IMAGE_MAX_EDGE = 1024;
const FULL_IMAGE_QUALITY = 0.8;
const THUMBNAIL_MAX_EDGE = 96;
const THUMBNAIL_QUALITY = 0.6;

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
    throw new Error('Please choose an image file.');
  }

  if (Number(file.size) > MAX_UPLOAD_BYTES) {
    throw new Error('Image files must be 20MB or smaller.');
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
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => resolve(reader.result as string));
    reader.addEventListener('error', () => reject(new Error('Could not read image file.')));
    reader.readAsDataURL(file as unknown as Blob);
  });
}

async function loadImageFromFile(file: FileLike): Promise<ImageLike> {
  const dataUrl = await readFileAsDataUrl(file);

  return new Promise<ImageLike>((resolve, reject) => {
    const image = new Image();

    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Could not load image file.')));
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
  const resized = getResizedDimensions(width, height, maxEdge);
  const canvas = createCanvas();
  canvas.width = resized.width;
  canvas.height = resized.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not process image.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, resized.width, resized.height);
  context.drawImage(image, 0, 0, resized.width, resized.height);

  return canvas.toDataURL(OUTPUT_MEDIA_TYPE, quality);
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
  const image = await loadImage(file);
  const canvasOptions = { createCanvasElement: createCanvas };

  return {
    fullImage: renderImageToDataUrl(image, {
      ...canvasOptions,
      maxEdge: options.fullMaxEdge ?? FULL_IMAGE_MAX_EDGE,
      quality: options.fullQuality ?? FULL_IMAGE_QUALITY,
    }),
    thumbnail: renderImageToDataUrl(image, {
      ...canvasOptions,
      maxEdge: options.thumbnailMaxEdge ?? THUMBNAIL_MAX_EDGE,
      quality: options.thumbnailQuality ?? THUMBNAIL_QUALITY,
    }),
    mediaType: OUTPUT_MEDIA_TYPE,
  };
}
