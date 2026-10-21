import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, RefreshCw, X, Check, Image as ImageIcon, User, AlertCircle } from 'lucide-react';

interface PhotoCaptureInputProps {
  photoUrl: string;
  onChange: (photoUrl: string) => void;
  label?: string;
  required?: boolean;
}

export const PhotoCaptureInput: React.FC<PhotoCaptureInputProps> = ({
  photoUrl,
  onChange,
  label = 'Customer Portrait Photo',
  required = true,
}) => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera tracks cleanly
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
    setCameraError(null);
  };

  // Start live webcam / mobile camera
  const startCamera = async (facing: 'user' | 'environment' = facingMode) => {
    stopCamera();
    setCameraError(null);
    setIsCameraActive(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera is not supported on this browser or device.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facing,
          width: { ideal: 640 },
          height: { ideal: 640 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Camera permission was denied. Please allow camera access in browser settings or attach an image file.'
          : 'Could not access camera. You can attach a photo file directly.'
      );
      stopCamera();
    }
  };

  // Switch between front and rear cameras
  const toggleFacingMode = () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    startCamera(nextFacing);
  };

  // Snap photo from video feed onto centered 400x400 canvas
  const handleSnapPhoto = () => {
    if (!videoRef.current) return;
    setIsProcessing(true);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      const targetSize = 400;
      canvas.width = targetSize;
      canvas.height = targetSize;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Calculate center square crop
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        const minDim = Math.min(vw, vh);
        const sx = (vw - minDim) / 2;
        const sy = (vh - minDim) / 2;

        ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        onChange(dataUrl);
      }
    } catch (err) {
      console.error('Failed to capture frame:', err);
    } finally {
      setIsProcessing(false);
      stopCamera();
    }
  };

  // Handle local file selection (from phone gallery or computer)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (JPEG, PNG, WebP).');
      return;
    }

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const targetSize = 400;
        canvas.width = targetSize;
        canvas.height = targetSize;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;

          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, targetSize, targetSize);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          onChange(dataUrl);
        }
        setIsProcessing(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);

    // Reset input value so same file can be re-selected if needed
    e.target.value = '';
  };

  // Stop camera if component unmounts
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const samplePresets = [
    { label: 'Male Student', url: '/src/assets/images/avatar_student_male_1790979380050.jpg' },
    { label: 'Female Student', url: '/src/assets/images/avatar_student_female_1790979387287.jpg' },
    { label: 'Patron / Staff', url: '/src/assets/images/avatar_patron_male_1790979396731.jpg' },
  ];

  return (
    <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
      <div className="flex items-center justify-between">
        <label className="font-semibold text-slate-200 text-xs flex items-center gap-1.5">
          <User className="w-4 h-4 text-emerald-400" />
          <span>{label}</span>
          {required && <span className="text-rose-400">*</span>}
        </label>
        <span className="text-[10px] text-slate-400 font-mono">
          Used on PVC cards &amp; stand spot-checks
        </span>
      </div>

      {cameraError && (
        <div className="p-3 rounded-xl bg-amber-950/60 border border-amber-800/80 text-amber-200 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{cameraError}</span>
        </div>
      )}

      {/* LIVE CAMERA VIEWFINDER */}
      {isCameraActive ? (
        <div className="space-y-3 p-3 rounded-2xl bg-black border border-emerald-600/60 shadow-lg text-center">
          <div className="relative w-64 h-64 mx-auto rounded-2xl overflow-hidden border-2 border-emerald-500 bg-slate-900 shadow-inner">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {/* Portrait Oval Target Guide */}
            <div className="absolute inset-4 rounded-full border-2 border-dashed border-emerald-400/70 pointer-events-none flex items-center justify-center">
              <span className="text-[10px] text-emerald-300 font-mono bg-black/60 px-2 py-0.5 rounded-full">
                Center Face
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleSnapPhoto}
              disabled={isProcessing}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-md cursor-pointer transition-colors"
            >
              <Camera className="w-4 h-4" />
              <span>Capture Photo</span>
            </button>

            <button
              type="button"
              onClick={toggleFacingMode}
              title="Switch Front/Rear Camera"
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={stopCamera}
              className="px-3.5 py-2.5 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 text-xs font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* CURRENT PHOTO PREVIEW & CAPTURE CONTROLS */
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative group shrink-0">
            <img
              src={photoUrl || '/src/assets/images/avatar_student_male_1790979380050.jpg'}
              alt="Customer avatar"
              className="w-20 h-20 rounded-2xl object-cover border-2 border-emerald-500/80 shadow-md bg-slate-900"
            />
            {photoUrl?.startsWith('data:') && (
              <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-bold shadow-xs">
                Live
              </span>
            )}
          </div>

          <div className="space-y-2 flex-1 w-full text-center sm:text-left">
            <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
              {/* Take Photo with Camera */}
              <button
                type="button"
                onClick={() => startCamera('user')}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer transition-all"
              >
                <Camera className="w-4 h-4" />
                <span>Take Photo with Camera</span>
              </button>

              {/* Attach Photo File */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-semibold text-xs border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Upload className="w-4 h-4 text-emerald-400" />
                <span>Attach Photo File</span>
              </button>

              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Quick Sample Presets */}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1 justify-center sm:justify-start">
              <span className="text-[10px] uppercase font-mono text-slate-500">Presets:</span>
              {samplePresets.map((preset) => (
                <button
                  key={preset.url}
                  type="button"
                  onClick={() => onChange(preset.url)}
                  className={`px-2 py-0.5 rounded-lg border text-[10px] font-medium transition-colors cursor-pointer ${
                    photoUrl === preset.url
                      ? 'bg-emerald-950 border-emerald-500 text-emerald-300 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
