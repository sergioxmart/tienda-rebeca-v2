// Helper para responder JSON desde handlers de node:http.
// Status code, Content-Type application/json, body stringified.

export function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}
