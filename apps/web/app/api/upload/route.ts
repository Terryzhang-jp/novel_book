import { uploadFile, getPublicUrl } from "@/lib/supabase/storage";
import { NextResponse } from "next/server";

// Use Node.js runtime for better compatibility with Buffer/Stream handling in Supabase client
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // 1. Check for file
    if (!req.body) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    // 2. Get metadata
    const filename = req.headers.get("x-vercel-filename") || "image.png";
    const contentType = req.headers.get("content-type") || "application/octet-stream";

    // 3. Prepare file for upload
    // Convert stream to Buffer for reliable upload
    const arrayBuffer = await req.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 4. Generate unique path
    // documents/timestamp-random-filename
    const uniqueId = crypto.randomUUID();
    const path = `uploads/${Date.now()}-${uniqueId}-${filename}`;
    const bucket = "documents";

    // 5. Upload to Supabase
    await uploadFile(bucket, path, buffer, {
      contentType,
      upsert: false
    });

    // 6. Get Public URL
    const url = getPublicUrl(bucket, path);

    return NextResponse.json({ url });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}
