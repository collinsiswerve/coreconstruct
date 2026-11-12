const databaseName = 'coreconstruct-pages-demo-files';

type StoredFile = { id: string; file: File };

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function openDemoFiles() {
  let database: IDBDatabase | undefined;
  const files = new Map<string, string>();

  try {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files', { keyPath: 'id' });
    database = await requestResult(request);
    const saved = await requestResult<StoredFile[]>(database.transaction('files').objectStore('files').getAll());
    for (const { id, file } of saved) files.set(id, URL.createObjectURL(file));
  } catch {
    database = undefined;
  }

  return {
    href: (id: string) => files.get(id),
    async add(id: string, file: File) {
      if (!database) throw new Error('File storage is unavailable in this browser.');
      await requestResult(database.transaction('files', 'readwrite').objectStore('files').put({ id, file }));
      files.set(id, URL.createObjectURL(file));
    },
    async clear() {
      if (database) {
        await requestResult(database.transaction('files', 'readwrite').objectStore('files').clear());
      }
      for (const href of files.values()) URL.revokeObjectURL(href);
      files.clear();
    },
  };
}
