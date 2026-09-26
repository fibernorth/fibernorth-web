// Minimal in-memory Firestore (Admin SDK shape) for running route and
// server code in tests. Supports what the lead code uses: doc get / set /
// update / create, where (==, >=, <, array-contains), orderBy, limit,
// select, add, transactions, and FieldValue.arrayUnion via ArrayUnion.
//
// Usage in a test file:
//   let db: FakeDb;
//   vi.mock("firebase-admin/firestore", () => ({
//     getFirestore: () => db,
//     FieldValue: { arrayUnion: (...items: unknown[]) => new ArrayUnion(items) },
//   }));

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>;

export class ArrayUnion {
  constructor(public items: unknown[]) {}
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function applyPatch(cur: Doc, patch: Doc): Doc {
  const out = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) throw new Error(`Cannot use "undefined" as a Firestore value (field ${k})`);
    if (v instanceof ArrayUnion) {
      const arr = Array.isArray(out[k]) ? [...out[k]] : [];
      for (const it of v.items) if (!arr.some((x) => same(x, it))) arr.push(it);
      out[k] = arr;
    } else out[k] = v;
  }
  return out;
}

type Filter = [string, string, any];

export interface FakeDb {
  data: Record<string, Map<string, Doc>>;
  collection: (name: string) => any;
  runTransaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>;
  /** Every doc in a collection, with its id. */
  all: (name: string) => Array<Doc & { id: string }>;
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
      get: (k: string) => d?.[k],
      ref: docRef(c, id),
    };
  };

  const docRef = (c: string, id: string): any => ({
    id,
    path: `${c}/${id}`,
    get: async () => snap(c, id),
    update: async (p: Doc) => {
      if (!col(c).has(id)) throw Object.assign(new Error("NOT_FOUND"), { code: 5 });
      col(c).set(id, applyPatch(col(c).get(id)!, p));
    },
    set: async (p: Doc) => {
      col(c).set(id, applyPatch({}, p));
    },
    create: async (p: Doc) => {
      if (col(c).has(id)) throw Object.assign(new Error("6 ALREADY_EXISTS: Document already exists"), { code: 6 });
      col(c).set(id, applyPatch({}, p));
    },
    delete: async () => {
      col(c).delete(id);
    },
  });

  const matches = (d: Doc, [f, op, v]: Filter) => {
    const x = d[f];
    if (op === "==") return x === v;
    if (op === ">=") return x !== undefined && x >= v;
    if (op === "<") return x !== undefined && x < v;
    if (op === "array-contains") return Array.isArray(x) && x.some((y) => same(y, v));
    throw new Error(`fakedb: unsupported op ${op}`);
  };

  const query = (c: string, filters: Filter[], lim = Infinity, order?: [string, string], after?: any): any => ({
    where: (f: string, op: string, v: any) => query(c, [...filters, [f, op, v]], lim, order, after),
    limit: (l: number) => query(c, filters, l, order, after),
    orderBy: (f: string, dir = "asc") => query(c, filters, lim, [f, dir], after),
    startAfter: (s: any) => query(c, filters, lim, order, s),
    select: () => query(c, filters, lim, order, after),
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
      if (after) ids = ids.slice(ids.indexOf(after.id) + 1);
      const docs = ids.slice(0, lim).map((id) => snap(c, id));
      return { empty: docs.length === 0, docs, size: docs.length, forEach: (fn: any) => docs.forEach(fn) };
    },
  });

  return {
    data,
    all: (name) => [...col(name).entries()].map(([id, d]) => ({ id, ...structuredClone(d) })),
    runTransaction: async (fn) => {
      const ops: Array<() => Promise<void>> = [];
      const tx = {
        get: async (r: any) => r.get(),
        update: (r: any, p: Doc) => {
          ops.push(() => r.update(p));
        },
        set: (r: any, p: Doc) => {
          ops.push(() => r.set(p));
        },
        create: (r: any, p: Doc) => {
          ops.push(() => r.create(p));
        },
      };
      const out = await fn(tx);
      for (const op of ops) await op();
      return out;
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
}
