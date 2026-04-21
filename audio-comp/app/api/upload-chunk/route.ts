import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const chunkIndex = parseInt(formData.get("chunkIndex") as string, 10);
    const totalChunks = parseInt(formData.get("totalChunks") as string, 10);
    const fileName = formData.get("fileName") as string;
    const chunk = formData.get("chunk") as Blob;

    if (!fileName || isNaN(chunkIndex) || isNaN(totalChunks) || !chunk) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const tempDir = path.join(process.cwd(), "uploads", "temp");
    const finalDir = path.join(process.cwd(), "uploads", "final");

    await fs.promises.mkdir(tempDir, { recursive: true });
    await fs.promises.mkdir(finalDir, { recursive: true });

    const tempFilePath = path.join(tempDir, fileName);

    const arrayBuffer = await chunk.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // If it's the first chunk, ensure we start fresh (in case of a previous failed upload)
    if (chunkIndex === 0 && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    // Append the chunk synchronously as required
    fs.appendFileSync(tempFilePath, buffer);

    // If it's the final chunk, move to the final directory
    if (chunkIndex === totalChunks - 1) {
      const finalFilePath = path.join(finalDir, fileName);
      if (fs.existsSync(finalFilePath)) {
        fs.unlinkSync(finalFilePath);
      }
      fs.renameSync(tempFilePath, finalFilePath);
      return NextResponse.json({ success: true, status: "completed" });
    }

    return NextResponse.json({ success: true, status: "chunk_received" });
  } catch (error: any) {
    console.error("Upload chunk error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
