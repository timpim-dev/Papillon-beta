const ALLOWED_DEEPLINKS_SCHEME = new Set<string>([]);
const ALLOWED_WIDGET_PATHS = new Set<string>([
  "papillon://(tabs)/calendar",
  "papillon://(tabs)/grades",
  "papillon://(tabs)/tasks",
]);

export function redirectSystemPath({ path }: { path: string }) {
  if (ALLOWED_WIDGET_PATHS.has(path)) {
    return path.replace(/^papillon:\/\//i, "/");
  }
  const scheme = path.split(":")[0].toLowerCase();
  return ALLOWED_DEEPLINKS_SCHEME.has(scheme) ? path : "/";
}
