/**
 * IndexedDB-based media storage for videos and images.
 * Persists actual binary data (blobs) offline.
 * Media is linked to sessions via sessionId references.
 */

const DB_NAME = 'ArrowCounterMedia';
const DB_VERSION = 1;
const STORE_NAME = 'media';

interface MediaRecord {
  id: string;
  type: 'video' | 'image';
  blob: Blob;
  thumbnail?: string; // data URL for images, first frame for videos
  sessionId?: string; // linked to ArrowSession.id
  date: string;
  label: string; // e.g. "Video analysis" or "Target photo"
  createdAt: number;
}

interface MediaMeta {
  id: string;
  type: 'video' | 'image';
  size: number;
  thumbnail?: string;
  sessionId?: string;
  date: string;
  label: string;
  createdAt: number;
  url: string; // object URL for the blob
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { multiEntry: false });
        store.createIndex('date', 'date', { multiEntry: false });
      }
    };
  });
  return dbPromise;
}

// ---- Public API ----

export async function saveMedia(
  blob: Blob,
  type: 'video' | 'image',
  opts: { sessionId?: string; label?: string; thumbnail?: string }
): Promise<MediaMeta> {
  const db = await openDB();
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  const date = new Date().toISOString().split('T')[0];

  const record: MediaRecord = {
    id,
    type,
    blob,
    thumbnail: opts.thumbnail,
    sessionId: opts.sessionId,
    date,
    label: opts.label || (type === 'video' ? 'Form analysis video' : 'Target photo'),
    createdAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => {
      resolve({
        id,
        type,
        size: blob.size,
        thumbnail: opts.thumbnail,
        sessionId: opts.sessionId,
        date,
        label: record.label,
        createdAt: record.createdAt,
        url: URL.createObjectURL(blob),
      });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getMediaForSession(sessionId: string): Promise<MediaMeta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index('sessionId');
    const req = idx.getAll(sessionId);
    req.onsuccess = () => {
      const records: MediaRecord[] = req.result;
      const metas: MediaMeta[] = records.map(r => ({
        id: r.id,
        type: r.type,
        size: r.blob.size,
        thumbnail: r.thumbnail,
        sessionId: r.sessionId,
        date: r.date,
        label: r.label,
        createdAt: r.createdAt,
        url: URL.createObjectURL(r.blob),
      }));
      resolve(metas);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAllMedia(): Promise<MediaMeta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const records: MediaRecord[] = req.result;
      // Sort by date descending
      records.sort((a, b) => b.createdAt - a.createdAt);
      const metas: MediaMeta[] = records.map(r => ({
        id: r.id,
        type: r.type,
        size: r.blob.size,
        thumbnail: r.thumbnail,
        sessionId: r.sessionId,
        date: r.date,
        label: r.label,
        createdAt: r.createdAt,
        url: URL.createObjectURL(r.blob),
      }));
      resolve(metas);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getMediaBlob(id: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      const record: MediaRecord | undefined = req.result;
      resolve(record?.blob || null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteMedia(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function linkMediaToSession(mediaId: string, sessionId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(mediaId);
    getReq.onsuccess = () => {
      const record: MediaRecord = getReq.result;
      if (!record) { resolve(); return; }
      record.sessionId = sessionId;
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// ---- React Hook ----

import { useState, useEffect, useCallback } from 'react';

export function useMediaStore() {
  const [media, setMedia] = useState<MediaMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbReady, setDbReady] = useState(true);

  useEffect(() => {
    // Check if IndexedDB is available (some private modes block it)
    if (!window.indexedDB) {
      setDbReady(false);
      setLoading(false);
      return;
    }
    getAllMedia().then(m => { setMedia(m); setLoading(false); }).catch(() => {
      setDbReady(false);
      setLoading(false);
    });
  }, []);

  const addMedia = useCallback(async (blob: Blob, type: 'video' | 'image', opts?: { sessionId?: string; label?: string; thumbnail?: string }) => {
    const meta = await saveMedia(blob, type, opts || {});
    setMedia(prev => [meta, ...prev]);
    return meta;
  }, []);

  const removeMedia = useCallback(async (id: string) => {
    await deleteMedia(id);
    setMedia(prev => prev.filter(m => m.id !== id));
  }, []);

  const linkToSession = useCallback(async (mediaId: string, sessionId: string) => {
    await linkMediaToSession(mediaId, sessionId);
    setMedia(prev => prev.map(m => m.id === mediaId ? { ...m, sessionId } : m));
  }, []);

  const getForSession = useCallback(async (sessionId: string): Promise<MediaMeta[]> => {
    return getMediaForSession(sessionId);
  }, []);

  return { media, loading, dbReady, addMedia, removeMedia, linkToSession, getForSession };
}

export type { MediaMeta };
