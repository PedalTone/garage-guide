import type { ImageAsset } from './models';

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be opened. Try a JPEG, PNG, or WebP photo.')); };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('The image could not be prepared.')),
    'image/jpeg',
    quality,
  ));
}

async function resize(file: File, maxEdge: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const image = await loadImage(file);
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image processing is unavailable in this browser.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return { blob: await canvasBlob(canvas, quality), width, height };
}

export async function prepareDocumentImages(file: File, documentId: string): Promise<ImageAsset[]> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo rather than a PDF or document file.');
  const [full, thumbnail] = await Promise.all([resize(file, 2560, .85), resize(file, 480, .78)]);
  const createdAt = new Date().toISOString();
  return [
    { id: crypto.randomUUID(), documentId, role: 'document', blob: full.blob, mimeType: 'image/jpeg', width: full.width, height: full.height, byteSize: full.blob.size, originalFilename: file.name, createdAt },
    { id: crypto.randomUUID(), documentId, role: 'thumbnail', blob: thumbnail.blob, mimeType: 'image/jpeg', width: thumbnail.width, height: thumbnail.height, byteSize: thumbnail.blob.size, originalFilename: file.name, createdAt },
  ];
}
