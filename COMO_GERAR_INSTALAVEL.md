# 📦 GUIA COMPLETO: GERAR INSTALÁVEL DO AUTOMATIZADOR BRAVO

## ✅ Pré-requisitos

1. **Ícone criado** → Arquivo `build\icon.ico` deve existir
   - Se ainda não criou, veja: `build\COMO_CRIAR_ICONE.md`

2. **Código compilado** → Execute antes de gerar o instalável:
   ```powershell
   npm run build
   ```

3. **Dependências instaladas** → Já foi feito:
   ```powershell
   npm install
   ```

---

## 🚀 PASSO A PASSO: GERAR INSTALÁVEL

### **1. Compilar TypeScript**
```powershell
npm run build
```

**Aguarde até ver:** `PS C:\Users\conta\source\automatizador-bravo>`

---

### **2. Gerar o Instalável (.exe)**
```powershell
npm run dist
```

**O que acontece:**
- Electron Builder compila o aplicativo
- Cria instalador NSIS para Windows
- Gera arquivo `.exe` na pasta `release\`

**Tempo estimado:** 3-5 minutos

---

### **3. Localizar o Instalável**

O arquivo estará em:
```
c:\Users\conta\source\automatizador-bravo\release\
```

**Arquivos gerados:**
- `Automatizador Bravo Setup 1.0.0.exe` → Instalador completo
- `win-unpacked\` → Versão descompactada (para testes)

---

## 📋 CARACTERÍSTICAS DO INSTALÁVEL

### **Durante a Instalação:**
- ✅ Escolha do diretório de instalação
- ✅ Criação de atalho na Área de Trabalho
- ✅ Criação de atalho no Menu Iniciar
- ✅ Tela de licença (EULA)
- ✅ Opção para executar após instalação

### **Após Instalação:**
- ✅ Aplicativo instalado em `C:\Program Files\Automatizador Bravo\`
- ✅ Ícone personalizado na barra de tarefas
- ✅ Configurado para iniciar automaticamente com Windows
- ✅ Dados salvos em `%APPDATA%\automatizador-bravo\`

---

## ⚙️ INICIALIZAÇÃO AUTOMÁTICA

### **Como Funciona:**

1. **Primeira execução** → Sistema configura auto-start automaticamente
2. **Computador liga** → App inicia minimizado em segundo plano
3. **Agendamentos executam** → Presets configurados rodam sozinhos

### **Desabilitar Auto-Start (se necessário):**

O usuário pode desativar via Windows:
```
Configurações → Aplicativos → Inicialização → Automatizador Bravo → OFF
```

Ou programaticamente, adicione interface no app com:
```javascript
// Exemplo de toggle na interface
const status = await window.electronAPI.getAutoLaunchStatus();
await window.electronAPI.setAutoLaunch(!status.enabled);
```

---

## 🔧 COMANDOS ÚTEIS

### **Gerar apenas executável (sem instalador):**
```powershell
npm run pack
```
Mais rápido para testes. Gera pasta `win-unpacked\`.

### **Gerar instalável sem compressão:**
```powershell
npm run dist:dir
```
Útil para debug.

### **Limpar cache do builder:**
```powershell
Remove-Item -Recurse -Force release
Remove-Item -Recurse -Force dist\node_modules
npm run build
npm run dist
```

---

## 📊 ESTRUTURA DO INSTALÁVEL

```
Automatizador Bravo Setup 1.0.0.exe
│
├── Instalador NSIS
│   ├── Tela de boas-vindas
│   ├── Licença (EULA)
│   ├── Escolha de diretório
│   ├── Instalação de arquivos
│   └── Finalização
│
└── Aplicativo instalado
    ├── Automatizador Bravo.exe
    ├── resources\
    │   ├── app.asar (código compilado)
    │   └── storage\ (opcional)
    └── locales\ (idiomas Chromium)
```

---

## 🛡️ PERMISSÕES E SEGURANÇA

### **Nível de Execução:**
```json
"requestedExecutionLevel": "asInvoker"
```
**Significa:** Não requer privilégios de administrador.

### **Assinatura Digital (Opcional):**

Para distribuição profissional, assine o `.exe`:

1. Obtenha certificado de Code Signing
2. Configure no `package.json`:
```json
"win": {
  "certificateFile": "cert.pfx",
  "certificatePassword": "sua_senha"
}
```

**Sem assinatura:** Windows mostrará "Editor desconhecido" (normal).

---

## 🐛 TROUBLESHOOTING

### **Erro: "icon.ico not found"**
**Solução:** Crie o arquivo `build\icon.ico` antes de rodar `npm run dist`.

### **Erro: "Cannot find module 'better-sqlite3'"**
**Solução:**
```powershell
Remove-Item -Recurse -Force node_modules
npm install
npm run dist
```

### **Instalador não inicia:**
**Solução:** Desabilite antivírus temporariamente ou adicione exceção.

### **Aplicativo não abre após instalar:**
**Solução:** Verifique logs em:
```
%APPDATA%\automatizador-bravo\logs\main.log
```

---

## 📤 DISTRIBUIÇÃO

### **Tamanho do Instalável:**
~250-350 MB (inclui Chromium para automação)

### **Requisitos do Sistema:**
- Windows 10/11 (64-bit)
- 4 GB RAM mínimo
- 500 MB espaço em disco

### **Como Distribuir:**
1. Envie `Automatizador Bravo Setup 1.0.0.exe` para usuários
2. Usuários executam o instalador
3. Seguem wizard de instalação
4. Aplicativo pronto para usar!

---

## 🎯 PRÓXIMAS VERSÕES

Para atualizar o aplicativo:

1. Aumente versão em `package.json`:
```json
"version": "1.1.0"
```

2. Recompile e gere novo instalável:
```powershell
npm run build
npm run dist
```

3. Novo instalador será: `Automatizador Bravo Setup 1.1.0.exe`

**Auto-update:** Considere implementar electron-updater para updates automáticos.

---

## ✅ CHECKLIST FINAL

Antes de distribuir, verifique:

- [ ] Ícone `build\icon.ico` existe e está correto
- [ ] Licença `build\license.txt` está atualizada
- [ ] Versão no `package.json` está correta
- [ ] Aplicativo foi testado em modo dev (`npm run dev`)
- [ ] Código TypeScript compila sem erros (`npm run build`)
- [ ] Instalável foi gerado com sucesso (`npm run dist`)
- [ ] Instalável foi testado em máquina limpa
- [ ] Auto-start funciona após instalação
- [ ] Agendamentos executam corretamente

---

## 🎉 PRONTO!

Seu instalável profissional está pronto em:
```
c:\Users\conta\source\automatizador-bravo\release\Automatizador Bravo Setup 1.0.0.exe
```

**Distribua e automatize!** 🚀
