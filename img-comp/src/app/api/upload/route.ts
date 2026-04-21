import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploadDir = path.join(process.cwd(), 'uploads');
    
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Create unique filename
    const extension = file.name.split('.').pop() || 'webp';
    const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}.${extension}`;
    const filePath = path.join(uploadDir, filename);

    // Write file to filesystem
    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({ 
      success: true, 
      filename,
      message: 'File saved successfully'
    });
  } catch (error) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
