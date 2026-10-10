// Transactional in-memory adapter for route tests. Reads carry document versions;
// concurrent commits retry the actual callback before any write is committed.
class MockPacketFirestore {
  constructor() { this.records = new Map(); this.versions = new Map(); this.sequence = 0; this.beforeCommit = null; }
  put(path, value) { this.records.set(path, structuredClone(value)); this.versions.set(path, (this.versions.get(path) || 0) + 1); }
  snapshot(path) {
    const value = this.records.get(path);
    return { id: path.split('/').at(-1), exists: value !== undefined, data: () => value === undefined ? undefined : structuredClone(value) };
  }
  collection(path) {
    const database = this;
    return {
      doc: id => database.doc(`${path}/${id}`),
      get: async () => ({docs: [...database.records.keys()].filter(key => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/')).map(key => database.snapshot(key))}),
      add: async value => { const ref = database.doc(`${path}/generated_${++database.sequence}`); await ref.set(value); return ref; },
    };
  }
  doc(path) {
    const database = this;
    return {
      id: path.split('/').at(-1), path,
      collection: name => database.collection(`${path}/${name}`),
      get: async () => database.snapshot(path),
      set: async (value, options) => database.put(path, options?.merge ? {...database.records.get(path), ...value} : value),
    };
  }
  async runTransaction(callback) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const reads = new Map();
      const writes = [];
      const result = await callback({
        get: async ref => {
          if (writes.length) throw new Error('Read after transaction write');
          reads.set(ref.path, this.versions.get(ref.path) || 0);
          return this.snapshot(ref.path);
        },
        set: (ref, value, options) => writes.push({ref, value, options}),
        delete: ref => writes.push({ref, remove: true}),
      });
      if (this.beforeCommit) await this.beforeCommit({attempt, reads, writes});
      if ([...reads].some(([key, version]) => (this.versions.get(key) || 0) !== version)) continue;
      for (const {ref, value, options, remove} of writes) {
        if (remove) { this.records.delete(ref.path); this.versions.set(ref.path, (this.versions.get(ref.path) || 0) + 1); }
        else this.put(ref.path, options?.merge ? {...this.records.get(ref.path), ...value} : value);
      }
      return result;
    }
    throw new Error('Transaction conflict retry limit');
  }
}
module.exports = {MockPacketFirestore};
