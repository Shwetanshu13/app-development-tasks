import pixelmatch from 'pixelmatch';
import { ssim } from 'ssim.js';

export async function getImageData(file: File, targetDimensions?: {width: number, height: number}): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetDimensions ? targetDimensions.width : img.width;
      canvas.height = targetDimensions ? targetDimensions.height : img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error("Could not get 2d context"));
      }
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(imageData);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function compareImages(img1: ImageData, img2: ImageData) {
  const width = Math.min(img1.width, img2.width);
  const height = Math.min(img1.height, img2.height);
  
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = width;
  diffCanvas.height = height;
  const diffCtx = diffCanvas.getContext('2d');
  
  if (!diffCtx) {
    throw new Error("Could not get 2d context for difference map");
  }
  
  const diffImageData = diffCtx.createImageData(width, height);
  
  pixelmatch(img1.data, img2.data, diffImageData.data, width, height, {
    threshold: 0.1,
    alpha: 0.5,
    diffColor: [255, 0, 0] // Red
  });
  
  diffCtx.putImageData(diffImageData, 0, 0);
  const diffUrl = diffCanvas.toDataURL('image/png');
  
  // SSIM
  const ssimResult = ssim(img1, img2);
  
  return {
    diffUrl,
    ssimScore: ssimResult.mssim
  };
}
