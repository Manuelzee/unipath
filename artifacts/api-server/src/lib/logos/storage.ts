import { Storage } from "@google-cloud/storage";

const client = new Storage({
  credentials: {
    audience: "replit", subject_token_type: "access_token", type: "external_account",
    token_url: "http://127.0.0.1:1106/token",
    credential_source: { url: "http://127.0.0.1:1106/credential", format: { type: "json", subject_token_field_name: "access_token" } },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export function logoObject(key: string) {
  if (!/^institution-(?:logos|branding)\/[a-f0-9]{64}\.webp$/.test(key)) throw new Error("Invalid institution image object key.");
  const directory = process.env.PRIVATE_OBJECT_DIR;
  if (!directory) throw new Error("Logo storage is not configured.");
  const [bucket, ...prefix] = directory.replace(/^\/+/, "").split("/");
  return client.bucket(bucket).file([...prefix, key].join("/"));
}

export async function cacheLogo(key: string, bytes: Buffer) {
  const file = logoObject(key);
  if ((await file.exists())[0]) return;
  try {
    await file.save(bytes, { resumable: false, preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" } });
  } catch (error) {
    if ((error as { code?: number }).code !== 412) throw error;
  }
}
