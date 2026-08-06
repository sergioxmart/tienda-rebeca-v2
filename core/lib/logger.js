// Logger centralizado. Genera lineas con timestamp + tag + nivel + mensaje.
// El `tag` identifica el servicio (techstore, mi-tienda, core, etc.).
// Default-compatible: `log` usa tag='techstore' (o env.LOG_TAG si está seteado).
//
// Uso:
//   import { log, createLogger } from '.../logger.js';
//   log.info('hola');                            // [techstore:info] hola
//   const myLog = createLogger({ tag: 'core' });
//   myLog.warn('algo');                          // [core:warn] algo

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveLevel(v) {
  return LEVELS[String(v || 'info').toLowerCase()] ?? 20;
}

export function createLogger({
  tag = 'techstore',
  level = process.env.LOG_LEVEL || 'info',
} = {}) {
  const min = resolveLevel(level);

  function emit(level, args) {
    if (LEVELS[level] < min) return;
    const ts = new Date().toISOString();
    const line = [ts, `[${tag}:${level}]`, ...args]
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ');
    // Un solo write a stdout/stderr para no romper líneas concurrentes.
    (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
  }

  return {
    debug: (...a) => emit('debug', a),
    info:  (...a) => emit('info', a),
    warn:  (...a) => emit('warn', a),
    error: (...a) => emit('error', a),
  };
}

// Default: el server de TechStore importa `log` y se comporta igual que antes.
export const log = createLogger({ tag: process.env.LOG_TAG || 'techstore' });
