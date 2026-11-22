import { objectExists, readObject, writeObject } from "../storage";

/**
 * Verified institution images (logos and branding media), cached in private
 * storage and served only through the routes that check verification status.
 */
function checkedKey(key: string) {
  if (!/^institution-(?:logos|branding)\/[a-f0-9]{64}\.webp$/.test(key)) throw new Error("Invalid institution image object key.");
  return key;
}

export function logoObject(key: string) {
  const safe = checkedKey(key);
  return {
    /** Same shape as the previous cloud-storage API: resolves to [exists]. */
    exists: async (): Promise<[boolean]> => [await objectExists(safe)],
    createReadStream: () => readObject(safe),
  };
}

export async function cacheLogo(key: string, bytes: Buffer) {
  await writeObject(checkedKey(key), bytes);
}
