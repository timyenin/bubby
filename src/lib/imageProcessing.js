export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const OUTPUT_MEDIA_TYPE = 'image/jpeg';
const FULL_IMAGE_MAX_EDGE = 1024;
const FULL_IMAGE_QUALITY = 0.8;
const THUMBNAIL_MAX_EDGE = 96;
const THUMBNAIL_QUALITY = 0.6;

function validateImageFile(file) {
  if (!file || typeof file.type !== 'string' || !file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }

  if (Number(file.size) > MAX_UPLOAD_BYTES) {
    throw new Error('Image files must be 20MB or smaller.');
  }
}

function getImageDimensions(image) {
  return {
    width: image.naturalWidth ?? image.width,
    height: image.naturalHeight ?? image.height,
  };
}

function getResizedDimensions(width, height, maxEdge) {
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

function createCanvasElement() {
  return document.createElement('canvas');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(new Error('Could not read image file.')));
    reader.readAsDataURL(file);
  });
}

async function loadImageFromFile(file) {
  const dataUrl = await readFileAsDataUrl(file);

  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Could not load image file.')));
    image.src = dataUrl;
  });
}

function renderImageToDataUrl(image, { maxEdge, quality, createCanvasElement: createCanvas }) {
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
 *
 * @param {File} file
 * @param {object} [options]
 * @returns {Promise<{fullImage: string, thumbnail: string, mediaType: string}>}
 */
export async function processImageForUpload(file, options = {}) {
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
