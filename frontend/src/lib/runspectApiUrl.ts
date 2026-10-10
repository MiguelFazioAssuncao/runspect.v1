const backendUrl = process.env.NEXT_PUBLIC_RUNSPECT_API_URL?.replace(/\/+$/, "");
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function runspectApiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${backendUrl || basePath}${normalizedPath}`;
}
