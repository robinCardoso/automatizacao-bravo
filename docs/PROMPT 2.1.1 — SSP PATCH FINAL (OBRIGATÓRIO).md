Corrija imediatamente 3 violações SSP:

1. Site Folder Isolation
O folder deve ser:
snapshots/{siteId}/


Nunca:
snapshots/{siteId}-{uf}/

UF sempre entra no nome do snapshot, nunca na pasta.

2. Remover _PREV.xlsx

Remova completamente qualquer criação de:

*_PREV.xlsx


O algoritmo correto é:
Ler CURRENT existente (prev)
Comparar com novo download
Sobrescrever CURRENT
SSP não permite backups paralelos.

3. DELETED com contexto completo

O arquivo DELETED deve armazenar:

signature

removedAt timestamp

runId
row completa
Formato obrigatório:

Excel:

| schemaKeys... | removedAt | runId |

Ou JSON estruturado.

Não salvar apenas string signature.

Critério de aceite

Somente aprovado quando:

✅ snapshots/{siteId}/ isolado
✅ nenhum _PREV existe
✅ DELETED contém contexto e linha original
✅ ERP consegue aplicar exclusões corretamente