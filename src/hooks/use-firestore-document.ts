"use client";

import { useEffect, useState, useCallback } from "react";
import {
  doc,
  onSnapshot,
  updateDoc,
  setDoc,
  deleteDoc,
  type DocumentData,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";

interface UseFirestoreDocumentReturn<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  exists: boolean;
  update: (data: Partial<T>) => Promise<void>;
  set: (data: T, merge?: boolean) => Promise<void>;
  remove: () => Promise<void>;
}

export function useFirestoreDocument<T extends DocumentData>(
  path: string | null
): UseFirestoreDocumentReturn<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }

    const docRef = doc(getDb(), path);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setData({ id: snapshot.id, ...snapshot.data() } as unknown as T);
          setExists(true);
        } else {
          setData(null);
          setExists(false);
        }
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [path]);

  const update = useCallback(
    async (updateData: Partial<T>) => {
      if (!path) return;
      const docRef = doc(getDb(), path);
      await updateDoc(docRef, updateData as DocumentData);
    },
    [path]
  );

  const set = useCallback(
    async (newData: T, merge = false) => {
      if (!path) return;
      const docRef = doc(getDb(), path);
      await setDoc(docRef, newData as DocumentData, { merge });
    },
    [path]
  );

  const remove = useCallback(async () => {
    if (!path) return;
    const docRef = doc(getDb(), path);
    await deleteDoc(docRef);
  }, [path]);

  return { data, loading, error, exists, update, set, remove };
}
