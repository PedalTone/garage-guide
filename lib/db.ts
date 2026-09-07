import type { AppSnapshot, DocumentRecord, ImageAsset, MaintenanceRecord, ResourceLinkRecord, Vehicle } from './models';

const DB_NAME = 'garage-guide';
const DB_VERSION = 2;

type StoreName = 'vehicles' | 'documents' | 'images' | 'maintenance' | 'metadata' | 'resourceLinks';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openGarageDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser does not provide local database storage.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['vehicles', 'documents', 'images', 'maintenance', 'metadata', 'resourceLinks'] as StoreName[]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Garage Guide storage is open in another tab.'));
  });
}

async function readAll<T>(db: IDBDatabase, storeName: StoreName): Promise<T[]> {
  const tx = db.transaction(storeName, 'readonly');
  return requestToPromise(tx.objectStore(storeName).getAll()) as Promise<T[]>;
}

export async function loadSnapshot(): Promise<AppSnapshot> {
  const db = await openGarageDb();
  try {
    const [vehicles, documents, maintenanceRecords, resourceLinks] = await Promise.all([
      readAll<Vehicle>(db, 'vehicles'),
      readAll<DocumentRecord>(db, 'documents'),
      readAll<MaintenanceRecord>(db, 'maintenance'),
      readAll<ResourceLinkRecord>(db, 'resourceLinks'),
    ]);
    return { vehicles, documents, maintenanceRecords, resourceLinks };
  } finally {
    db.close();
  }
}

export async function saveVehicle(vehicle: Vehicle): Promise<void> {
  const db = await openGarageDb();
  const tx = db.transaction('vehicles', 'readwrite');
  tx.objectStore('vehicles').put(vehicle);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function saveVehicleImage(vehicle: Vehicle, assets: ImageAsset[], replacedImageIds: string[] = []): Promise<void> {
  const db = await openGarageDb();
  const tx = db.transaction(['vehicles', 'images'], 'readwrite');
  tx.objectStore('vehicles').put(vehicle);
  for (const imageId of replacedImageIds) tx.objectStore('images').delete(imageId);
  for (const asset of assets) tx.objectStore('images').put(asset);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function saveDocument(record: DocumentRecord, assets: ImageAsset[] = [], replacedImageIds: string[] = []): Promise<void> {
  const db = await openGarageDb();
  const tx = db.transaction(['documents', 'images'], 'readwrite');
  tx.objectStore('documents').put(record);
  for (const imageId of replacedImageIds) tx.objectStore('images').delete(imageId);
  for (const asset of assets) tx.objectStore('images').put(asset);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function saveMaintenance(record: MaintenanceRecord): Promise<void> {
  const db = await openGarageDb();
  const tx = db.transaction('maintenance', 'readwrite');
  tx.objectStore('maintenance').put(record);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function saveResourceLink(record: ResourceLinkRecord): Promise<void> {
  const db = await openGarageDb();
  const tx = db.transaction('resourceLinks', 'readwrite');
  tx.objectStore('resourceLinks').put(record);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getImageUrl(imageId?: string): Promise<string | null> {
  if (!imageId) return null;
  const db = await openGarageDb();
  const asset = await requestToPromise(db.transaction('images', 'readonly').objectStore('images').get(imageId)) as ImageAsset | undefined;
  db.close();
  return asset ? URL.createObjectURL(asset.blob) : null;
}

export async function replaceAll(snapshot: AppSnapshot): Promise<void> {
  const db = await openGarageDb();
  const tx = db.transaction(['vehicles', 'documents', 'images', 'maintenance', 'resourceLinks'], 'readwrite');
  for (const store of ['vehicles', 'documents', 'images', 'maintenance', 'resourceLinks'] as StoreName[]) tx.objectStore(store).clear();
  for (const item of snapshot.vehicles) tx.objectStore('vehicles').put(item);
  for (const item of snapshot.documents) tx.objectStore('documents').put(item);
  for (const item of snapshot.maintenanceRecords) tx.objectStore('maintenance').put(item);
  for (const item of snapshot.resourceLinks) tx.objectStore('resourceLinks').put(item);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function clearGarage(): Promise<void> {
  const db = await openGarageDb();
  const names: StoreName[] = ['vehicles', 'documents', 'images', 'maintenance', 'metadata', 'resourceLinks'];
  const tx = db.transaction(names, 'readwrite');
  names.forEach((name) => tx.objectStore(name).clear());
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
