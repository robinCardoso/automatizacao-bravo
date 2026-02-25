/**
 * Garante que build/license.txt tenha BOM UTF-8 para o instalador NSIS
 * exibir corretamente caracteres acentuados (ç, ã, é, etc.).
 */
const fs = require('fs');
const path = require('path');

const licensePath = path.join(__dirname, '..', 'build', 'license.txt');
if (!fs.existsSync(licensePath)) {
  console.warn('[ensure-license-utf8-bom] build/license.txt não encontrado.');
  process.exit(0);
}

const content = fs.readFileSync(licensePath, 'utf8');
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const withBom = Buffer.concat([BOM, Buffer.from(content, 'utf8')]);
fs.writeFileSync(licensePath, withBom);
console.log('[ensure-license-utf8-bom] BOM UTF-8 adicionado a build/license.txt');
