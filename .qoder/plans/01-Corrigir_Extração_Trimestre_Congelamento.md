# Plano para Corrigir Problemas de Extração de Dados por Trimestre e Congelamento de Página

## Análise dos Problemas Identificados

### 1. Local na Interface do Usuário onde os Usuários Selecionam Extração por Trimestre versus Mensal
- **Local**: O tipo de relatório (VENDA, PEDIDO) e a seleção de período são configurados na aba de "Sites e Ações" no formulário de configuração do site
- **Elementos relevantes**: 
  - Select [sReportType](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/renderer/index.html#L522-L528) define o tipo de relatório (VENDA/PEDIDO)
  - Os períodos são definidos por meio de tokens como [TRIM_ATUAL], [MES_ATUAL] nos passos do tipo "fillDateRange"
  - A UF é selecionada via [sUF](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/renderer/index.html#L489-L520) que faz parte da identidade SSP

### 2. Mecanismo de Entrada de Data e Aguardo Adequado do Carregamento da Página
- **Problema**: O sistema atual usa `waitUntil: 'domcontentloaded'` no método [executeGoto](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/step-executor.ts#L137-L147) que pode não ser suficiente para páginas com conteúdo dinâmico
- **Local**: [app/automation/engine/step-executor.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/step-executor.ts)
- **Método**: [executeWaitFor](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/step-executor.ts#L388-L395) - atualmente apenas aguarda por um elemento mas não tem verificação robusta de carregamento

### 3. Por que o Sistema às Vezes Faz Download Apenas dos Dados de Janeiro
- **Causa provável**: 
  - O sistema pode estar falhando ao preencher corretamente os campos de data
  - Quando ocorrem erros de preenchimento de data, o sistema pode reverter para valores padrão ou a página pode permanecer em estado inconsistente
  - Problemas no tratamento de tokens de data como [TRIM_ATUAL] podem resultar em datas inválidas
- **Verificação necessária**: No método [executeFillDateRange](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/step-executor.ts#L212-L260)

### 4. O que Causa o Congelamento da Página Durante Operações de Entrada de Data
- **Possíveis causas**:
  - A página pode ter lógica de validação de data que dispara eventos complexos
  - O preenchimento simultâneo de dois campos de data (início e fim) pode causar problemas de sincronização
  - A ausência de esperas adequadas após o preenchimento de campos pode levar a condições de corrida

## Soluções Propostas

### 1. Melhoria no Aguardo de Carregamento de Página
**Arquivo**: [app/automation/engine/step-executor.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/step-executor.ts)

```typescript
private async executeGoto(step: Step, timeout: number): Promise<void> {
  if (!step.value) {
    throw new Error('Valor obrigatório para step goto');
  }

  automationLogger.debug(`Navegando para: ${step.value}`);
  await this.page.goto(step.value, {
    timeout,
    waitUntil: 'networkidle' // Alterado de 'domcontentloaded' para 'networkidle'
  });

  // Aguarda adicional opcional para páginas específicas de relatório
  await this.page.waitForTimeout(2000);
}
```

### 2. Melhoria no Método de Preenchimento de Intervalo de Data
**Arquivo**: [app/automation/engine/step-executor.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/step-executor.ts)

```typescript
private async executeFillDateRange(step: Step, timeout: number, retries: number): Promise<void> {
  if (!step.selector) {
    throw new Error('Seletor obrigatório para step fillDateRange');
  }
  if (!step.value) {
    throw new Error('Valor obrigatório para step fillDateRange (Ex: [MES_ATUAL] ou inicio,fim)');
  }

  // Resolve tokens dinâmicos de data (pode ser um range token como [MES_ATUAL] ou tokens individuais)
  const resolvedValue = this.resolveDateTokens(step.value);

  // Parse das datas
  let [startDate, endDate] = resolvedValue.split(',');

  // Se ainda houver tokens individuais (ex: "[INICIO_MES],[HOJE]"), resolve cada um
  if (startDate && startDate.startsWith('[')) startDate = this.resolveDateTokens(startDate.trim());
  if (endDate && endDate.startsWith('[')) endDate = this.resolveDateTokens(endDate.trim());

  // SSP: Atualiza o período atual baseado no valor original (token) ou datas resultantes
  this.updateCurrentPeriod(step.value, startDate, endDate);

  if (!startDate || !endDate) {
    throw new Error(`Formato de data inválido após resolução: ${resolvedValue}. Use: "inicio,fim"`);
  }

  const rawSelectors = Array.isArray(step.selector) ? step.selector : [step.selector];
  // Suporte a seletores separados por vírgula no campo único da UI
  const selectors = rawSelectors.length === 1 && typeof rawSelectors[0] === 'string'
    ? (rawSelectors[0] as string).split(',')
    : rawSelectors;

  // Preenche data inicial
  if (selectors[0]) {
    const startDateElement = await this.selectorResolver.resolveSelector(selectors[0].trim(), retries);
    const formattedStartDate = await this.formatDateForInput(startDateElement, startDate.trim());
    automationLogger.info(`[fillDateRange] #dataIni = ${formattedStartDate}`);
    automationLogger.debug(`Preenchendo data inicial: ${formattedStartDate} (original: ${startDate})`);
    await startDateElement.fill(formattedStartDate, { timeout });
    
    // Aguarda um tempo adicional após preencher a data inicial para evitar congelamento
    await this.page.waitForTimeout(1000);
    
    // Aguarda o carregamento de quaisquer elementos dependentes da data inicial
    await this.waitForPageStability();
  }

  // Preenche data final (se houver segundo seletor)
  if (selectors[1]) {
    const endDateElement = await this.selectorResolver.resolveSelector(selectors[1].trim(), retries);
    const formattedEndDate = await this.formatDateForInput(endDateElement, endDate.trim());
    automationLogger.info(`[fillDateRange] #dataFim = ${formattedEndDate}`);
    automationLogger.debug(`Preenchendo data final: ${formattedEndDate} (original: ${endDate})`);
    await endDateElement.fill(formattedEndDate, { timeout });
    
    // Aguarda um tempo adicional após preencher a data final
    await this.page.waitForTimeout(1000);
    
    // Aguarda o carregamento de quaisquer elementos dependentes da data final
    await this.waitForPageStability();
  }
}

/**
 * Aguarda a estabilidade da página após alterações de campo
 */
private async waitForPageStability(): Promise<void> {
  try {
    // Aguarda até que não haja mais requisições de rede por 1 segundo
    await this.page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch {
    // Se o estado de rede não estabilizar, aguarda um tempo fixo como fallback
    await this.page.waitForTimeout(2000);
  }
}
```

### 3. Melhoria no Tratamento de Tokens de Data
**Arquivo**: [app/automation/engine/step-executor.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/step-executor.ts)

Adicionar validação adicional no método [resolveDateTokens](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/step-executor.ts#L299-L349):

```typescript
private resolveDateTokens(value: string): string {
  if (!value.startsWith('[')) return value;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const formatDate = (d: Date) => this.formatDateDDMMYYYY(d);

  switch (value.toUpperCase()) {
    case '[HOJE]':
      return formatDate(now);

    case '[INICIO_MES]':
      return formatDate(new Date(year, month, 1));

    case '[INICIO_ANO]':
      return formatDate(new Date(year, 0, 1));

    case '[MES_ATUAL]':
      return `${formatDate(new Date(year, month, 1))},${formatDate(now)}`;

    case '[MES_ANTERIOR]':
      const firstDayPrev = new Date(year, month - 1, 1);
      const lastDayPrev = new Date(year, month, 0);
      return `${formatDate(firstDayPrev)},${formatDate(lastDayPrev)}`;

    case '[TRIM_ATUAL]':
      const currentTriStartMonth = Math.floor(month / 3) * 3;
      const currentTriEndMonth = currentTriStartMonth + 3;
      const currentTriStart = new Date(year, currentTriStartMonth, 1);
      const currentTriEnd = new Date(year, currentTriEndMonth, 0); // Último dia do tri atual
      
      // Log para depuração
      automationLogger.debug(`[TRIM_ATUAL] Calculado: ${formatDate(currentTriStart)} a ${formatDate(currentTriEnd)}`);
      return `${formatDate(currentTriStart)},${formatDate(currentTriEnd)}`;

    case '[TRIM_ANTERIOR]':
      const prevTriStartMonth = (Math.floor(month / 3) * 3) - 3;
      const prevTriStart = new Date(year, prevTriStartMonth, 1); // JS trata mês negativo voltando ano automaticamente
      const prevTriEnd = new Date(year, prevTriStartMonth + 3, 0);
      return `${formatDate(prevTriStart)},${formatDate(prevTriEnd)}`;

    case '[TRIM_1]': 
      automationLogger.debug('[TRIM_1] Calculado: Jan-Mar');
      return `${formatDate(new Date(year, 0, 1))},${formatDate(new Date(year, 2, 31))}`;
    case '[TRIM_2]': 
      automationLogger.debug('[TRIM_2] Calculado: Abr-Jun');
      return `${formatDate(new Date(year, 3, 1))},${formatDate(new Date(year, 5, 30))}`;
    case '[TRIM_3]': 
      automationLogger.debug('[TRIM_3] Calculado: Jul-Set');
      return `${formatDate(new Date(year, 6, 1))},${formatDate(new Date(year, 8, 30))}`;
    case '[TRIM_4]': 
      automationLogger.debug('[TRIM_4] Calculado: Out-Dez');
      return `${formatDate(new Date(year, 9, 1))},${formatDate(new Date(year, 11, 31))}`;

    case '[ANO_ATUAL]':
      return `${formatDate(new Date(year, 0, 1))},${formatDate(now)}`;

    default:
      automationLogger.warn(`Token de data desconhecido: ${value}`);
      return value;
  }
}
```

### 4. Melhoria na Detecção de Período para SSP
**Arquivo**: [app/automation/engine/step-executor.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/step-executor.ts)

Melhorar o método [updateCurrentPeriod](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/step-executor.ts#L352-L386) para melhor identificação de trimestres:

```typescript
/**
 * SSP: Gera uma chave de período determinística a partir das datas ou tokens
 */
private updateCurrentPeriod(value: string, startDate: string, endDate: string): void {
  const valUpper = value.toUpperCase();

  // Se for um token de trimestre, usa o nome do trimestre diretamente
  if (valUpper.includes('TRIM')) {
    const year = new Date().getFullYear();
    if (valUpper === '[TRIM_ATUAL]') {
      const currentMonth = new Date().getMonth();
      const tri = Math.floor(currentMonth / 3) + 1;
      this.currentPeriod = `${tri}_TRIMESTRE_${year}`;
    } else if (valUpper === '[TRIM_ANTERIOR]') {
      const currentMonth = new Date().getMonth();
      const currentQuarter = Math.floor(currentMonth / 3);
      const prevQuarter = (currentQuarter - 1 + 4) % 4; // Garante que seja 0-3
      const prevQuarterNum = prevQuarter + 1;
      // Para o ano anterior se o trimestre anterior era no ano anterior
      const actualYear = currentQuarter === 0 ? year - 1 : year;
      this.currentPeriod = `${prevQuarterNum}_TRIMESTRE_${actualYear}`;
    } else {
      const match = valUpper.match(/TRIM[_\s]*(\d)/);
      const tri = match ? match[1] : 'X';
      this.currentPeriod = `${tri}_TRIMESTRE_${year}`;
    }
    automationLogger.info(`[SSP] Período Trimestral detectado: ${this.currentPeriod}`);
    return;
  }

  try {
    // Fallback para detecção por data (DD/MM/YYYY)
    const parts = endDate.split('/');
    if (parts.length === 3) {
      const monthNames = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
      const month = monthNames[parseInt(parts[1]) - 1];
      const year = parts[2];
      this.currentPeriod = `${month}${year}`;
      automationLogger.info(`[SSP] Período mensal detectado: ${this.currentPeriod}`);
    }
  } catch (e) {
    this.currentPeriod = 'GERAL';
    automationLogger.error(`[SSP] Erro ao detectar período: ${e.message}`);
  }
}
```

### 5. Adição de Funcionalidade de Retentativa Inteligente
**Arquivo**: [app/automation/engine/step-executor.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/step-executor.ts)

Adicionar um método para verificar se a página está responsiva após operações de data:

```typescript
/**
 * Verifica se a página está responsiva após operações de data
 */
private async verifyPageResponsiveness(timeout: number = 10000): Promise<boolean> {
  try {
    // Tenta interagir com um elemento genérico para verificar se a página está responsiva
    await this.page.waitForFunction(() => document.readyState === 'complete', { timeout });
    
    // Verifica se não há indicadores de carregamento visível
    const isLoading = await this.page.evaluate(() => {
      // Verifica por possíveis indicadores de carregamento
      const loadingIndicators = [
        '.loading', '.spinner', '.progress', '[aria-busy="true"]',
        '.ui-loader', '.modal-backdrop', '.overlay'
      ];
      
      return loadingIndicators.some(selector => document.querySelector(selector));
    });
    
    return !isLoading;
  } catch {
    return false;
  }
}
```

### 6. Melhoria na Implementação do waitFor
**Arquivo**: [app/automation/engine/step-executor.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/step-executor.ts)

Atualizar o método [executeWaitFor](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/automation/engine/step-executor.ts#L388-L395) para incluir verificação de responsividade:

```typescript
private async executeWaitFor(step: Step, timeout: number, retries: number): Promise<void> {
  if (!step.selector) {
    throw new Error('Seletor obrigatório para step waitFor');
  }

  automationLogger.debug('Aguardando elemento');
  await this.selectorResolver.waitForElement(step.selector, timeout);
  
  // Após encontrar o elemento, verifica se a página está responsiva
  const isResponsive = await this.verifyPageResponsiveness(timeout);
  if (!isResponsive) {
    automationLogger.warn('Página não está totalmente responsiva após encontrar elemento. Aguardando...');
    await this.page.waitForTimeout(2000);
  }
}
```

## Implementação Recomendada

1. Comece pela melhoria do método `executeGoto` para garantir carregamento adequado das páginas
2. Implemente o método `waitForPageStability` para uso após operações de preenchimento de data
3. Atualize o método `executeFillDateRange` para incluir esperas adequadas entre preenchimentos de campos
4. Melhore o tratamento de tokens de data com mais logs de debug
5. Atualize a detecção de período para melhor identificação de trimestres
6. Adicione verificação de responsividade da página após operações de data
7. Teste as mudanças com diferentes cenários de extração trimestral e mensal

Essas melhorias devem resolver os problemas de congelamento de página e garantir que a extração de dados por trimestre funcione corretamente, evitando o problema de baixar apenas os dados de janeiro.