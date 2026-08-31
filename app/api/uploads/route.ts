import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { auth } from "@/lib/auth";
import { uploadImage } from "@/lib/storage/r2";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const SIZES: { name: "sm" | "md" | "full"; maxDimension: number }[] = [
  { name: "sm", maxDimension: 150 },
  { name: "md", maxDimension: 500 },
  { name: "full", maxDimension: 1200 },
];

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const purpose = formData.get("purpose");
  const folder = purpose === "avatar" ? "profilepictures" : "covers";

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, and WebP images are allowed" },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: "File must be 5MB or smaller" }, { status: 400 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const uid = randomUUID();

  let resizedBuffers: { name: "sm" | "md" | "full"; buffer: Buffer }[];
  try {
    resizedBuffers = await Promise.all(
      SIZES.map(async ({ name, maxDimension }) => ({
        name,
        buffer: await sharp(inputBuffer)
          .rotate()
          .resize({
            width: maxDimension,
            height: maxDimension,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp()
          .toBuffer(),
      }))
    );
  } catch (err) {
    console.error("Image processing failed", err);
    return NextResponse.json(
      { error: "That image couldn't be processed. It may be corrupt or an unsupported format." },
      { status: 400 }
    );
  }

  try {
    await Promise.all(
      resizedBuffers.map(({ name, buffer }) => uploadImage(`${folder}/${uid}-${name}.webp`, buffer, "image/webp"))
    );
  } catch (err) {
    console.error("R2 upload failed", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ uid }, { status: 201 });
}
