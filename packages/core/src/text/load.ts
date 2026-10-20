import { readFileSync } from "node:fs";
import { parseDocument } from "yaml";

const ROOT = new URL("../../text/", import.meta.url);
const cache = new Map<string, unknown>();

function resource(name: string, extension: string): string {
  if (!/^[\w-]+(?:\/[\w-]+)*$/.test(name)) throw new Error(`Invalid text resource: ${name}`);
  return readFileSync(new URL(`${name}.${extension}`, ROOT), "utf8");
}

export function markdown(name: string): string {
  return resource(name, "md").trim();
}

export function fill(template: string, values: Record<string, unknown>): string {
  return template.replace(/{{(\w+)}}/g, (_, key: string) => {
    if (!Object.hasOwn(values, key)) throw new Error(`Missing text parameter: ${key}`);
    return String(values[key]);
  });
}

export function parseCatalog(source: string, name = "catalog"): Record<string, string> {
  const document = parseDocument(source, { uniqueKeys: true });
  if (document.errors.length) throw new Error(`Invalid text catalog ${name}: ${document.errors[0]!.message}`);
  const value: unknown = document.toJS();
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.values(value).some((entry) => typeof entry !== "string")) {
    throw new Error(`Text catalog entries must be strings: ${name}`);
  }
  return value as Record<string, string>;
}

export function catalog(name: string): Record<string, string> {
  if (!cache.has(name)) cache.set(name, parseCatalog(resource(name, "yaml"), name));
  return cache.get(name) as Record<string, string>;
}

export function text(name: string, key: string, values?: Record<string, unknown>): string {
  const value = catalog(name)[key];
  if (typeof value !== "string") throw new Error(`Missing text entry: ${name}:${key}`);
  return values ? fill(value, values) : value;
}

export function section(name: string, key: string): string {
  const pattern = /^<!-- section:([\w-]+) -->\r?\n([\s\S]*?)^<!-- endsection -->/gm;
  const matches = [...markdown(name).matchAll(pattern)].filter((match) => match[1] === key);
  if (matches.length !== 1) throw new Error(`Missing or duplicate text section: ${name}:${key}`);
  return matches[0]![2]!.trim();
}
