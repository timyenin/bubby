export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface MutableImageData {
  data: Uint8ClampedArray;
  width?: number;
  height?: number;
}

export interface SpriteTintOptions {
  frameWidth?: number;
  frameHeight?: number;
}

export function parseHexColor(hexColor: string): RgbColor {
  if (!/^#[0-9a-f]{6}$/i.test(hexColor)) {
    throw new Error(`Invalid sprite fill color: ${hexColor}`);
  }

  return {
    r: Number.parseInt(hexColor.slice(1, 3), 16),
    g: Number.parseInt(hexColor.slice(3, 5), 16),
    b: Number.parseInt(hexColor.slice(5, 7), 16),
  };
}

export function shouldRecolorSpritePixel(
  red: number,
  green: number,
  blue: number,
  alpha: number,
): boolean {
  return alpha > 0 && red >= 230 && green >= 230 && blue >= 230;
}

export function recolorSpriteImageData<TImageData extends MutableImageData>(
  imageData: TImageData,
  fillColor: string | null,
  options: SpriteTintOptions = {},
): TImageData {
  if (!fillColor) {
    return imageData;
  }

  const color = parseHexColor(fillColor);
  const { data } = imageData;
  const width = imageData.width;
  const height = imageData.height;

  for (let index = 0; index < data.length; index += 4) {
    if (
      shouldRecolorSpritePixel(
        data[index],
        data[index + 1],
        data[index + 2],
        data[index + 3],
      )
    ) {
      data[index] = color.r;
      data[index + 1] = color.g;
      data[index + 2] = color.b;
    }
  }

  if (width && height) {
    fillEnclosedTransparentPixels(imageData, color, {
      frameWidth: options.frameWidth ?? width,
      frameHeight: options.frameHeight ?? height,
    });
  }

  return imageData;
}

function fillEnclosedTransparentPixels<TImageData extends MutableImageData>(
  imageData: TImageData,
  fillColor: RgbColor,
  options: Required<SpriteTintOptions>,
) {
  const { data, width = 0, height = 0 } = imageData;
  const frameWidth = Math.max(1, options.frameWidth);
  const frameHeight = Math.max(1, options.frameHeight);

  for (let frameY = 0; frameY < height; frameY += frameHeight) {
    const currentFrameHeight = Math.min(frameHeight, height - frameY);

    for (let frameX = 0; frameX < width; frameX += frameWidth) {
      const currentFrameWidth = Math.min(frameWidth, width - frameX);
      fillFrameEnclosedTransparentPixels({
        data,
        imageWidth: width,
        frameX,
        frameY,
        frameWidth: currentFrameWidth,
        frameHeight: currentFrameHeight,
        fillColor,
      });
    }
  }
}

interface FillFrameParams {
  data: Uint8ClampedArray;
  imageWidth: number;
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
  fillColor: RgbColor;
}

function fillFrameEnclosedTransparentPixels({
  data,
  imageWidth,
  frameX,
  frameY,
  frameWidth,
  frameHeight,
  fillColor,
}: FillFrameParams) {
  const outsideTransparent = new Uint8Array(frameWidth * frameHeight);
  const queue: number[] = [];

  function localIndex(x: number, y: number): number {
    return y * frameWidth + x;
  }

  function pixelIndex(x: number, y: number): number {
    return ((frameY + y) * imageWidth + frameX + x) * 4;
  }

  function enqueueOutsideTransparent(x: number, y: number) {
    if (x < 0 || x >= frameWidth || y < 0 || y >= frameHeight) {
      return;
    }

    const outsideIndex = localIndex(x, y);
    if (outsideTransparent[outsideIndex]) {
      return;
    }

    const index = pixelIndex(x, y);
    if (data[index + 3] !== 0) {
      return;
    }

    outsideTransparent[outsideIndex] = 1;
    queue.push(outsideIndex);
  }

  for (let x = 0; x < frameWidth; x += 1) {
    enqueueOutsideTransparent(x, 0);
    enqueueOutsideTransparent(x, frameHeight - 1);
  }

  for (let y = 0; y < frameHeight; y += 1) {
    enqueueOutsideTransparent(0, y);
    enqueueOutsideTransparent(frameWidth - 1, y);
  }

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const currentIndex = queue[queueIndex];
    const x = currentIndex % frameWidth;
    const y = Math.floor(currentIndex / frameWidth);

    enqueueOutsideTransparent(x + 1, y);
    enqueueOutsideTransparent(x - 1, y);
    enqueueOutsideTransparent(x, y + 1);
    enqueueOutsideTransparent(x, y - 1);
  }

  for (let y = 0; y < frameHeight; y += 1) {
    for (let x = 0; x < frameWidth; x += 1) {
      const index = pixelIndex(x, y);

      if (data[index + 3] === 0 && !outsideTransparent[localIndex(x, y)]) {
        data[index] = fillColor.r;
        data[index + 1] = fillColor.g;
        data[index + 2] = fillColor.b;
        data[index + 3] = 255;
      }
    }
  }
}
