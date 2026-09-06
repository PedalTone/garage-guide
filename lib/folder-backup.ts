import { openGarageDb } from './db';
import type { AppSnapshot, ImageAsset } from './models';

type PermissionStateValue = 'granted' | 'denied' | 'prompt';

type WritableFileHandle = {
  createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>;
};

export type BackupDirectoryHandle = {
  kind: 'directory';
  name: string;
  getDirectoryHandle(name: string, options: { create: boolean }): Promise<BackupDirectoryHandle>;
  getFileHandle(name: string, options: { create: boolean }): Promise<WritableFileHandle>;
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionStateValue>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionStateValue>;
};

type PickerWindow = Window & {
  showDirectoryPicker?: (options: { id: string; mode: 'readwrite' }) => Promise<BackupDirectoryHandle>;
};

type BackupDirectoryRecord = { id: 'backup-directory'; handle: BackupDirectoryHandle; name: string; lastSyncedAt?: string };

export type BackupFolderStatus = {
  supported: boolean;
  configured: boolean;
  name?: string;
  permission: PermissionStateValue | 'unsupported';
  lastSyncedAt?: string;
};

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}

async function getRecord() {
  const db = await openGarageDb();
  try { return await requestResult(db.transaction('metadata', 'readonly').objectStore('metadata').get('backup-directory')) as BackupDirectoryRecord | undefined; }
  finally { db.close(); }
}

async function putRecord(record: BackupDirectoryRecord) {
  const db = await openGarageDb();
  const tx = db.transaction('metadata', 'readwrite'); tx.objectStore('metadata').put(record);
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
}

async function getImages() {
  const db = await openGarageDb();
  try { return await requestResult(db.transaction('images', 'readonly').objectStore('images').getAll()) as ImageAsset[]; }
  finally { db.close(); }
}

async function writeFile(directory: BackupDirectoryHandle, name: string, contents: Blob | string) {
  const file = await directory.getFileHandle(name, { create: true }); const writable = await file.createWritable(); await writable.write(contents); await writable.close();
}

export function folderBackupSupported() {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showDirectoryPicker === 'function';
}

export async function getBackupFolderStatus(): Promise<BackupFolderStatus> {
  if (!folderBackupSupported()) return { supported: false, configured: false, permission: 'unsupported' };
  const record = await getRecord();
  if (!record) return { supported: true, configured: false, permission: 'prompt' };
  const permission = record.handle.queryPermission ? await record.handle.queryPermission({ mode: 'readwrite' }) : 'prompt';
  return { supported: true, configured: true, name: record.name, permission, lastSyncedAt: record.lastSyncedAt };
}

export async function chooseBackupFolder() {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error('Folder mirroring is not available in this browser.');
  const handle = await picker({ id: 'garage-guide-backup', mode: 'readwrite' });
  const permission = handle.requestPermission ? await handle.requestPermission({ mode: 'readwrite' }) : 'granted';
  if (permission !== 'granted') throw new Error('Garage Guide needs permission to write backup files into that folder.');
  await putRecord({ id: 'backup-directory', handle, name: handle.name });
  return handle.name;
}

export async function syncBackupFolder(snapshot: AppSnapshot) {
  const record = await getRecord();
  if (!record) return false;
  const permission = record.handle.queryPermission ? await record.handle.queryPermission({ mode: 'readwrite' }) : 'prompt';
  if (permission !== 'granted') return false;
  const exportedAt = new Date().toISOString();
  const payload = { format: 'garage-guide-records', schemaVersion: 2, exportedAt, appVersion: '0.1.0', imagePolicy: 'document-images-in-documents-folder', ...snapshot };
  await writeFile(record.handle, 'garage-guide-records.json', JSON.stringify(payload, null, 2));
  await writeFile(record.handle, 'README.txt', 'Garage Guide local mirror\n\nThe JSON file contains your vehicle records. Document images are stored in the documents folder. Garage Guide updates this mirror after each saved change while folder permission remains available.\n');
  const images = await getImages();
  if (images.length) {
    const imageDirectory = await record.handle.getDirectoryHandle('documents', { create: true });
    for (const image of images) { const extension = image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : 'jpg'; await writeFile(imageDirectory, `${image.id}.${extension}`, image.blob); }
  }
  await putRecord({ ...record, lastSyncedAt: exportedAt });
  return true;
}
