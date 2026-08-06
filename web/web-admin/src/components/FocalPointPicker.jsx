// FocalPointPicker: permite elegir el "punto focal" de una imagen haciendo
// click sobre ella. Guarda {x, y} en [0, 1] donde (0,0) es top-left y (1,1)
// es bottom-right. El frontend usa object-position: X% Y% para mostrar la
// parte correcta en cualquier aspect ratio.

import { useRef, useState } from 'react';

export default function FocalPointPicker({ src, focal, onChange }) {
  const imgRef = useRef(null);
  const [drag, setDrag] = useState(null);

  function getFocalFromEvent(e) {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  }

  function handleMouseDown(e) {
    const f = getFocalFromEvent(e);
    if (f) {
      setDrag(f);
      onChange(f);
    }
  }

  function handleMouseMove(e) {
    if (drag) {
      const f = getFocalFromEvent(e);
      if (f) {
        setDrag(f);
        onChange(f);
      }
    }
  }

  function handleMouseUp() {
    setDrag(null);
  }

  const display = drag || focal || { x: 0.5, y: 0.5 };
  const positionStyle = {
    left: `${display.x * 100}%`,
    top: `${display.y * 100}%`,
  };

  return (
    <div className="focal-picker">
      <div
        className="focal-picker__img-wrap"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          className="focal-picker__img"
        />
        <div className="focal-picker__marker" style={positionStyle} />
      </div>
      <div className="focal-picker__hint">
        Hacé click sobre la imagen para elegir qué parte se ve cuando se corte en mobile.
        <br />
        Focal actual: {Math.round(display.x * 100)}% horizontal, {Math.round(display.y * 100)}% vertical
      </div>
    </div>
  );
}
