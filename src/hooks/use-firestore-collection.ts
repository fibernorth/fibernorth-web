"use client";

import { useEffect, useState, useCallback } from "react";
import {
  collection,
  query,
  onSnapshot,
  type QueryConstraint,
  type DocumentData,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";

interface UseFirestoreCollectionReturn<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

interface UseFirestoreCollectionOptions {
  constraints?: QueryConstraint[];
}

export function useFirestoreCollection<T extends DocumentData>(
  path: string | null,
  options?: UseFirestoreCollectionOptions
): UseFirestoreCollectionReturn<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const constraintsKey = JSON.stringify(options?.constraints?.map((c) => c.type) ?? []);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }

    const collectionRef = collection(getDb(), path);
    const q = options?.constraints
      ? query(collectionRef, ...options.constraints)
      : query(collectionRef);

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() }) as unknown as T
        );
        setData(docs);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, constraintsKey, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  return { data, loading, error, refresh };
}
