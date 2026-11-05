const MAX_SIDE = 2000;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });

/**
 * Read an uploaded image, shrinking large photos so they don't eat a small
 * hosting plan's disk space or load slowly. SVGs and GIFs are kept as they are.
 * (In the full product uploads go to storage on the builder server instead.)
 */
export async function readImageFile(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That image is over 15 MB. Please choose a smaller one.');
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') return readAsDataUrl(file);

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 600 * 1024) {
    bitmap.close();
    return readAsDataUrl(file);
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process the image.'))), type, 0.85),
  );
  return readAsDataUrl(blob);
}
