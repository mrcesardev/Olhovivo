'use client';
import { useState } from 'react';
export function Avatar({
  name,
  url,
  large = false,
}: {
  name: string;
  url?: string;
  large?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`avatar ${large ? 'large' : ''}`}>
      {url && !broken ? (
        <img
          src={url}
          alt={`Foto de ${name}`}
          onError={() => setBroken(true)}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span aria-hidden="true">
          {name
            .split(' ')
            .slice(0, 2)
            .map((s) => s[0])
            .join('')}
        </span>
      )}
    </span>
  );
}
