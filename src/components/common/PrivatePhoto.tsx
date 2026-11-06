import React, { useEffect, useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import { restoStore } from '../../store/restoStore';

type PrivatePhotoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null;
  fallbackSrc?: string;
};

/**
 * Loads authenticated customer portraits as short-lived in-memory blob URLs.
 * The bearer token is sent only to the same-origin, tightly matched photo route.
 */
export const PrivatePhoto: React.FC<PrivatePhotoProps> = ({
  src,
  fallbackSrc = '/src/assets/images/avatar_student_male_1790979380050.jpg',
  alt = 'Customer portrait',
  ...imageProps
}) => {
  const [resolvedSrc, setResolvedSrc] = useState(fallbackSrc);

  useEffect(() => {
    if (!src) {
      setResolvedSrc(fallbackSrc);
      return;
    }

    const isPrivatePhotoRoute = /^\/api\/customers\/[A-Za-z0-9_-]{1,128}\/photo$/.test(src);
    if (!isPrivatePhotoRoute) {
      setResolvedSrc(src);
      return;
    }

    const token = restoStore.getAuthToken();
    if (!token) {
      setResolvedSrc(fallbackSrc);
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | null = null;
    setResolvedSrc(fallbackSrc);

    fetch(src, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Private photo request was not authorized.');
        const contentType = response.headers.get('content-type') || '';
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType.split(';')[0].trim().toLowerCase())) {
          throw new Error('Unexpected private photo content type.');
        }
        return response.blob();
      })
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setResolvedSrc(objectUrl);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') setResolvedSrc(fallbackSrc);
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, fallbackSrc]);

  return <img {...imageProps} src={resolvedSrc} alt={alt} />;
};
