# Automatizador Bravo

Sistema de automação web corporativa com Safe Snapshot Policy (SSP) para extração e consolidação inteligente de dados de múltiplos sites.

## 🚀 Características

- **Automação Web Robusta**: Baseado em Playwright para automação confiável de sites corporativos
- **Safe Snapshot Policy (SSP)**: Sistema de versionamento inteligente que detecta mudanças incrementais
- **Consolidação Master**: Unifica dados de múltiplos períodos e estados em arquivos mestres
- **Deduplicação Inteligente**: Remove duplicatas usando chaves primárias configuráveis
- **Rastreabilidade Completa**: Metadados detalhados para auditoria (origem, período, data de processamento)
- **Agendamento Flexível**: Execução automática em horários programados
- **Interface Moderna**: UI Electron com feedback em tempo real

## 📋 Pré-requisitos

- Node.js 16+ 
- Windows 10/11
- Git

## 🔧 Instalação

```bash
# Clone o repositório
git clone https://github.com/robinCardoso/automatizacao-bravo.git
cd automatizacao-bravo

# Instale as dependências
npm install

# Execute em modo desenvolvimento
npm run dev
```

## 📦 Build

```bash
# Build completo (cria instalador)
npm run dist

# Build portátil (ZIP)
npm run dist:portable

# Build apenas diretório (sem instalador)
npm run dist:dir
```

## 🏗️ Arquitetura

### Safe Snapshot Policy (SSP)

O SSP é o coração do sistema, garantindo:
- **Versionamento Incremental**: Apenas mudanças são armazenadas
- **Arquivos Separados**: `CURRENT` (dados atuais) e `DELETED` (registros removidos)
- **Nomenclatura Padronizada**: `TIPO_MODE_PERIODO_UF.xlsx`

### Consolidação Master

Unifica snapshots de diferentes:
- **Períodos**: Mensal, Trimestral, Anual
- **Estados**: Todos os UFs configurados
- **Sites**: Múltiplas fontes de dados

### Estrutura de Pastas

```
automatizador-bravo/
├── app/
│   ├── automation/        # Motor de automação
│   ├── core/             # Lógica de negócio
│   │   ├── consolidation/ # Sistema de consolidação
│   │   ├── diff/         # Engine de diferenças
│   │   └── utils/        # Utilitários
│   ├── policy/           # Políticas (SSP, nomenclatura)
│   ├── config/           # Configuração e logging
│   └── renderer/         # Interface do usuário
├── data/                 # Schemas e configurações
└── dist/                 # Build output
```

## ⚙️ Configuração

### Presets

Configure automações em `Configurações > Presets`:
- **Sites**: URLs e credenciais
- **Workflows**: Sequência de ações
- **Destino**: Pasta para salvar relatórios
- **Tipo de Relatório**: PEDIDO, VENDA, etc.

### Schemas (`data/schemaMaps.json`)

Define chaves primárias para deduplicação:

```json
{
  "PEDIDO": {
    "primaryKey": ["NUMERO_PEDIDO", "ITEM"]
  },
  "VENDA": {
    "primaryKey": ["NOTA_FISCAL", "SERIE", "ITEM"]
  }
}
```

## 🔄 Fluxo de Trabalho

1. **Extração**: Playwright navega e baixa dados
2. **Processamento SSP**: DiffEngine compara com versão anterior
3. **Snapshot**: Salva apenas mudanças (novos/removidos)
4. **Consolidação**: Unifica múltiplos snapshots em arquivo master
5. **Deduplicação**: Remove registros duplicados
6. **Metadados**: Adiciona rastreabilidade completa

## 📊 Metadados de Rastreabilidade

Cada linha do arquivo consolidado inclui:
- `PERIODO_ORIGINAL`: Período da extração
- `ORIGEM_UF`: Estado de origem
- `ORIGEM_SITE`: Nome do site
- `DATA_PROCESSAMENTO_ORIGINAL`: Timestamp do processamento
- `ORIGEM_SNAPSHOT`: Nome do arquivo original

## 🛠️ Tecnologias

- **Electron**: Framework desktop
- **TypeScript**: Linguagem principal
- **Playwright**: Automação web
- **XLSX**: Manipulação de Excel
- **Node.js**: Runtime

## 📝 Licença

Propriedade de Rede União Nacional

## 👥 Autor

**Rede União Nacional**  
Email: contato@redeuniaonacional.com.br

## 🤝 Contribuindo

Este é um projeto corporativo interno. Para contribuições, entre em contato com a equipe de desenvolvimento.

## 📞 Suporte

Para suporte técnico, abra uma issue ou entre em contato através do email corporativo.
