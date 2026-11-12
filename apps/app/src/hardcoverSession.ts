import { createSessionStore } from "./sessionStore";

const store = createSessionStore("hardcover-session");

export const loadSession = store.load;
export const getSessionToken = store.get;
export const saveSession = store.save;
export const onSessionCleared = store.onCleared;
export const clearSession = store.clear;
