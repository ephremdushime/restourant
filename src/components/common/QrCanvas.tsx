import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QrCanvasProps {
  value: string;
  size?: number;
  className?: string;
  darkColor?: string;
  lightColor?: string;
}

export const QrCanvas: React.FC<QrCanvasProps> = ({
  value,
  size = 200,
  className = '',
  darkColor = '#020617',
  lightColor = '#ffffff',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    QRCode.toCanvas(canvasRef.current, value, {
      width: size,
      margin: 1,
      color: {
        dark: darkColor,
        light: lightColor,
      },
      errorCorrectionLevel: 'M',
    }).catch((err) => {
      console.error('Failed to render QR Code', err);
    });
  }, [value, size, darkColor, lightColor]);

  return (
    <canvas
      ref={canvasRef}
      className={`rounded shadow-xs ${className}`}
      style={{ width: size, height: size }}
    />
  );
};
