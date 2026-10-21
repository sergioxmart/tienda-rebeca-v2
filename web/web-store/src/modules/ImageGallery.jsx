import React, { useEffect, useState } from 'react';

function normalizeImages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((image) => typeof image === 'string' ? { url: image, alt: '' } : image)
    .filter((image) => typeof image?.url === 'string' && image.url.trim());
}

export default function ImageGallery({ settings = {} }) {
  const images = normalizeImages(settings.images);
  const title = typeof settings.title === 'string' ? settings.title : '';
  const isCarousel = settings.variant === 'carousel';
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => setActive(0), [images.length, settings.variant]);

  useEffect(() => {
    const interval = Number(settings.autoplay_ms) || 5000;
    if (!isCarousel || settings.autoplay === false || images.length < 2 || paused || interval <= 0) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % images.length), interval);
    return () => window.clearInterval(timer);
  }, [images.length, isCarousel, paused, settings.autoplay, settings.autoplay_ms]);

  if (!images.length) return null;

  if (!isCarousel) {
    const countClass = images.length <= 3 ? ` image-gallery__collage--${images.length}` : '';
    return (
      <section className="store-section image-gallery image-gallery--collage">
        {title && <h2 className="image-gallery__title">{title}</h2>}
        <div className={`image-gallery__collage${countClass}`}>
          {images.map((image, index) => (
            <figure className="image-gallery__tile" key={`${image.url}-${index}`}>
              <img src={image.url} alt={image.alt || ''} loading="lazy" />
            </figure>
          ))}
        </div>
      </section>
    );
  }

  const currentIndex = active % images.length;
  const currentImage = images[currentIndex];
  const desktopHeight = Math.min(760, Math.max(240, Number(settings.image_height_desktop) || 560));
  const mobileHeight = Math.min(600, Math.max(200, Number(settings.image_height_mobile) || 380));
  const go = (offset) => setActive((current) => (current + offset + images.length) % images.length);

  return (
    <section
      className="store-section image-gallery image-gallery--carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
      style={{ '--image-gallery-height-desktop': `${desktopHeight}px`, '--image-gallery-height-mobile': `${mobileHeight}px` }}
    >
      {title && <h2 className="image-gallery__title">{title}</h2>}
      <div className="image-gallery__slide" aria-live="polite" aria-roledescription="carrusel">
        <img key={currentImage.url} src={currentImage.url} alt={currentImage.alt || ''} />
      </div>
      {images.length > 1 && <div className="image-gallery__controls">
        <button type="button" onClick={() => go(-1)} aria-label="Imagen anterior">‹</button>
        <div className="image-gallery__dots" role="group" aria-label="Seleccionar imagen">
          {images.map((image, index) => <button
            key={`${image.url}-${index}`}
            type="button"
            className={index === currentIndex ? 'is-active' : ''}
            onClick={() => setActive(index)}
            aria-label={`Ver imagen ${index + 1}`}
            aria-pressed={index === currentIndex}
          />)}
        </div>
        <button type="button" onClick={() => go(1)} aria-label="Siguiente imagen">›</button>
      </div>}
    </section>
  );
}
