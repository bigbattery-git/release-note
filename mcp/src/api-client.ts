const BASE_URL = process.env.HELLDIVERS_API_URL ?? 'https://api.helldivers2.dev';
const CLIENT = process.env.HELLDIVERS_SUPER_CLIENT ?? 'api.helldivers2.dev';
const CONTACT = process.env.HELLDIVERS_SUPER_CONTACT ?? '';

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Super-Client': CLIENT, 'X-Super-Contact': CONTACT, Accept: 'application/json' },
    signal,
  });
  if (!response.ok) {
    const retryAfter = response.headers.get('retry-after');
    throw new Error(`Helldivers API ${response.status}${retryAfter ? `; retry after ${retryAfter}s` : ''}`);
  }
  return await response.json() as T;
}
