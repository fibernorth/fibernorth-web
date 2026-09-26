// A small in-memory Firestore for running route and server-action code in
// tests. Supports what the quote code uses: doc get/set/update/delete,
// where("==")/limit/orderBy queries, transactions (reads, then writes applied
// in order; an update to a missing doc fails the whole commit, as in
// Firestore), batches, set with { merge: true }, and the arrayUnion /
// increment / delete sentinels.
//
// Use with vi.mock("firebase-admin/firestore", () => fakeFirestoreModule(() => db)).

type Doc = Record<string, any>;

export class ArrayUnion {
  constructor(public items: unknown[]) {}
}
export class Increment {
  constructor(public n: number) {}
}
export class Delete {}

export const FakeFieldValue = {
  arrayUnion: (...items: unknown[]) => new ArrayUnion(items),
  increment: (n: number) => new Increment(n),
  delete: () => new Delete(),
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function applyPatch(cur: Doc, patch: Doc): Doc {
  const out: Doc = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) throw new Error(`Cannot use "undefined" as a Firestore value (field ${k})`);
    if (v instanceof ArrayUnion) {
      const arr = Array.isArray(out[k]) ? [...out[k]] : [];
      for (const it of v.items) if (!arr.some((x) => same(x, it))) arr.push(it);
      out[k] = arr;
    } else if (v instanceof Increment) {
      out[k] = (Number(out[k]) || 0) + v.n;
    } else if (v instanceof Delete) {
      delete out[k];
    } else {
      assertNoUndefined(v, k);
      out[k] = structuredClone(v);
    }
  }
  return out;
}

function assertNoUndefined(v: unknown, path: string) {
  if (v === undefined) throw new Error(`Cannot use "undefined" as a Firestore value (field ${path})`);
  if (Array.isArray(v)) v.forEach((x, i) => assertNoUndefined(x, `${path}.${i}`));
  else if (v && typeof v === "object" && !(v instanceof Date))
    for (const [k, x] of Object.entries(v)) assertNoUndefined(x, `${path}.${k}`);
}

export interface FakeDb {
  data: Record<string, Map<string, Doc>>;
  get(col: string, id: string): Doc | undefined;
  put(col: string, id: string, doc: Doc): void;
  [k: string]: any;
}

export function makeDb(): FakeDb {
  const data: Record<string, Map<string, Doc>> = {};
  let n = 0;
  const col = (name: string) => (data[name] ??= new Map());

  const snap = (c: string, id: string): any => {
    const d = col(c).get(id);
    return {
      id,
      exists: !!d,
      data: () => (d ? structuredClone(d) : undefined),
      get: (k: string) => (d ? structuredClone(d[k]) : undefined),
      ref: docRef(c, id),
    };
  };

  const docRef = (c: string, id: string): any => ({
    id,
    path: `${c}/${id}`,
    get: async () => snap(c, id),
    update: async (p: Doc) => {
      if (!col(c).has(id)) throw new Error(`NOT_FOUND: ${c}/${id}`);
      col(c).set(id, applyPatch(col(c).get(id)!, p));
    },
    set: async (p: Doc, opts?: { merge?: boolean }) =>
      void col(c).set(id, applyPatch(opts?.merge ? (col(c).get(id) ?? {}) : {}, p)),
    delete: async () => void col(c).delete(id),
  });

  const query = (c: string, filters: Array<[string, unknown]>, lim = Infinity): any => ({
    where: (f: string, op: string, v: unknown) => {
      if (op !== "==") throw new Error(`fakedb: only == is supported (got ${op})`);
      return query(c, [...filters, [f, v]], lim);
    },
    limit: (l: number) => query(c, filters, l),
    orderBy: () => query(c, filters, lim),
    get: async () => {
      const docs = [...col(c).keys()]
        .filter((id) => filters.every(([f, v]) => col(c).get(id)![f] === v))
        .slice(0, lim)
        .map((id) => snap(c, id));
      return { empty: docs.length === 0, docs, size: docs.length, forEach: (fn: (d: any) => void) => docs.forEach(fn) };
    },
  });

  const writer = () => {
    const ops: Array<() => Promise<void>> = [];
    return {
      ops,
      update(r: any, p: Doc) {
        ops.push(() => r.update(p));
        return this;
      },
      set(r: any, p: Doc, o?: { merge?: boolean }) {
        ops.push(() => r.set(p, o));
        return this;
      },
      delete(r: any) {
        ops.push(() => r.delete());
        return this;
      },
    };
  };

  // Commit all or nothing, like Firestore: work on a copy, swap in at the end.
  const commit = async (ops: Array<() => Promise<void>>) => {
    const backup = Object.fromEntries(Object.entries(data).map(([k, m]) => [k, new Map([...m].map(([i, d]) => [i, structuredClone(d)]))]));
    try {
      for (const op of ops) await op();
    } catch (e) {
      for (const k of Object.keys(data)) delete data[k];
      Object.assign(data, backup);
      throw e;
    }
  };

  const db: FakeDb = {
    data,
    get: (c: string, id: string) => col(c).get(id),
    put: (c: string, id: string, d: Doc) => void col(c).set(id, structuredClone(d)),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const w = writer();
      // Firestore refuses a read after the first write in a transaction.
      const get = async (r: any) => {
        if (w.ops.length) throw new Error("Firestore transactions require all reads to be executed before all writes.");
        return r.get();
      };
      const tx = { ...w, get, update: w.update, set: w.set, delete: w.delete };
      const out = await fn(tx);
      await commit(w.ops);
      return out;
    },
    batch: () => {
      const w = writer();
      return { update: w.update.bind(w), set: w.set.bind(w), delete: w.delete.bind(w), commit: () => commit(w.ops) };
    },
    collection: (c: string) => ({
      ...query(c, []),
      doc: (id?: string) => docRef(c, id ?? `auto${++n}`),
      add: async (d: Doc) => {
        const id = `auto${++n}`;
        col(c).set(id, applyPatch({}, d));
        return docRef(c, id);
      },
    }),
  };
  return db;
}

/** The mocked "firebase-admin/firestore" module, reading the current db. */
export function fakeFirestoreModule(current: () => FakeDb) {
  return { getFirestore: () => current(), FieldValue: FakeFieldValue };
}
