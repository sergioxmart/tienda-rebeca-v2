// Barrel: re-exporta todo lo público de core/lib/.
// En modo Core Remoto, el server hace `import { ... } from 'techstore-core'`
// (o desde el path local equivalente). En modo standalone, web/server/lib/*
// sigue re-exportando desde acá archivo por archivo.

export * from './auth.js';
export * from './body.js';
export * from './client-ip.js';
export * from './cookies.js';
export * from './csrf.js';
export * from './db.js';
export * from './email.js';
export * from './env.js';
export * from './file.js';
export * from './json.js';
export * from './logger.js';
export * from './static.js';
export * from './totp.js';
export * from './uploads.js';
