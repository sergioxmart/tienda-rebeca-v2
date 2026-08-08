// Renderizador común para bloques HTML/CSS personalizados del Builder.
// No se permite JavaScript inyectado desde el editor.

import React from 'react';

function sanitizeMarkup(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\b(href|src)\s*=\s*("|')\s*javascript:[\s\S]*?\2/gi, '$1="#"');
}

export default function CustomCode({ code, className = '' }) {
  const markup = sanitizeMarkup(code);
  if (!markup.trim()) return null;
  return <div className={`store-custom-code ${className}`.trim()} dangerouslySetInnerHTML={{ __html: markup }} />;
}

