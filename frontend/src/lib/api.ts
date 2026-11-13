const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
let accessToken: string | null = null;
export function setAccessToken(token: string | null): void { accessToken = token; }
export function getAccessToken(): string | null { return accessToken; }
export class ApiError extends Error {
  status: number; code: string;
  constructor(message: string,status:number,code='REQUEST_ERROR'){ super(message); this.status=status; this.code=code; }
}
export async function api<T>(path:string, options:RequestInit = {}):Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
  if (accessToken) headers.set('Authorization',`Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE}${path}`,{...options,headers,credentials:'include'});
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    if (!response.ok) throw new ApiError('The server could not complete this request.',response.status);
    return await response.text() as T;
  }
  const data = await response.json() as T & {error?:{message?:string;code?:string}};
  if (!response.ok) throw new ApiError(data.error?.message ?? 'The server could not complete this request.',response.status,data.error?.code);
  return data;
}
export function apiBaseUrl():string { return API_BASE; }
