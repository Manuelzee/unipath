import sharp from "sharp";
import { load } from "cheerio";

export async function prepareLogoImage(bytes: Buffer, type: string) {
  if (type.includes("svg") || bytes.subarray(0, 400).toString().includes("<svg")) {
    const text = bytes.toString("utf8");
    if (/<!DOCTYPE|<!ENTITY|<script|<foreignObject/i.test(text)) throw new Error("SVG contains unsafe or external content.");
    const $ = load(text, { xmlMode: true });
    for (const element of $("*").toArray()) {
      if (!("attribs" in element)) continue;
      for (const [key, value] of Object.entries(element.attribs)) {
        if (/^on/i.test(key) || (/(^|:)href$/i.test(key) && value && !value.startsWith("#"))) {
          throw new Error("SVG contains unsafe or external content.");
        }
      }
    }
    if ($("style").toArray().some((element) => /@import|\\|url\s*\(\s*['"]?(?!#)[^)]/i.test($(element).text()))) {
      throw new Error("SVG contains unsafe or external content.");
    }
  }
  const image = sharp(bytes, { limitInputPixels: 16_000_000, animated: false });
  const metadata = await image.metadata();
  if (!["png", "jpeg", "webp", "gif", "avif", "svg"].includes(metadata.format ?? "")) {
    throw new Error("Logo source format is not supported.");
  }
  const result = await image.rotate().resize({ width: 512, height: 256, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
  if (result.info.width < 16 || result.info.height < 16) throw new Error("Logo image is too small.");
  return result;
}
