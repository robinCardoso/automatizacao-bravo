# 🎯 DIRETRIZES DE UI DESKTOP EMPRESARIAL

## 📋 OBJETIVO DO SISTEMA

**Tipo de aplicação:** ERP / Software corporativo profissional

**Ambiente de uso:** Desktop Windows - Utilização diária em ambiente corporativo

**Resoluções suportadas:**
- **Mínimo:** 1366×768
- **Ideal:** 1920×1080

---

## ⚠️ REGRAS OBRIGATÓRIAS DE LAYOUT

### 🚫 PROIBIDO - Scroll Vertical
**Nunca usar scroll vertical como padrão de layout.**

> ❗ **Regra crítica:** Nenhuma tela pode depender de rolagem para funcionar.

### ✅ SOLUÇÕES PARA CONTEÚDO EXTENSO

Quando o conteúdo exceder o espaço disponível, usar:

- **Tabs** - Organização por categorias
- **Accordions** - Seções expansíveis
- **Modals** - Janelas popup para ações complexas
- **Painéis colapsíveis** - Seções que podem ser minimizadas
- **Tabelas paginadas** - Navegação por páginas
- **Split-view** - Divisão horizontal da tela
- **Cards compactos** - Elementos menores e organizados
- **Tabelas com scroll interno** - Rolagem apenas no componente

### 🎯 ÁREA PRINCIPAL
- **Sem overflow** - Conteúdo deve caber na tela
- **Altura limitada** - Tabelas e listas com altura máxima definida
- **Footer fixo** - Barra inferior para ações principais

---

## 🎨 DESIGN STYLE GUIDE

### 🖼️ APARÊNCIA VISUAL
```
✓ Neutro e limpo
✓ Sem exageros visuais
✓ Foco em produtividade
✓ Layout denso mas legível
✓ Sem animações desnecessárias
```

### 🎯 COMPONENTIZAÇÃO OBRIGATÓRIA

Toda interface deve usar componentes reutilizáveis:

```jsx
<TopMenu />          // Menu superior fixo
<SidebarSteps />     // Barra lateral de navegação
<MainPanel />        // Painel principal de conteúdo
<FixedFooterActions /> // Rodapé com ações principais
```

> ❌ **Proibido:** Criar telas soltas sem estrutura padronizada

---

## 🎯 ELEMENTOS FIXOS E SEMPRE VISÍVEIS

### 🔘 BOTÕES PRINCIPAIS
Estes botões **DEVEM** estar sempre visíveis sem necessidade de scroll:

```
[⬅ Voltar]    [Testar Login]    [Salvar ✔]
```

**Botões obrigatórios:**
- Voltar ←
- Próximo →
- Testar ▶
- Salvar ✔

> 📏 **Princípio:** Nunca exigir que o usuário role para clicar em ações principais

### 🪟 MODAIS PARA AÇÕES COMPLEXAS

Abrir modais para:
- ✏️ Editar seletores
- 🔐 Inserir credenciais
- ✅ Confirmar validações
- ⚠️ Erros detalhados

---

## ✅ RESULTADO ESPERADO

O sistema deve se comportar como:

🏢 **ERP corporativo**
🤖 **Software de automação empresarial**
🖥️ **Aplicativo desktop profissional**

🚫 **NUNCA como:**
- Websites
- Landing pages
- Aplicações mobile

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO

Antes de implementar qualquer tela Electron:

✅ Seguir layout fixo
✅ Evitar scroll vertical
✅ Manter menus e ações sempre visíveis
✅ Usar componentes padronizados
✅ Testar em 1366×768 e 1920×1080
✅ Garantir que nada quebre ou exija scroll

---

## 🎯 RESUMO EXECUTIVO

**PRINCÍPIO CENTRAL:** Toda interface deve funcionar sem scroll vertical em qualquer resolução suportada, mantendo todas as ações principais sempre acessíveis.