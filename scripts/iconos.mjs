// Genera los íconos PNG de la app, sin dependencias. Se ejecuta con: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const AZUL = [11, 92, 173];
const BLANCO = [255, 255, 255];

function crc32(datos) {
  let crc = ~0;
  for (const byte of datos) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

function bloque(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const contenido = Buffer.concat([Buffer.from(tipo), datos]);
  const control = Buffer.alloc(4);
  control.writeUInt32BE(crc32(contenido));
  return Buffer.concat([largo, contenido, control]);
}

/** Una casa blanca sobre fondo azul. `margen` es el espacio libre, para los íconos enmascarables. */
function dibujar(tamano, margen) {
  const filas = [];
  const casa = (1 - 2 * margen) * tamano;
  const inicio = margen * tamano;
  for (let y = 0; y < tamano; y++) {
    const fila = [0];
    for (let x = 0; x < tamano; x++) {
      const u = (x + 0.5 - inicio) / casa;
      const v = (y + 0.5 - inicio) / casa;
      const techo = v >= 0.2 && v < 0.5 && Math.abs(u - 0.5) <= ((v - 0.2) / 0.3) * 0.35;
      const muros = v >= 0.5 && v <= 0.8 && u >= 0.15 && u <= 0.85;
      fila.push(...(techo || muros ? BLANCO : AZUL));
    }
    filas.push(Buffer.from(fila));
  }
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(tamano, 0);
  cabecera.writeUInt32BE(tamano, 4);
  cabecera.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', cabecera),
    bloque('IDAT', deflateSync(Buffer.concat(filas), { level: 9 })),
    bloque('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', dibujar(192, 0));
writeFileSync('public/icon-512.png', dibujar(512, 0));
writeFileSync('public/icon-maskable-512.png', dibujar(512, 0.12));
writeFileSync('public/apple-touch-icon.png', dibujar(180, 0));
console.log('Íconos generados en public/');
