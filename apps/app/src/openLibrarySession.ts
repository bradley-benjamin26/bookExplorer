import { createSessionStore } from "./sessionStore";

const store = createSessionStore("openlibrary-session");

export const loadOpenLibrarySession = store.load;
export const getOpenLibrarySessionToken = store.get;
export const saveOpenLibrarySession = store.save;
export const onOpenLibrarySessionCleared = store.onCleared;
export const clearOpenLibrarySession = store.clear;
