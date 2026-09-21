import AsyncStorage from "@react-native-async-storage/async-storage";

const LIBRARIES_KEY = "book-explorer:libraries";

// Superseded by LIBRARIES_KEY (a single library became a list of them), but
// read once on startup to migrate anyone who configured a library under the
// old single-library scheme so they don't lose it silently.
const LEGACY_ISBN_URL_KEY = "book-explorer:local-library-isbn-url";
const LEGACY_TITLE_URL_KEY = "book-explorer:local-library-title-url";

export interface Library {
  id: string;
  name: string;
  isbnUrl: string;
  titleUrl: string;
}

function isConfigured(library: Library): boolean {
  return library.isbnUrl.trim().length > 0 || library.titleUrl.trim().length > 0;
}

async function migrateLegacyLibrary(): Promise<Library[]> {
  const [isbnUrl, titleUrl] = await Promise.all([
    AsyncStorage.getItem(LEGACY_ISBN_URL_KEY),
    AsyncStorage.getItem(LEGACY_TITLE_URL_KEY),
  ]);
  if (!isbnUrl && !titleUrl) return [];

  const migrated: Library[] = [
    { id: generateLibraryId(), name: "My Library", isbnUrl: isbnUrl ?? "", titleUrl: titleUrl ?? "" },
  ];
  await saveLibraries(migrated);
  await Promise.all([AsyncStorage.removeItem(LEGACY_ISBN_URL_KEY), AsyncStorage.removeItem(LEGACY_TITLE_URL_KEY)]);
  return migrated;
}

export function generateLibraryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getLibraries(): Promise<Library[]> {
  const raw = await AsyncStorage.getItem(LIBRARIES_KEY);
  if (!raw) return migrateLegacyLibrary();

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Libraries a user has actually filled in at least one search URL for — the
 * ones worth showing as "Find at ..." links, as opposed to a freshly added,
 * still-blank card sitting in the settings editor. */
export async function getConfiguredLibraries(): Promise<Library[]> {
  const libraries = await getLibraries();
  return libraries.filter(isConfigured);
}

export async function saveLibraries(libraries: Library[]): Promise<void> {
  await AsyncStorage.setItem(LIBRARIES_KEY, JSON.stringify(libraries));
}

export async function upsertLibrary(library: Library): Promise<Library[]> {
  const libraries = await getLibraries();
  const index = libraries.findIndex((l) => l.id === library.id);
  const next = index === -1 ? [...libraries, library] : libraries.map((l, i) => (i === index ? library : l));
  await saveLibraries(next);
  return next;
}

export async function removeLibrary(id: string): Promise<Library[]> {
  const libraries = await getLibraries();
  const next = libraries.filter((l) => l.id !== id);
  await saveLibraries(next);
  return next;
}

/**
 * The saved value is either a template containing the given placeholder
 * (substituted wherever it appears) or a plain prefix URL, which most
 * library catalog search links already are once you strip the search term
 * off the end of a URL you copied after searching once — the term is just
 * appended in that case.
 */
function buildSearchUrl(template: string, placeholder: string, value: string): string {
  return template.includes(placeholder) ? template.replaceAll(placeholder, value) : `${template}${value}`;
}

export function buildLibraryIsbnSearchUrl(template: string, isbn: string): string {
  return buildSearchUrl(template, "{isbn}", isbn);
}

export function buildLibraryTitleSearchUrl(template: string, title: string): string {
  return buildSearchUrl(template, "{title}", encodeURIComponent(title));
}
