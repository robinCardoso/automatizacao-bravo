import * as fs from 'fs';
import * as path from 'path';

/**
 * Script para limpar snapshots e arquivos de log antigos
 * Este script deve ser executado antes de testar as correções
 */

console.log('Iniciando limpeza de snapshots e logs antigos...');

// Diretórios a serem limpos
const directoriesToClean = [
  './app/logs',
  './snapshots',
  './app/storage/screenshots'
];

directoriesToClean.forEach(dir => {
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        console.log(`Removendo diretório: ${filePath}`);
        fs.rmSync(filePath, { recursive: true, force: true });
      } else {
        console.log(`Removendo arquivo: ${filePath}`);
        fs.unlinkSync(filePath);
      }
    });
    
    console.log(`Diretório ${dir} limpo.`);
  } else {
    console.log(`Diretório ${dir} não encontrado, pulando...`);
  }
});

console.log('Limpeza concluída!');