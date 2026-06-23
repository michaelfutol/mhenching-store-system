"use client";

import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface ScannerProps {
  onScan: (decodedText: string) => void;
}

export default function Scanner({ onScan }: ScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    scannerRef.current = new Html5QrcodeScanner(
      "reader",
      {
          fps: 30, // High FPS for rapid scanning of cheat-sheets
          qrbox: { width: 250, height: 150 }, // Wider aspect ratio for barcodes
          aspectRatio: 1.0,
          videoConstraints: {
              facingMode: "environment",
              focusMode: "continuous" // Force continuous focus
          } as any
      },
      /* verbose= */ false
    );

    let lastScanTime = 0;
    scannerRef.current.render(
      (decodedText) => {
          // Debounce rapid identical scans to prevent UI flickering
          const now = Date.now();
          if (now - lastScanTime > 1000) {
              onScan(decodedText);
              lastScanTime = now;
          }
      },
      (error) => {
        // Ignored, typical for when no code is in view
      }
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(error => {
          console.error("Failed to clear html5QrcodeScanner. ", error);
        });
      }
    };
  }, [onScan]);

  return (
    <div className="w-full max-w-md mx-auto relative group overflow-hidden">
        <div className="absolute inset-0 border-2 border-primary/30 z-10 pointer-events-none group-hover:border-primary transition-colors duration-300"></div>
        <div id="reader" className="w-full [&>div]:!border-none [&_video]:!object-cover"></div>
        <div className="absolute top-2 left-2 bg-surface/80 backdrop-blur px-2 py-1 rounded text-xs font-label-md text-on-surface z-20 shadow-sm flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse"></span> Scanning Active
        </div>
    </div>
  );
}
