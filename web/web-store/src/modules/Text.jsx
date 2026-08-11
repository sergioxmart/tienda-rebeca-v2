import React from 'react';
import CustomCode from './CustomCode.jsx';

function renderText(value = '') {
  const escaped = String(value).replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
  return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br />');
}

export default function Text({ settings = {} }) {
  if (settings.custom_code_enabled && settings.custom_code) return <CustomCode code={settings.custom_code} className="text-custom-code" />;
  if (!settings.body) return null;
  return <section className="editorial-text" style={{ textAlign: settings.align || 'center' }}><div dangerouslySetInnerHTML={{ __html: renderText(settings.body) }} /></section>;
}
