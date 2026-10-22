import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { config } from "../../config.js";
import { HttpError } from "../../lib/http-error.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.mimetype)) return cb(null, true);
    cb(new HttpError(400, "invalid_file_type", "Only JPEG, PNG, WebP or AVIF images are allowed"));
  },
});

export const adminUploadsRouter = Router();

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";

// Re-encodes every upload to WebP (max 2000px wide): strips metadata, removes
// any embedded payloads and gives the storefront a modern, compact format.
adminUploadsRouter.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) throw new HttpError(400, "validation_error", "No file uploaded");
  const base = slugify(typeof req.body?.name === "string" && req.body.name ? req.body.name : req.file.originalname);
  const filename = `${base}-${randomBytes(4).toString("hex")}.webp`;
  await mkdir(config.uploadDir, { recursive: true });
  let info;
  try {
    info = await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 2000, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(config.uploadDir, filename));
  } catch {
    throw new HttpError(400, "invalid_image", "The file could not be read as an image");
  }
  res.status(201).json({ url: `/uploads/${filename}`, width: info.width, height: info.height });
});
