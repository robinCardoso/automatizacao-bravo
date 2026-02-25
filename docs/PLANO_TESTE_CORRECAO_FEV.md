# Plano de Teste para Validar Correção do Problema de Deleção de Linhas do Mês FEV

## Objetivo
Validar que a correção implementada na função `buildSignature` do DiffEngine resolve o problema de deleção incorreta de linhas do mês FEV.

## Preparação do Ambiente de Teste

### 1. Configuração Inicial
- Verificar que o DiffEngine.ts contém a assinatura modificada com delimitadores `|`
- Confirmar que o schemaMaps.json está configurado corretamente para VENDA com as chaves primárias
- Preparar dados de teste com registros que contenham "FEV" em campos específicos

### 2. Dados de Teste
Criar conjuntos de dados de teste que incluam:
- Conjunto A: Dados com registros contendo "FEV" em campos relevantes (ID, PRODCOD, NNF, Referencia)
- Conjunto B: Dados atualizados onde os mesmos registros com "FEV" ainda existem
- Conjunto C: Dados com novos registros adicionados
- Conjunto D: Dados com alguns registros removidos (legítimos)

## Testes a Serem Executados

### Teste 1: Validação da Nova Função de Assinatura
**Objetivo:** Verificar que a função `buildSignature` cria assinaturas únicas e corretas

**Procedimento:**
1. Criar registros de teste com valores contendo "FEV"
2. Executar a função `buildSignature` para esses registros
3. Verificar que as assinaturas geradas contêm delimitadores `|`
4. Confirmar que assinaturas são únicas e consistentes

**Critério de Sucesso:**
- Assinaturas devem ter o formato: `|valor1|::|valor2|::|valor3|::|valor4|`
- Assinaturas idênticas devem ser geradas para os mesmos dados
- Assinaturas diferentes devem ser geradas para dados diferentes

### Teste 2: Processo de Diferenciação Completo
**Objetivo:** Validar que o processo de diferenciação funciona corretamente com os dados do mês FEV

**Procedimento:**
1. Executar o DiffEngine com dados do Conjunto A (snapshot anterior)
2. Executar o DiffEngine com dados do Conjunto B (snapshot atual)
3. Verificar os resultados de registros adicionados e removidos
4. Confirmar que registros com "FEV" não são removidos indevidamente

**Critério de Sucesso:**
- Nenhum registro legítimo contendo "FEV" deve ser marcado como removido
- Apenas registros realmente ausentes no novo conjunto devem ser marcados como removidos
- Novos registros devem ser corretamente identificados como adicionados

### Teste 3: Cenário de Meses Diferentes
**Objetivo:** Verificar que a correção não afeta o funcionamento com outros meses

**Procedimento:**
1. Executar testes semelhantes com dados contendo nomes de outros meses (JAN, MAR, ABR, etc.)
2. Validar que a diferenciação funciona corretamente para todos os meses

**Critério de Sucesso:**
- O processo de diferenciação deve funcionar corretamente para todos os meses
- Nenhuma regressão deve ocorrer para meses diferentes de FEV

### Teste 4: Casos Extremos
**Objetivo:** Testar cenários limite que poderiam causar problemas

**Procedimento:**
1. Testar com dados contendo caracteres especiais juntamente com "FEV"
2. Testar com campos vazios ou nulos
3. Testar com valores muito longos contendo "FEV"
4. Testar com múltiplas ocorrências de "FEV" nos dados

**Critério de Sucesso:**
- O sistema deve lidar corretamente com todos os casos extremos
- Não deve ocorrer falhas ou assinaturas incorretas

## Validação Final

### Verificação de Logs
- Confirmar que os logs do DiffEngine estão funcionando corretamente
- Verificar que as informações de diferenciação estão sendo registradas adequadamente

### Comparação com Comportamento Anterior
- Executar os mesmos testes com uma versão anterior do código (simulado) para confirmar a melhoria
- Documentar as diferenças observadas

## Resultados Esperados

1. A função de assinatura deve criar identificadores únicos que não sejam afetados por coincidências acidentais com nomes de meses
2. O processo de diferenciação deve manter os registros legítimos contendo "FEV" no arquivo CURRENT
3. Apenas os registros realmente removidos devem aparecer no arquivo DELETED
4. O sistema deve continuar funcionando corretamente para todos os outros cenários

## Documentação dos Resultados

Após a execução dos testes:
- Registrar os resultados obtidos
- Documentar qualquer comportamento inesperado
- Confirmar que o problema de deleção incorreta foi resolvido
- Atualizar a documentação do sistema se necessário