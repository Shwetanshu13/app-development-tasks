"use client";

import { useState, useRef, ChangeEvent, DragEvent } from "react";
import imageCompression from "browser-image-compression";
import { getImageData, compareImages } from "../utils/imageCompare";

export default function Home() {
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string>("");
  const [originalSize, setOriginalSize] = useState<number>(0);

  const [compressedUrl, setCompressedUrl] = useState<string>("");
  const [compressedSize, setCompressedSize] = useState<number>(0);

  const [diffUrl, setDiffUrl] = useState<string>("");
  const [ssimScore, setSsimScore] = useState<number | null>(null);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [dragActive, setDragActive] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getPercentageReduction = () => {
    if (!originalSize || !compressedSize) return 0;
    return (((originalSize - compressedSize) / originalSize) * 100).toFixed(1);
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processImage(e.dataTransfer.files[0]);
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      await processImage(e.target.files[0]);
    }
  };

  const processImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file.");
      return;
    }

    setIsProcessing(true);
    setSsimScore(null);

    try {
      const origUrl = URL.createObjectURL(file);
      setOriginalUrl(origUrl);
      setOriginalSize(file.size);
      setOriginalFile(file);

      // Compress options
      const options = {
        maxSizeMB: 50, // high enough to not force resize
        maxWidthOrHeight: undefined,
        useWebWorker: true,
        fileType: "image/webp" as const,
        initialQuality: 0.9,
      };

      const compressedFile = await imageCompression(file, options);

      const compUrl = URL.createObjectURL(compressedFile);
      setCompressedUrl(compUrl);
      setCompressedSize(compressedFile.size);

      // Get ImageData to compare
      const img1 = await getImageData(file);
      // Ensure we compare the exact same dimensions
      const img2 = await getImageData(compressedFile, {
        width: img1.width,
        height: img1.height,
      });

      const diffResult = compareImages(img1, img2);
      setDiffUrl(diffResult.diffUrl);
      setSsimScore(diffResult.ssimScore);

      // Upload the compressed image to the local server
      const formData = new FormData();
      const newName =
        file.name.substring(0, file.name.lastIndexOf(".")) + ".webp";
      formData.append("file", compressedFile, newName);

      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        console.error("Upload failed", await uploadRes.text());
      }
    } catch (err) {
      console.error("Processing failed:", err);
      alert("An error occurred during image processing.");
    } finally {
      setIsProcessing(false);
      // Reset input value so same file can be uploaded again if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const ssimPercentage = ssimScore !== null ? (ssimScore * 100).toFixed(2) : 0;
  const reduction = getPercentageReduction();

  return (
    <div className="container">
      <header className="header">
        <h1>Image Compression Tool</h1>
        <p>Client-side WebP compression with zero-data-loss verification</p>
      </header>

      <div
        className={`upload-zone ${dragActive ? "drag-active" : ""}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleChange}
        />
        {isProcessing ? (
          <div>
            <div className="loader"></div>
            <p style={{ marginTop: "1rem" }}>
              Processing and Analyzing Image...
            </p>
          </div>
        ) : (
          <div>
            <p>Drag & drop an image here</p>
            <button className="btn-primary">Browse Files</button>
          </div>
        )}
      </div>

      {originalUrl && !isProcessing && (
        <>
          <div className="metrics-bar">
            <div className="metric-item">
              <div className="metric-label">Size Reduction</div>
              <div
                className={`metric-value ${Number(reduction) > 50 ? "good" : "warning"}`}
              >
                {reduction}%
              </div>
            </div>
            <div className="metric-item">
              <div className="metric-label">Structural Similarity (SSIM)</div>
              <div
                className={`metric-value ${ssimScore !== null && ssimScore > 0.95 ? "good" : "danger"}`}
              >
                {ssimScore !== null ? ssimPercentage + "%" : "..."}
              </div>
            </div>
          </div>

          <div className="results-grid">
            <div className="card">
              <div className="card-title">
                Original
                <span className="badge">{formatSize(originalSize)}</span>
              </div>
              <div className="image-container">
                <img src={originalUrl} alt="Original" />
              </div>
            </div>

            <div className="card">
              <div className="card-title">
                Compressed (WebP)
                <span className="badge">{formatSize(compressedSize)}</span>
              </div>
              <div className="image-container">
                <img src={compressedUrl} alt="Compressed" />
              </div>
            </div>

            <div className="card">
              <div className="card-title">
                Difference Map
                <span className="badge">Data Loss</span>
              </div>
              <div className="image-container">
                {diffUrl ? (
                  <img src={diffUrl} alt="Difference Highlight" />
                ) : (
                  <div
                    className="loader"
                    style={{
                      borderColor: "#334155",
                      borderTopColor: "#f8fafc",
                    }}
                  ></div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
