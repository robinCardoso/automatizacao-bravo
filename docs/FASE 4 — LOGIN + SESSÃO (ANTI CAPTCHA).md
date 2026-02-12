Implemente um sistema de sessão persistente com Playwright.

Requisitos:
- Login automatico caso nao funcione use manual inicial (browser visível)
- Salvamento de sessão (cookies + localStorage)
- Execuções futuras headless reutilizando sessão
- Uma sessão por grupo de sites (mesmo login)
- Detecção de sessão expirada

Crie:
- SessionManager
- storageState por site ou grupo
- Fluxo de re-login quando necessário

Explique claramente quando o usuário precisa intervir.