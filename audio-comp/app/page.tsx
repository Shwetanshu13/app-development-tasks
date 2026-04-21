import AudioCompressor from "@/components/AudioCompressor";

export const metadata = {
  title: "Aether | High-Fidelity Audio Compression",
  description: "Compress large audio files up to 64MB using WebAssembly and upload using a highly stable chunked streaming strategy.",
};

export default function Home() {
  return (
    <div className="min-h-screen bg-[#030305] text-white flex flex-col font-sans selection:bg-purple-500/30">
      
      {/* Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-900/40 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[50%] rounded-full bg-purple-900/30 blur-[150px]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 w-full px-6 md:px-12 py-6 flex justify-between items-center bg-black/20 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-widest text-white uppercase">Aether</span>
        </div>
        <div className="text-sm font-medium text-gray-400">
          Neural Audio Engine <span className="text-green-400 ml-2 animate-pulse">● Online</span>
        </div>
      </nav>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 md:p-8 shrink-0 py-12">
        <AudioCompressor />
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center text-gray-500 text-sm border-t border-white/5 bg-black/20 backdrop-blur-md">
        © {new Date().getFullYear()} Aether Studio. Client-side WASM Compression. Secure Chunk Networking.
      </footer>
    </div>
  );
}
