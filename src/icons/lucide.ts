import data from "@iconify-json/lucide/icons.json";

export default function lucide(name: string): string {
  const icon = (data.icons as Record<string, { body: string; width?: number; height?: number }>)[name];
  if (!icon) throw new Error(`[astro-iconify] Icon "lucide:${name}" not found in @iconify-json/lucide`);
  const width = icon.width ?? data.width ?? 24;
  const height = icon.height ?? data.height ?? 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${icon.body}</svg>`;
}
