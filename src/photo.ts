import { maxVisionImageBytes } from '../shared/domain';

export async function prepareVisionImage(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image preparation is unavailable in this browser.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    if (!dataUrl.startsWith('data:image/jpeg;base64,')) throw new Error('JPEG image preparation failed.');
    const encoded = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const size = encoded.length / 4 * 3 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
    if (size > maxVisionImageBytes) throw new Error('Prepared image exceeds 1 MB. Choose a smaller or simpler component photo.');
    return dataUrl;
  } finally { bitmap.close(); }
}
