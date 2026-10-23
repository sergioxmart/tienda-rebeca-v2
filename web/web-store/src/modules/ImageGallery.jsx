import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

function normalizeImages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((image) => typeof image === 'string' ? { url: image, alt: '' } : image)
    .filter((image) => typeof image?.url === 'string' && image.url.trim());
}

function galleryColor(value, fallback) {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

export default function ImageGallery({ settings = {} }) {
  const images = normalizeImages(settings.images);
  const title = typeof settings.title === 'string' ? settings.title : '';
  const isCarousel = settings.variant === 'carousel';
  const lightboxBackgroundColor = galleryColor(settings.lightbox_background_color, '#0C0F14');
  const lightboxCloseBackgroundColor = galleryColor(settings.lightbox_close_background_color, '#14161A');
  const lightboxArrowBackgroundColor = galleryColor(settings.lightbox_arrow_background_color, '#14161A');
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  useEffect(() => {
    setActive(0);
    setLightboxIndex(null);
  }, [images.length, settings.variant]);

  useEffect(() => {
    if (lightboxIndex === null) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setLightboxIndex(null);
      if (event.key === 'ArrowLeft') setLightboxIndex((current) => (current - 1 + images.length) % images.length);
      if (event.key === 'ArrowRight') setLightboxIndex((current) => (current + 1) % images.length);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [images.length, lightboxIndex !== null]);

  useEffect(() => {
    const interval = Number(settings.autoplay_ms) || 5000;
    if (!isCarousel || settings.autoplay === false || images.length < 2 || paused || interval <= 0) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % images.length), interval);
    return () => window.clearInterval(timer);
  }, [images.length, isCarousel, paused, settings.autoplay, settings.autoplay_ms]);

  if (!images.length) return null;

  const currentLightboxIndex = lightboxIndex === null ? null : Math.min(lightboxIndex, images.length - 1);

  const lightbox = currentLightboxIndex !== null && createPortal(
    <div
      className="image-lightbox"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) setLightboxIndex(null); }}
      style={{
        '--image-lightbox-overlay-color': lightboxBackgroundColor,
        '--image-lightbox-close-background': lightboxCloseBackgroundColor,
        '--image-lightbox-arrow-background': lightboxArrowBackgroundColor,
      }}
    >
      <div className="image-lightbox__dialog" role="dialog" aria-modal="true" aria-label={title || 'Galería de imágenes'}>
        <button className="image-lightbox__close" type="button" onClick={() => setLightboxIndex(null)} aria-label="Cerrar imagen">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
        {images.length > 1 && <button
          className="image-lightbox__arrow image-lightbox__arrow--previous"
          type="button"
          onClick={() => setLightboxIndex((current) => (current - 1 + images.length) % images.length)}
          aria-label="Imagen anterior"
        ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>}
        <img
          className="image-lightbox__image"
          src={images[currentLightboxIndex].url}
          alt={images[currentLightboxIndex].alt || title || `Imagen ${currentLightboxIndex + 1}`}
        />
        {images.length > 1 && <button
          className="image-lightbox__arrow image-lightbox__arrow--next"
          type="button"
          onClick={() => setLightboxIndex((current) => (current + 1) % images.length)}
          aria-label="Siguiente imagen"
        ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></button>}
        <div className="image-lightbox__count" aria-live="polite">{currentLightboxIndex + 1} / {images.length}</div>
      </div>
    </div>,
    document.body,
  );

  if (!isCarousel) {
    const countClass = images.length <= 3 ? ` image-gallery__collage--${images.length}` : '';
    return <>
      <section className="store-section image-gallery image-gallery--collage">
        {title && <h2 className="image-gallery__title">{title}</h2>}
        <div className={`image-gallery__collage${countClass}`}>
          {images.map((image, index) => (
            <button
              className="image-gallery__tile"
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => setLightboxIndex(index)}
              aria-label={`Ampliar imagen ${index + 1}${image.alt ? `: ${image.alt}` : ''}`}
            >
              <img src={image.url} alt={image.alt || ''} loading="lazy" />
            </button>
          ))}
        </div>
      </section>
      {lightbox}
    </>;
  }

  const currentIndex = active % images.length;
  const currentImage = images[currentIndex];
  const desktopHeight = Math.min(760, Math.max(240, Number(settings.image_height_desktop) || 560));
  const mobileHeight = Math.min(600, Math.max(200, Number(settings.image_height_mobile) || 380));
  const go = (offset) => setActive((current) => (current + offset + images.length) % images.length);

  return (
    <>
    <section
      className="store-section image-gallery image-gallery--carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
      style={{ '--image-gallery-height-desktop': `${desktopHeight}px`, '--image-gallery-height-mobile': `${mobileHeight}px` }}
    >
      {title && <h2 className="image-gallery__title">{title}</h2>}
      <button
        className="image-gallery__slide"
        type="button"
        aria-label={`Ampliar imagen ${currentIndex + 1}${currentImage.alt ? `: ${currentImage.alt}` : ''}`}
        onClick={() => setLightboxIndex(currentIndex)}
        aria-live="polite"
        aria-roledescription="carrusel"
      >
        <img key={currentImage.url} src={currentImage.url} alt={currentImage.alt || ''} />
      </button>
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
    {lightbox}
    </>
  );
}
