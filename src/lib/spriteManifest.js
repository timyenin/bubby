const SPRITE_ROOT = '/assets/sprites';
const MANIFEST_URL = `${SPRITE_ROOT}/manifest.json`;

export async function loadSpriteManifest() {
  const response = await fetch(MANIFEST_URL);

  if (!response.ok) {
    throw new Error(`sprite manifest failed: ${response.status}`);
  }

  return response.json();
}

export function resolveAnimationSheet(manifest, animationName) {
  if (manifest.all_sheet) {
    return resolveFromAllSheet(manifest, animationName);
  }

  const sheetKey = `${animationName}_sheet`;
  const animationFrames = manifest.animations?.[animationName];
  const animationSheet = manifest.animations?.[sheetKey];

  if (animationSheet) {
    return {
      animationName,
      frameCount: Array.isArray(animationFrames) ? animationFrames.length : 0,
      frameSize: manifest.sprite_size,
      sheetSize: animationSheet.size,
      src: `${SPRITE_ROOT}/${animationSheet.file}`,
      xOffset: 0,
    };
  }

  return resolveFromAllSheet(manifest, animationName);
}

function resolveFromAllSheet(manifest, animationName) {
  const allSheet = manifest.all_sheet;
  const animationFrames = manifest.animations?.[animationName];

  if (!allSheet || !Array.isArray(animationFrames)) {
    throw new Error(`missing sprite sheet metadata for ${animationName}`);
  }

  const orderedAnimations = Object.entries(manifest.animations)
    .filter(([, value]) => Array.isArray(value))
    .map(([name, frames]) => ({ name, frameCount: frames.length }));

  const animationIndex = orderedAnimations.findIndex(
    ({ name }) => name === animationName,
  );

  if (animationIndex === -1) {
    throw new Error(`unknown sprite animation ${animationName}`);
  }

  const frameOffset = orderedAnimations
    .slice(0, animationIndex)
    .reduce((total, animation) => total + animation.frameCount, 0);

  return {
    animationName,
    frameCount: animationFrames.length,
    frameSize: manifest.sprite_size,
    sheetSize: allSheet.size,
    src: `${SPRITE_ROOT}/sheets/${allSheet.file}`,
    xOffset: frameOffset * manifest.sprite_size[0],
  };
}
