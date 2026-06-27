"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface ScannerProps {
  onScan: (decodedText: string) => void;
  active?: boolean;
  onClose?: () => void;
}

const buildScannerId = () => `barcode-reader-${Math.random().toString(36).slice(2)}`;

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
];

const SCAN_CONFIG = {
  fps: 24,
  qrbox: { width: 300, height: 150 },
  aspectRatio: 1.777,
  disableFlip: true,
};

/**
 * Camera fallback chain — tries rear camera first, then front, then any device.
 * This ensures the scanner works on phones (rear cam), tablets, laptops (webcam),
 * and desktops with external cameras.
 */
const CAMERA_FALLBACKS: Array<{ facingMode: string | { exact: string } } | boolean> = [
  { facingMode: { exact: 'environment' } },  // strict rear camera
  { facingMode: 'environment' },              // prefer rear, accept any
  { facingMode: 'user' },                     // front / webcam
  true,                                       // any available camera
];

  export default function Scanner({ onScan, active = true, onClose }: ScannerProps) {
  const readerId = useMemo(buildScannerId, []);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const onScanRef = useRef(onScan);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [zoomCapabilities, setZoomCapabilities] = useState<{ min: number; max: number; step: number } | null>(null);
  const [zoomValue, setZoomValue] = useState(1);

  // Keep onScan ref stable so the scanner doesn't restart on every parent render
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const scanner = new Html5Qrcode(readerId, {
      formatsToSupport: SUPPORTED_FORMATS,
      verbose: false,
    });

    scannerRef.current = scanner;
    setCameraError(null);

    const handleSuccess = (decodedText: string) => {
      const now = Date.now();
      const lastScan = lastScanRef.current;

      if (decodedText === lastScan.text && now - lastScan.at < 1200) return;

      lastScanRef.current = { text: decodedText, at: now };
      onScanRef.current(decodedText.trim());
    };

    const handleFailure = () => {
      // Barcode decoders miss frames often; this is normal while the camera is active.
    };

    const startScanner = async () => {
      for (const constraint of CAMERA_FALLBACKS) {
        if (cancelled) return;

        try {
          await scanner.start(constraint as never, SCAN_CONFIG, handleSuccess, handleFailure);
          
          // Check zoom capabilities after a short delay for stream stabilization
          setTimeout(() => {
            if (cancelled) return;
            try {
              // Try checking via library capabilities
              const capabilities = scanner.getRunningTrackCapabilities();
              if (capabilities && 'zoom' in capabilities) {
                const zoomCap = (capabilities as any).zoom;
                setZoomCapabilities({
                  min: zoomCap.min || 1,
                  max: zoomCap.max || 5,
                  step: zoomCap.step || 0.1
                });
                setZoomValue(zoomCap.min || 1);
                return;
              }

              // Fallback: Check track directly via video source
              const video = document.querySelector(`#${readerId} video`) as HTMLVideoElement;
              const stream = video?.srcObject as MediaStream;
              const track = stream?.getVideoTracks?.()?.[0];
              if (track) {
                const trackCaps = track.getCapabilities() as any;
                if (trackCaps && trackCaps.zoom) {
                  setZoomCapabilities({
                    min: trackCaps.zoom.min || 1,
                    max: trackCaps.zoom.max || 5,
                    step: trackCaps.zoom.step || 0.1
                  });
                  setZoomValue(trackCaps.zoom.min || 1);
                }
              }
            } catch (capErr) {
              console.warn('Error reading zoom capabilities:', capErr);
            }
          }, 1000);

          return; // success — stop trying
        } catch {
          // This constraint failed; try the next one
        }
      }

      // All fallbacks exhausted
      if (!cancelled) {
        setCameraError(
          'No camera detected. Please allow camera access in your browser settings, ' +
          'or use the manual barcode field below.'
        );
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      const currentScanner = scannerRef.current;
      scannerRef.current = null;

      if (currentScanner?.isScanning) {
        void currentScanner.stop()
          .then(() => currentScanner.clear())
          .catch((error) => {
            console.error('Failed to stop barcode scanner:', error);
          });
      } else {
        currentScanner?.clear();
      }
    };
  }, [active, readerId]);

  // Apply zoom whenever the value changes
  useEffect(() => {
    if (!active || !scannerRef.current) return;

    const applyZoom = async () => {
      const scanner = scannerRef.current;
      if (!scanner || !scanner.isScanning) return;

      try {
        await scanner.applyVideoConstraints({
          advanced: [{ zoom: zoomValue }]
        } as any);
      } catch (err) {
        // Fallback: apply directly to video track
        try {
          const video = document.querySelector(`#${readerId} video`) as HTMLVideoElement;
          const stream = video?.srcObject as MediaStream;
          const track = stream?.getVideoTracks?.()?.[0];
          if (track) {
            await track.applyConstraints({
              advanced: [{ zoom: zoomValue }]
            } as any);
          }
        } catch (trackErr) {
          console.warn('Failed to apply zoom constraints directly to track:', trackErr);
        }
      }
    };

    void applyZoom();
  }, [zoomValue, active, readerId]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualBarcode.trim();
    if (code) {
      onScanRef.current(code);
      setManualBarcode('');
    }
  };

  if (!active) return null;

  return (
    <div className="w-full max-w-md mx-auto relative overflow-hidden rounded-xl border border-primary/30 bg-black flex flex-col">
      <div id={readerId} className="min-h-[260px] w-full [&_video]:!object-cover [&_video]:!w-full [&_video]:!min-h-[260px]" />

      <div className="pointer-events-none absolute inset-x-8 top-[130px] h-28 -translate-y-1/2 rounded-lg border-2 border-secondary shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />

      {/* Zoom Slider Overlay */}
      {zoomCapabilities && (
        <div className="absolute bottom-[80px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-surface/90 px-3 py-1.5 rounded-full shadow-md w-[80%] max-w-[280px]">
          <span className="material-symbols-outlined text-[18px] text-on-surface">zoom_out</span>
          <input
            type="range"
            min={zoomCapabilities.min}
            max={zoomCapabilities.max}
            step={zoomCapabilities.step}
            value={zoomValue}
            onChange={(e) => setZoomValue(Number(e.target.value))}
            className="flex-1 h-1 bg-outline rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <span className="material-symbols-outlined text-[18px] text-on-surface">zoom_in</span>
          <span className="font-mono-data text-xs text-on-surface min-w-[28px] text-right">{zoomValue.toFixed(1)}x</span>
        </div>
      )}

      <div className="absolute left-2 top-2 z-20 flex items-center gap-1 rounded bg-surface/90 px-2 py-1 text-xs font-label-md text-on-surface shadow-sm">
        <span className="h-2 w-2 rounded-full bg-secondary animate-pulse" />
        Camera scanning
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-20 h-9 w-9 rounded-full bg-surface/90 text-on-surface flex items-center justify-center"
          aria-label="Close barcode scanner"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      )}

      {cameraError && (
        <div className="bg-error-container p-3 text-sm text-error">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[18px]">videocam_off</span>
            <span className="font-label-md">Camera unavailable</span>
          </div>
          <p className="text-xs">{cameraError}</p>
        </div>
      )}

      {/* Manual barcode entry — always visible as a fallback */}
      <form onSubmit={handleManualSubmit} className="flex gap-2 p-3 bg-surface-container-low border-t border-surface-variant">
        <input
          type="text"
          data-barcode-input="true"
          inputMode="numeric"
          value={manualBarcode}
          onChange={(e) => setManualBarcode(e.target.value)}
          placeholder="Type barcode manually..."
          className="flex-1 h-10 px-3 rounded-lg border border-outline-variant bg-surface text-on-surface font-mono-data text-sm"
        />
        <button
          type="submit"
          disabled={!manualBarcode.trim()}
          className="h-10 px-4 rounded-lg bg-primary text-on-primary font-label-md text-sm disabled:opacity-50"
        >
          Lookup
        </button>
      </form>
    </div>
  );
}
