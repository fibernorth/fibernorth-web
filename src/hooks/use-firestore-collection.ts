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
  /** Subscribe again (e.g. to retry after a permission error). */
  refresh: () => void;
}

interface UseFirestoreCollectionOptions {
  constraints?: QueryConstraint[];
}

/**
 * A stable description of the query constraints, values included, so the
 * subscription is redone when a filter's value changes (where("leadId",
 * "==", a) -> b), not only when the kind of constraint changes. The SDK
 * keeps the field, operator, value, limit and direction on each constraint.
 */
export function constraintsKeyOf(constraints: QueryConstraint[] | undefined): string {
  const seen = new WeakSet<object>();
  const replacer = (_k: string, v: unknown) => {
    if (typeof v === "object" && v !== null) {
      if (seen.has(v)) return "[circular]";
      seen.add(v);
      // A DocumentReference / Firestore instance: its path is what matters.
      const path = (v as { path?: unknown }).path;
      if (typeof path === "string" && "firestore" in (v as object)) return `ref:${path}`;
    }
    return v;
  };
  return JSON.stringify(
    (constraints ?? []).map((c) => {
      const raw = c as unknown as Record<string, unknown>;
      const parts: Record<string, unknown> = { type: c.type };
      for (const k of Object.keys(raw)) {
        if (k === "type") continue;
        try {
          parts[k] = JSON.parse(JSON.stringify(raw[k], replacer) ?? "null");
        } catch {
          parts[k] = String(raw[k]);
        }
      }
      return parts;
    })
  );
}

export function useFirestoreCollection<T extends DocumentData>(
  path: string | null,
  options?: UseFirestoreCollectionOptions
): UseFirestoreCollectionReturn<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const constraintsKey = constraintsKeyOf(options?.constraints);

  // A different query: forget the old one's error.
  useEffect(() => {
    setError(null);
  }, [path, constraintsKey]);

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
        // A retry that works clears the old error. (It isn't cleared when the
        // retry starts, so a screen showing a fallback doesn't flicker.)
        setError(null);
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
