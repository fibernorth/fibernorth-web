// In-memory Firestore (Admin SDK shape) for the bulk-operation tests:
// import runs and their undo, the repair plan, the Bore-ON pull-all preview.
// Beyond fakedb.ts / fakedb-leads.ts it has create(), arrayRemove, the
// delete sentinel, set({ merge }), ">" / "<=" filters, and transactions that
// commit all-or-nothing with reads before writes.
//
// Usage:
//   let db: FakeDb;
//   vi.mock("firebase-admin/firestore", async () => (await import("@/test/fakedb-bulk")).fakeFirestoreModule(() => db));

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>;

export class ArrayUnion {
  constructor(public items: unknown[]) {}
}
export class ArrayRemove {
  constructor(public items: unknown[]) {}
}
export class Increment {
  constructor(public n: number) {}
}
export class Delete {}

export const FakeFieldValue = {
  arrayUnion: (...items: unknown[]) => new ArrayUnion(items),
  arrayRemove: (...items: unknown[]) => new ArrayRemove(items),
  increment: (n: number) => new Increment(n),
  delete: () => new Delete(),
};

/** Firestore compares maps by content, not key order. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Doc)
        .sort()
        .map((k) => [k, canon((v as Doc)[k])])
    );
  }
  return v;
}
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

function assertNoUndefined(v: unknown, path: string) {
  if (v === undefined) throw new Error(`Cannot use "undefined" as a Firestore value (field ${path})`);
  if (Array.isArray(v)) v.forEach((x, i) => assertNoUndefined(x, `${path}.${i}`));
  else if (v && typeof v === "object" && !(v instanceof Date) && !(v instanceof ArrayUnion) && !(v instanceof ArrayRemove))
    for (const [k, x] of Object.entries(v)) assertNoUndefined(x, `${path}.${k}`);
}

function applyPatch(cur: Doc, patch: Doc): Doc {
  const out: Doc = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    assertNoUndefined(v, k);
    if (v instanceof ArrayUnion) {
      const arr = Array.isArray(out[k]) ? [...out[k]] : [];
      for (const it of v.items) if (!arr.some((x) => same(x, it))) arr.push(structuredClone(it));
      out[k] = arr;
    } else if (v instanceof ArrayRemove) {
      const arr = Array.isArray(out[k]) ? [...out[k]] : [];
      out[k] = arr.filter((x) => !v.items.some((it) => same(x, it)));
    } else if (v instanceof Increment) {
      out[k] = (Number(out[k]) || 0) + v.n;
    } else if (v instanceof Delete) {
      delete out[k];
    } else {
      out[k] = structuredClone(v);
    }
  }
  return out;
}

type Filter = [string, string, any];

export interface FakeDb {
  data: Record<string, Map<string, Doc>>;
  get(col: string, id: string): Doc | undefined;
  put(col: string, id: string, doc: Doc): void;
  all(col: string): Array<Doc & { id: string }>;
  collection(name: string): any;
  runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
  batch(): any;
  /** Called before each transaction commits (tests use it to sneak in a concurrent write). */
  beforeCommit?: () => void;
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

  const alreadyExists = () => Object.assign(new Error("6 ALREADY_EXISTS: Document already exists"), { code: 6 });
  const notFound = (c: string, id: string) => Object.assign(new Error(`5 NOT_FOUND: ${c}/${id}`), { code: 5 });

  const docRef = (c: string, id: string): any => ({
    id,
    path: `${c}/${id}`,
    get: async () => snap(c, id),
    update: async (p: Doc) => {
      if (!col(c).has(id)) throw notFound(c, id);
      col(c).set(id, applyPatch(col(c).get(id)!, p));
    },
    set: async (p: Doc, opts?: { merge?: boolean }) => {
      col(c).set(id, applyPatch(opts?.merge ? col(c).get(id) || {} : {}, p));
    },
    create: async (p: Doc) => {
      if (col(c).has(id)) throw alreadyExists();
      col(c).set(id, applyPatch({}, p));
    },
    delete: async () => {
      col(c).delete(id);
    },
  });

  const matches = (d: Doc, [f, op, v]: Filter) => {
    const x = d[f];
    if (op === "==") return same(x, v);
    if (op === ">") return x !== undefined && x > v;
    if (op === ">=") return x !== undefined && x >= v;
    if (op === "<") return x !== undefined && x < v;
    if (op === "<=") return x !== undefined && x <= v;
    if (op === "array-contains") return Array.isArray(x) && x.some((y) => same(y, v));
    throw new Error(`fakedb: unsupported op ${op}`);
  };

  const query = (c: string, filters: Filter[], lim = Infinity, order?: [string, string]): any => ({
    where: (f: string, op: string, v: any) => query(c, [...filters, [f, op, v]], lim, order),
    limit: (l: number) => query(c, filters, l, order),
    orderBy: (f: string, dir = "asc") => query(c, filters, lim, [f, dir]),
    select: () => query(c, filters, lim, order),
    get: async () => {
      let ids = [...col(c).keys()].filter((id) => filters.every((flt) => matches(col(c).get(id)!, flt)));
      if (order) {
        const [f, dir] = order;
        ids = ids.filter((id) => col(c).get(id)![f] !== undefined);
        ids.sort((a, b) => {
          const x = col(c).get(a)![f];
          const y = col(c).get(b)![f];
          return (x < y ? -1 : x > y ? 1 : 0) * (dir === "desc" ? -1 : 1);
        });
      }
      const docs = ids.slice(0, lim).map((id) => snap(c, id));
      return { empty: docs.length === 0, docs, size: docs.length, forEach: (fn: any) => docs.forEach(fn) };
    },
  });

  const writer = () => {
    const ops: Array<() => Promise<void>> = [];
    const w = {
      ops,
      update(r: any, p: Doc) {
        ops.push(() => r.update(p));
        return w;
      },
      set(r: any, p: Doc, opts?: { merge?: boolean }) {
        ops.push(() => r.set(p, opts));
        return w;
      },
      create(r: any, p: Doc) {
        ops.push(() => r.create(p));
        return w;
      },
      delete(r: any) {
        ops.push(() => r.delete());
        return w;
      },
    };
    return w;
  };

  // All or nothing, like Firestore: on failure put everything back.
  const commit = async (ops: Array<() => Promise<void>>) => {
    const backup = Object.fromEntries(
      Object.entries(data).map(([k, m]) => [k, new Map([...m].map(([i, d]) => [i, structuredClone(d)]))])
    );
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
    get: (c, id) => col(c).get(id),
    put: (c, id, d) => void col(c).set(id, structuredClone(d)),
    all: (c) => [...col(c).entries()].map(([id, d]) => ({ id, ...structuredClone(d) })),
    runTransaction: async (fn) => {
      const w = writer();
      const get = async (r: any) => {
        if (w.ops.length) throw new Error("Firestore transactions require all reads to be executed before all writes.");
        return r.get();
      };
      const out = await fn({ get, update: w.update, set: w.set, create: w.create, delete: w.delete });
      db.beforeCommit?.();
      await commit(w.ops);
      return out;
    },
    batch: () => {
      const w = writer();
      return { update: w.update, set: w.set, create: w.create, delete: w.delete, commit: () => commit(w.ops) };
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
