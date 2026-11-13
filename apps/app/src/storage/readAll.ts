import AsyncStorage from "@react-native-async-storage/async-storage";
import { enqueueWrite } from "./writeQueue";

/** Every record under `prefix` in one multiGet, after each key's queued writes land; a missing or damaged value is skipped. */
export async function readAllRecords<T>(prefix: string): Promise<T[]> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix));
  await Promise.all(keys.map((k) => enqueueWrite(k, async () => {})));
  const records: T[] = [];
  for (const [, raw] of await AsyncStorage.multiGet(keys)) {
    if (!raw) continue;
    try {
      records.push(JSON.parse(raw) as T);
    } catch {
      // damaged record: skip it, keep the rest
    }
  }
  return records;
}
