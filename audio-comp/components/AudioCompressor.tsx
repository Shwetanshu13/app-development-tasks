"use client";

import { useState, useRef, useEffect } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { UploadCloud, FileAudio, CheckCircle, Upload, Play, Pause, Activity } from "lucide-react";

interface AudioStats {
  peak: number;
  duration: number;
  bitrateKbps: number;
}

export default function AudioCompressor() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "compressing" | "uploading" | "done" | "error">("idle");
  const [compressProgress, setCompressProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number }>({ current: 0, total: 1 });
  const [originalStats, setOriginalStats] = useState<AudioStats | null>(null);
  const [compressedStats, setCompressedStats] = useState<AudioStats | null>(null);
  const [compressedBlobURL, setCompressedBlobURL] = useState<string | null>(null);
  
  const ffmpegRef = useRef<FFmpeg | null>(null);
  
  // Audio playback state
  const originalAudioRef = useRef<HTMLAudioElement | null>(null);
  const compressedAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingOriginal, setPlayingOriginal] = useState(false);
  const [playingCompressed, setPlayingCompressed] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const ffmpeg = new FFmpeg();
      ffmpegRef.current = ffmpeg;
      
      ffmpeg.on("progress", ({ progress }) => {
        setCompressProgress(Math.round(progress * 100));
      });

      // Try multithread first, fallback to single thread
      const isSharedArrayBufferSupported = typeof SharedArrayBuffer !== 'undefined';
      
      if (isSharedArrayBufferSupported) {
        const baseURL = "https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm";
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
          workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, "text/javascript"),
        });
      } else {
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
        });
      }

      setIsLoaded(true);
    } catch (err: any) {
      console.error("Error loading FFmpeg:", err);
      setLoadError("Failed to load FFmpeg. Check your network or browser support.");
    }
  };

  const getAudioStats = async (blob: Blob): Promise<AudioStats> => {
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Copy array buffer because decodeAudioData might detach it
    const copy = arrayBuffer.slice(0);
    const audioBuffer = await ctx.decodeAudioData(copy);
    
    let peak = 0;
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
      const data = audioBuffer.getChannelData(c);
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peak) peak = abs;
      }
    }
    
    const duration = audioBuffer.duration;
    const bitrateKbps = (blob.size * 8) / duration / 1000;
    
    return { peak, duration, bitrateKbps };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setOriginalStats(null);
      setCompressedStats(null);
      setCompressedBlobURL(null);
      setStatus("idle");
      setCompressProgress(0);
    }
  };

  const processFile = async () => {
    if (!file || !ffmpegRef.current || !isLoaded) return;

    try {
      setStatus("compressing");
      setCompressProgress(0);
      
      // Get Original Stats
      const oStats = await getAudioStats(file);
      setOriginalStats(oStats);

      const ffmpeg = ffmpegRef.current;
      const inputName = `input_${file.name}`;
      const outputName = `output_${file.name.split('.')[0]}.mp3`;

      await ffmpeg.writeFile(inputName, await fetchFile(file));

      // Execute compression
      await ffmpeg.exec([
        "-i", inputName,
        "-b:a", "320k",
        "-map_metadata", "0",
        outputName
      ]);

      const data = await ffmpeg.readFile(outputName);
      const compressedBlob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'audio/mp3' });
      
      const compressedURL = URL.createObjectURL(compressedBlob);
      setCompressedBlobURL(compressedURL);

      // Get Compressed Stats
      const cStats = await getAudioStats(compressedBlob);
      setCompressedStats(cStats);

      setStatus("uploading");
      await uploadInChunks(compressedBlob, outputName);

    } catch (err: any) {
      console.error(err);
      setStatus("error");
    }
  };

  const uploadInChunks = async (blob: Blob, fileName: string) => {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
    const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);
    setUploadProgress({ current: 0, total: totalChunks });

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, blob.size);
      const chunk = blob.slice(start, end);

      let success = false;
      let retries = 3;

      while (!success && retries > 0) {
        try {
          const formData = new FormData();
          formData.append("chunkIndex", i.toString());
          formData.append("totalChunks", totalChunks.toString());
          formData.append("fileName", fileName);
          formData.append("chunk", chunk);

          const res = await fetch("/api/upload-chunk", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) throw new Error("Upload failed");
          
          success = true;
          setUploadProgress({ current: i + 1, total: totalChunks });
        } catch (err) {
          console.error(`Chunk ${i} upload failed. Retries left: ${retries - 1}`);
          retries--;
          if (retries === 0) throw new Error("Max retries reached for chunk.");
          await new Promise(r => setTimeout(r, 1000)); // wait before retry
        }
      }
    }

    setStatus("done");
  };

  const toggleOriginalPlayback = () => {
    if (!originalAudioRef.current) return;
    if (playingOriginal) {
      originalAudioRef.current.pause();
    } else {
      if (playingCompressed) toggleCompressedPlayback(); // Pause other
      originalAudioRef.current.play();
    }
    setPlayingOriginal(!playingOriginal);
  };

  const toggleCompressedPlayback = () => {
    if (!compressedAudioRef.current) return;
    if (playingCompressed) {
      compressedAudioRef.current.pause();
    } else {
      if (playingOriginal) toggleOriginalPlayback(); // Pause other
      compressedAudioRef.current.play();
    }
    setPlayingCompressed(!playingCompressed);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6 md:p-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 pointer-events-none" />
      
      <div className="relative z-10 flex flex-col gap-8">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-white/5 rounded-2xl mb-4 border border-white/10">
            <Activity className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
            Supercharge Audio Compression
          </h1>
          <p className="text-gray-400">
            WASM-powered lossless-like compression to 320k. Secure chunked local upload.
          </p>
          {!isLoaded && !loadError && (
            <p className="text-yellow-400 text-sm mt-2 animate-pulse">Loading WebAssembly Core...</p>
          )}
          {loadError && (
            <p className="text-red-400 text-sm mt-2">{loadError}</p>
          )}
        </div>

        {/* Upload Section */}
        <div className="w-full">
          <label className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-3xl cursor-pointer transition-all duration-300 ${
            file ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-white/20 bg-white/5 hover:bg-white/10 hover:border-white/30'
          }`}>
            <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
              <UploadCloud className={`w-12 h-12 mb-4 ${file ? 'text-indigo-400' : 'text-gray-400'}`} />
              <p className="mb-2 text-lg font-medium text-gray-200">
                {file ? file.name : "Click to upload your audio file"}
              </p>
              <p className="text-sm text-gray-500">
                {file ? `Size: ${(file.size / (1024 * 1024)).toFixed(2)} MB` : "WAV, FLAC, MP3 (Up to 64MB)"}
              </p>
            </div>
            <input type="file" className="hidden" accept="audio/*" onChange={handleFileChange} />
          </label>
        </div>

        {/* Action Button */}
        {file && status === "idle" && (
          <button
            onClick={processFile}
            disabled={!isLoaded}
            className="w-full py-4 rounded-2xl font-bold text-lg text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 focus:ring-4 focus:ring-purple-500/30 transition-all transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)]"
          >
            Compress & Upload
          </button>
        )}

        {/* Progress Section */}
        {(status === "compressing" || status === "uploading" || status === "done") && (
          <div className="space-y-6 bg-white/5 border border-white/10 rounded-3xl p-6">
            
            {/* Compression Progress */}
            <div>
              <div className="flex justify-between text-sm font-medium mb-2 text-gray-300">
                <span>FFmpeg Compression</span>
                <span>{compressProgress}%</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-3 backdrop-blur-sm overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-cyan-400 to-blue-500 h-3 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(56,189,248,0.5)]"
                  style={{ width: `${compressProgress}%` }}
                />
              </div>
            </div>

            {/* Upload Progress */}
            <div>
              <div className="flex justify-between text-sm font-medium mb-2 text-gray-300">
                <span>Chunked Local Upload</span>
                <span>Packet {uploadProgress.current} / {uploadProgress.total}</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-3 backdrop-blur-sm overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-purple-400 to-pink-500 h-3 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(232,121,249,0.5)]"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
            </div>

            {status === "done" && (
              <div className="flex items-center justify-center gap-2 text-green-400 font-medium py-2">
                <CheckCircle className="w-5 h-5" />
                <span>Process completed successfully!</span>
              </div>
            )}
          </div>
        )}

        {/* Comparison Section */}
        {originalStats && compressedStats && (
          <div className="grid md:grid-cols-2 gap-6 pb-2">
            
            {/* Original */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
              <div className="flex items-center gap-3 text-gray-200">
                <FileAudio className="w-6 h-6 text-indigo-400" />
                <h3 className="text-xl font-bold">Original File</h3>
              </div>
              <div className="space-y-3 text-sm text-gray-400">
                <div className="flex justify-between">
                  <span>Bitrate:</span>
                  <span className="text-gray-200 font-mono">{Math.round(originalStats.bitrateKbps)} kbps</span>
                </div>
                <div className="flex justify-between">
                  <span>Peak Amplitude:</span>
                  <span className="text-gray-200 font-mono">{originalStats.peak.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Duration:</span>
                  <span className="text-gray-200 font-mono">{originalStats.duration.toFixed(2)}s</span>
                </div>
              </div>
              
              <audio 
                ref={originalAudioRef} 
                src={URL.createObjectURL(file!)} 
                onEnded={() => setPlayingOriginal(false)} 
                className="hidden" 
              />
              <button 
                onClick={toggleOriginalPlayback}
                className="w-full flex items-center justify-center gap-2 py-3 mt-4 rounded-xl font-semibold bg-white/10 hover:bg-white/20 transition-colors text-white"
              >
                {playingOriginal ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                {playingOriginal ? "Pause Original" : "Play Original"}
              </button>
            </div>

            {/* Compressed */}
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                <Activity className="w-32 h-32" />
              </div>
              <div className="relative z-10 space-y-4">
                <div className="flex items-center gap-3 text-gray-200">
                  <FileAudio className="w-6 h-6 text-purple-400" />
                  <h3 className="text-xl font-bold">Compressed File</h3>
                </div>
                <div className="space-y-3 text-sm text-gray-400">
                  <div className="flex justify-between">
                    <span>Bitrate:</span>
                    <span className="text-gray-200 font-mono">{Math.round(compressedStats.bitrateKbps)} kbps</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Peak Amplitude:</span>
                    <span className="text-gray-200 font-mono">{compressedStats.peak.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Duration:</span>
                    <span className="text-gray-200 font-mono">{compressedStats.duration.toFixed(2)}s</span>
                  </div>
                </div>

                {compressedBlobURL && (
                  <>
                    <audio 
                      ref={compressedAudioRef} 
                      src={compressedBlobURL} 
                      onEnded={() => setPlayingCompressed(false)} 
                      className="hidden" 
                    />
                    <button 
                      onClick={toggleCompressedPlayback}
                      className="w-full flex items-center justify-center gap-2 py-3 mt-4 rounded-xl font-semibold bg-white/10 hover:bg-white/20 transition-colors text-white border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.15)] hover:shadow-[0_0_20px_rgba(168,85,247,0.3)]"
                    >
                      {playingCompressed ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                      {playingCompressed ? "Pause Compressed" : "Play Compressed"}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Analysis Box */}
            <div className="md:col-span-2 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1 text-center md:text-left">
                <h4 className="text-lg font-bold text-indigo-300">Data Loss Analysis</h4>
                <p className="text-sm text-gray-400">Comparison of key metrics to evaluate fidelity.</p>
              </div>
              <div className="flex gap-6 text-sm">
                <div className="text-center">
                  <span className="block text-gray-400 mb-1">Bitrate Variance</span>
                  <span className="font-mono font-bold text-gray-200">
                    {Math.abs(Math.round(originalStats.bitrateKbps - compressedStats.bitrateKbps))} kbps
                  </span>
                </div>
                <div className="w-px bg-white/10 h-10 self-center"></div>
                <div className="text-center">
                  <span className="block text-gray-400 mb-1">Peak Diff</span>
                  <span className="font-mono font-bold text-gray-200">
                    {Math.abs(originalStats.peak - compressedStats.peak).toFixed(5)}
                  </span>
                </div>
                <div className="w-px bg-white/10 h-10 self-center hidden sm:block"></div>
                <div className="text-center hidden sm:block">
                  <span className="block text-gray-400 mb-1">Dur. Valid</span>
                  <span className="font-mono font-bold text-green-400">
                    {Math.abs(originalStats.duration - compressedStats.duration) < 0.1 ? "Passed" : "Failed"}
                  </span>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
