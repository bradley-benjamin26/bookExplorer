// In-memory stand-in for AsyncStorage, so storage modules can be tested in
// plain Node without React Native. Each test file gets its own module
// instance; call `clear()` in beforeEach to isolate tests within a file.
//
// Every operation yields to the event loop first, like real storage I/O —
// resolving synchronously would hide read-modify-write races, since one
// operation would always finish before the next could start.
const store = new Map<string, string>();
const io = () => new Promise((resolve) => setTimeout(resolve, 0));

const AsyncStorage = {
  getItem: async (key: string) => {
    await io();
    return store.get(key) ?? null;
  },
  setItem: async (key: string, value: string) => {
    await io();
    store.set(key, value);
  },
  removeItem: async (key: string) => {
    await io();
    store.delete(key);
  },
  getAllKeys: async () => {
    await io();
    return [...store.keys()];
  },
  clear: async () => {
    store.clear();
  },
};

export default AsyncStorage;
