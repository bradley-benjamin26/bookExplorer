// In-memory stand-in for AsyncStorage, so storage modules can be tested in
// plain Node without React Native. Each test file gets its own module
// instance; call `clear()` in beforeEach to isolate tests within a file.
const store = new Map<string, string>();

const AsyncStorage = {
  getItem: async (key: string) => store.get(key) ?? null,
  setItem: async (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: async (key: string) => {
    store.delete(key);
  },
  clear: async () => {
    store.clear();
  },
};

export default AsyncStorage;
