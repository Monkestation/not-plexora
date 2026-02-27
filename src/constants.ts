import path from "node:path";
export const DATA_FOLDER = path.join(import.meta.dirname, "..", "data");
export const MODULES_DIRECTORY = path.join(import.meta.dirname, "modules");

// A regex for file types that can be ESM modules
export const moduleFiletypeRegex = /\.(cjs|mjs|js|mts|cts|ts)$/i;
