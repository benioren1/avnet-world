// Data layer with a tiny Mongo-like API, so the app runs on a local JSON file
// during development and on MongoDB in production (set MONGO_URL).
//
// API (all async):
//   find(coll, filter)            -> docs[]   filter supports equality and { $in: [...] }
//   findOne(coll, filter)         -> doc | null
//   insertOne(coll, doc)          -> doc      doc.id must be unique within the collection
//   updateOne(coll, filter, set, { upsert })
//   deleteMany(coll, filter)

import fs from 'node:fs';
import path from 'node:path';

const COLLECTIONS = ['meta', 'players', 'questions', 'guesses', 'purchases', 'bonuses', 'events'];

function matches(doc, filter) {
  return Object.entries(filter).every(([k, v]) => {
    if (v && typeof v === 'object' && Array.isArray(v.$in)) return v.$in.includes(doc[k]);
    return doc[k] === v;
  });
}

class DuplicateError extends Error {
  constructor(id) { super(`duplicate id ${id}`); this.code = 'DUPLICATE'; }
}

function createFileStore(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let data = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
  if (fs.existsSync(file)) data = { ...data, ...JSON.parse(fs.readFileSync(file, 'utf8')) };

  let timer = null;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
      fs.renameSync(tmp, file);
    }, 100);
  };
  const clone = (d) => structuredClone(d);

  return {
    kind: 'file',
    async find(coll, filter = {}) { return data[coll].filter((d) => matches(d, filter)).map(clone); },
    async findOne(coll, filter) { const d = data[coll].find((x) => matches(x, filter)); return d ? clone(d) : null; },
    async insertOne(coll, doc) {
      if (data[coll].some((d) => d.id === doc.id)) throw new DuplicateError(doc.id);
      data[coll].push(clone(doc));
      persist();
      return doc;
    },
    async updateOne(coll, filter, set, { upsert = false } = {}) {
      const d = data[coll].find((x) => matches(x, filter));
      if (d) Object.assign(d, clone(set));
      else if (upsert) data[coll].push({ ...clone(filter), ...clone(set) });
      persist();
    },
    async deleteMany(coll, filter) {
      data[coll] = data[coll].filter((d) => !matches(d, filter));
      persist();
    },
  };
}

async function createMongoStore(url, dbName) {
  const { MongoClient } = await import('mongodb');
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db(dbName);
  for (const c of COLLECTIONS) await db.collection(c).createIndex({ id: 1 }, { unique: true });
  await db.collection('guesses').createIndex({ questionId: 1 });
  await db.collection('purchases').createIndex({ playerId: 1 });
  const opts = { projection: { _id: 0 } };

  return {
    kind: 'mongo',
    find: (coll, filter = {}) => db.collection(coll).find(filter, opts).toArray(),
    findOne: (coll, filter) => db.collection(coll).findOne(filter, opts),
    async insertOne(coll, doc) {
      try {
        await db.collection(coll).insertOne({ ...doc });
      } catch (e) {
        if (e.code === 11000) throw new DuplicateError(doc.id);
        throw e;
      }
      return doc;
    },
    async updateOne(coll, filter, set, { upsert = false } = {}) {
      await db.collection(coll).updateOne(filter, { $set: set }, { upsert });
    },
    async deleteMany(coll, filter) { await db.collection(coll).deleteMany(filter); },
  };
}

export async function createStore() {
  if (process.env.MONGO_URL) {
    return createMongoStore(process.env.MONGO_URL, process.env.MONGO_DB || 'architecture_game');
  }
  return createFileStore(process.env.DATA_FILE || path.resolve('data', 'db.json'));
}
