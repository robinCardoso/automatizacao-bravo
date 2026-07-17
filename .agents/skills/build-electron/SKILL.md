---
name: build-electron
description: Use when the user wants to compile, package, build, distribute, bundle, or generate the production executable or installer for the Electron application.
---

# Compilação e Distribuição (Build) do Electron

Esta skill ensina a instruir o usuário sobre como gerar a build final de distribuição do aplicativo Electron (Automatizador Bravo) e quais os comandos disponíveis.

## Comandos de Empacotamento (Distribuição)

O aplicativo utiliza o `electron-builder` para criar os executáveis para Windows. O usuário deve executar os comandos no terminal `powershell` a partir do diretório raiz do projeto:

### 1. Build Limpa e Completa (Recomendado)
Executa a limpeza de compilações anteriores, encerra processos travados do aplicativo e compila o instalador do zero:
```powershell
npm run dist:full
```

### 2. Geração Simples do Instalador
Gera o executável de instalação `.exe` de forma direta:
```powershell
npm run dist
```

### 3. Geração de Versão Portátil (Zip)
Cria um arquivo ZIP contendo o executável portátil (sem necessidade de instalação):
```powershell
npm run dist:portable
```

### 4. Build de Teste Rápido (Descompactado)
Gera o app na pasta `release/win-unpacked` sem empacotar em um instalador, ideal para testes locais rápidos antes de distribuir:
```powershell
npm run dist:dir
```

---

## Observações Importantes para o Agente:
1. Sempre lembre o usuário de que comandos no terminal devem ser rodados por ele (regra global).
2. Forneça o comando exato formatado em bloco de código PowerShell.
3. Indique que o resultado final das compilações (instaladores e arquivos compactados) é salvo na pasta `release/` na raiz do projeto.
