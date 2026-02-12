# 🎨 INSTRUÇÕES PARA ÍCONE DO AUTOMATIZADOR BRAVO

## Criação do Ícone

### **Requisitos do Ícone:**
1. **Formato:** `.ico` (Windows Icon)
2. **Tamanhos múltiplos incluídos:**
   - 16x16 pixels
   - 32x32 pixels
   - 48x48 pixels
   - 64x64 pixels
   - 128x128 pixels
   - 256x256 pixels

### **Design Sugerido:**
- Logo principal: Letra "B" estilizada (Bravo)
- Cores: Azul corporativo (#2563EB) e cinza neutro (#64748B)
- Estilo: Moderno, minimalista, profissional
- Fundo: Transparente ou sólido

---

## Ferramentas para Criar Ícone

### **Opção 1: Conversor Online (Mais Rápido)**
1. Crie uma imagem PNG de 512x512 pixels
2. Acesse: https://www.icoconverter.com/
3. Faça upload da imagem PNG
4. Marque todos os tamanhos (16x16 até 256x256)
5. Baixe o arquivo `.ico`

### **Opção 2: GIMP (Software Gratuito)**
1. Baixe GIMP: https://www.gimp.org/
2. Crie imagem 512x512 pixels
3. Desenhe o logo
4. Exportar como → Microsoft Windows Icon (*.ico)
5. Marque todos os tamanhos na exportação

### **Opção 3: Photoshop/Illustrator (Profissional)**
1. Crie arte vetorial ou raster em 512x512
2. Use plugin ICO Format: https://www.telegraphics.net/sw/product/ICOFormat
3. Salve como .ico com múltiplos tamanhos

---

## Onde Colocar o Ícone

Após criar o ícone, copie para:
```
c:\Users\conta\source\automatizador-bravo\build\icon.ico
```

**Importante:** O arquivo DEVE se chamar exatamente `icon.ico` e estar na pasta `build\`.

---

## Design Sugerido (Conceito)

```
┌─────────────────┐
│                 │
│    ┌─────┐     │
│    │  B  │     │  ← Letra "B" em azul (#2563EB)
│    │ ─── │     │  ← Com linha horizontal (automação)
│    └─────┘     │
│                 │
│   AUTOMATIZADOR │  ← Texto pequeno embaixo (opcional)
│                 │
└─────────────────┘
```

**Cores:**
- Azul principal: `#2563EB` (confiança, tecnologia)
- Cinza secundário: `#64748B` (sofisticação)
- Fundo: Branco `#FFFFFF` ou transparente

---

## Verificar Ícone Funciona

1. Coloque `icon.ico` em `build\icon.ico`
2. Execute: `npm run dev`
3. O aplicativo deve mostrar o ícone na barra de tarefas e janela

Se não funcionar, verifique:
- Arquivo está em `build\icon.ico`?
- Formato é `.ico` (não `.png` renomeado)?
- Contém múltiplos tamanhos?

---

## Template PNG (Para Conversão)

Se preferir, crie um PNG 512x512 com este design:
- Fundo: Transparente
- Forma: Quadrado arredondado (border-radius 20%)
- Logo: Centralizado
- Cores: Azul e branco

Depois converta para .ico usando https://www.icoconverter.com/
