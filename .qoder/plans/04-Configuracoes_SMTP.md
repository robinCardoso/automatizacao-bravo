# Plano para Melhoria das Configurações de E-mail (SMTP)

## Análise Atual do Sistema

### Componentes Atuais
- **Serviço de Notificação**: [app/core/notifications/NotificationService.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/core/notifications/NotificationService.ts)
- **Interface de Configuração**: [app/renderer/modules/ui.js](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/renderer/modules/ui.js) e [app/renderer/main.js](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/renderer/main.js)

### Configuração SMTP Atual
- Armazenamento de credenciais em texto simples no arquivo de configuração
- Sem validação rigorosa das configurações SMTP antes do salvamento
- Ausência de teste de conexão SMTP
- Sem criptografia das credenciais no armazenamento

## Problemas Identificados

### 1. Vulnerabilidades de Segurança
- **Armazenamento de credenciais em texto simples**: As credenciais SMTP são armazenadas diretamente no arquivo de configuração sem criptografia
- **Ausência de proteção adicional**: Não há mecanismos de proteção de credenciais

### 2. Validade e Confiabilidade da Configuração
- **Validação insuficiente**: Não há validação rigorosa dos campos SMTP antes do salvamento
- **Ausência de teste de conexão**: Não é possível testar a conexão SMTP antes de salvar as configurações
- **Tratamento básico de erros**: O tratamento de erros durante o envio de e-mails é mínimo

### 3. Experiência do Usuário
- **Feedback limitado**: Pouco feedback ao usuário sobre o status das configurações de e-mail
- **Interface básica**: A interface de configuração de e-mail é funcional mas pode ser melhorada
- **Ausência de testes**: Não é possível enviar um e-mail de teste para validar a configuração

## Soluções Propostas

### 1. Melhorias de Segurança

#### A. Criptografia de Credenciais
**Arquivo**: [app/config/config-manager.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/config/config-manager.ts)

Implementar um sistema de criptografia para as credenciais SMTP:

```typescript
import crypto from 'crypto';

class SecureCredentialManager {
  private static readonly algorithm = 'aes-256-gcm';
  private static readonly secret = process.env.CRYPTO_SECRET || 'fallback-secret-key-32-chars-long';

  static encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, Buffer.from(this.secret));
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return `${encrypted}.${iv.toString('hex')}.${authTag.toString('hex')}`;
  }

  static decrypt(encryptedData: string): string {
    const [encrypted, ivHex, authTagHex] = encryptedData.split('.');
    const decipher = crypto.createDecipher(this.algorithm, Buffer.from(this.secret));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    decipher.setAutoPadding(true);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
```

#### B. Atualização do Esquema de Configuração
**Arquivo**: [app/config/config-manager.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/config/config-manager.ts)

```typescript
// Atualizar o esquema SMTP para suportar credenciais criptografadas
const AppConfigSchema = z.object({
  // ... outras configurações ...
  notifications: z.object({
    enabled: z.boolean().default(false),
    smtp: z.object({
      host: z.string().min(1, 'Host SMTP é obrigatório'),
      port: z.number().min(1).max(65535),
      secure: z.boolean().default(false),
      user: z.string().optional(), // Será armazenado criptografado
      pass: z.string().optional(), // Será armazenado criptografado
      encryptedUser: z.string().optional(), // Versão criptografada
      encryptedPass: z.string().optional(), // Versão criptografada
    }).optional()
  })
});
```

### 2. Melhorias na Interface de Configuração

#### A. Adição de Botão de Teste de Conexão
**Arquivo**: [app/renderer/index.html](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/renderer/index.html)

Adicionar botão de teste na seção de e-mail:

```html
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
    <div class="form-group" style="margin: 0;">
        <label class="form-label">E-mail de Destino</label>
        <input type="email" id="cfgEmailRecipient" class="form-control"
            placeholder="receber-avisos@empresa.com">
    </div>
    <div style="display: flex; align-items: flex-end; gap: 8px;">
        <button class="btn btn-test" onclick="testSmtpConnection()" 
            style="height: 38px; padding: 0 15px;" title="Testar conexão SMTP">
            🔧 Testar
        </button>
        <button class="btn btn-send-test" onclick="sendTestEmail()" 
            style="height: 38px; padding: 0 15px;" title="Enviar e-mail de teste">
            ✉️ Testar
        </button>
    </div>
</div>
```

#### B. Implementação de Funções de Teste
**Arquivo**: [app/renderer/main.js](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/renderer/main.js)

Adicionar funções para testar conexão e enviar e-mail de teste:

```javascript
// Função para testar conexão SMTP
window.testSmtpConnection = async () => {
    try {
        Utils.showNotification('Testando conexão SMTP...', 'info');
        
        const config = await window.electronAPI.getConfig();
        const smtpConfig = config.notifications?.smtp || {};
        
        // Validação básica dos campos
        if (!smtpConfig.host || !smtpConfig.port || !smtpConfig.user || !smtpConfig.pass) {
            Utils.showNotification('Preencha todos os campos SMTP obrigatórios', 'error');
            return;
        }
        
        // Chama o backend para testar a conexão
        const result = await window.electronAPI.testSmtpConnection(smtpConfig);
        
        if (result.success) {
            Utils.showNotification('Conexão SMTP bem-sucedida!', 'success');
        } else {
            Utils.showNotification(`Falha na conexão: ${result.error}`, 'error');
        }
    } catch (error) {
        Utils.showNotification(`Erro ao testar conexão: ${error.message}`, 'error');
    }
};

// Função para enviar e-mail de teste
window.sendTestEmail = async () => {
    try {
        Utils.showNotification('Enviando e-mail de teste...', 'info');
        
        const config = await window.electronAPI.getConfig();
        const smtpConfig = config.notifications?.smtp || {};
        const recipient = document.getElementById('cfgEmailRecipient').value || smtpConfig.user;
        
        if (!recipient) {
            Utils.showNotification('Informe um destinatário para o e-mail de teste', 'error');
            return;
        }
        
        const result = await window.electronAPI.sendTestEmail({
            to: recipient,
            subject: 'E-mail de Teste - Automatizador Bravo',
            body: 'Este é um e-mail de teste enviado pelo Automatizador Bravo.'
        });
        
        if (result.success) {
            Utils.showNotification('E-mail de teste enviado com sucesso!', 'success');
        } else {
            Utils.showNotification(`Falha no envio: ${result.error}`, 'error');
        }
    } catch (error) {
        Utils.showNotification(`Erro ao enviar e-mail de teste: ${error.message}`, 'error');
    }
};
```

### 3. Melhorias no Serviço de Notificação

#### A. Implementação de Teste de Conexão
**Arquivo**: [app/core/notifications/NotificationService.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/core/notifications/NotificationService.ts)

Adicionar método para testar a conexão SMTP:

```typescript
/**
 * Testa a conexão SMTP com as configurações fornecidas
 */
async testConnection(smtpConfig?: any): Promise<{ success: boolean; error?: string }> {
    try {
        const config = smtpConfig || configManager.getConfig();
        const notificationConfig = config.notifications;
        
        if (!notificationConfig || !notificationConfig.smtp) {
            return { success: false, error: 'Configuração SMTP não encontrada' };
        }
        
        const smtp = notificationConfig.smtp;
        if (!smtp.host || !smtp.port || !smtp.user || !smtp.pass) {
            return { success: false, error: 'Configuração SMTP incompleta' };
        }
        
        // Criar transporte temporário para testar a conexão
        const transporter = nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            auth: {
                user: smtp.user,
                pass: smtp.pass,
            },
        });
        
        // Testar autenticação
        await transporter.verify();
        
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Envia e-mail de teste
 */
async sendTestEmail(options: { to: string; subject: string; body: string }): Promise<{ success: boolean; error?: string }> {
    try {
        const result = await this.sendEmail({
            to: options.to,
            subject: options.subject,
            text: options.body
        });
        
        return { success: result };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
```

### 4. Melhorias no Main Process (Electron)

#### A. Implementação de Handlers IPC
**Arquivo**: [app/electron/main.ts](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/electron/main.ts)

Adicionar handlers para testar conexão e enviar e-mail de teste:

```typescript
// Adicionar ao final da função registerIpcHandlers
ipcMain.handle('test-smtp-connection', async (event, smtpConfig) => {
  try {
    const result = await notificationService.testConnection(smtpConfig);
    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('send-test-email', async (event, emailOptions) => {
  try {
    const result = await notificationService.sendTestEmail(emailOptions);
    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
```

### 5. Melhorias na Validação de Formulário

#### A. Validação em Tempo Real
**Arquivo**: [app/renderer/main.js](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/renderer/main.js)

Adicionar validação em tempo real para os campos SMTP:

```javascript
// Adicionar eventos de validação em tempo real
document.getElementById('cfgSmtpHost').addEventListener('blur', validateSmtpHost);
document.getElementById('cfgSmtpPort').addEventListener('blur', validateSmtpPort);
document.getElementById('cfgSmtpUser').addEventListener('blur', validateSmtpUser);
document.getElementById('cfgSmtpPass').addEventListener('blur', validateSmtpPass);

function validateSmtpHost() {
    const host = document.getElementById('cfgSmtpHost').value;
    const isValid = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9](\.[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9])*$/g.test(host);
    
    if (!isValid && host) {
        Utils.showNotification('Host SMTP inválido', 'error');
    }
}

function validateSmtpPort() {
    const port = parseInt(document.getElementById('cfgSmtpPort').value);
    const isValid = port >= 1 && port <= 65535;
    
    if (!isValid && port) {
        Utils.showNotification('Porta SMTP inválida (1-65535)', 'error');
    }
}

function validateSmtpUser() {
    const user = document.getElementById('cfgSmtpUser').value;
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user);
    
    if (!isValid && user) {
        Utils.showNotification('Formato de e-mail inválido', 'error');
    }
}

function validateSmtpPass() {
    const pass = document.getElementById('cfgSmtpPass').value;
    // Validar apenas se o campo não estiver vazio (pode estar oculto após criptografia)
}
```

### 6. Melhorias no Feedback ao Usuário

#### A. Indicadores Visuais de Status
**Arquivo**: [app/renderer/index.html](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/renderer/index.html)

Adicionar indicadores de status para as configurações de e-mail:

```html
<!-- Adicionar após o checkbox de e-mail habilitado -->
<div id="smtp-status-indicator" style="margin-top: 8px; padding: 8px; border-radius: 4px; display: none;">
    <div style="display: flex; align-items: center; gap: 8px;">
        <span id="smtp-status-icon">⏳</span>
        <span id="smtp-status-text">Verificando configuração...</span>
    </div>
</div>
```

#### B. Atualização da UI com Status
**Arquivo**: [app/renderer/modules/ui.js](file:///c:/Users/Robson-PC/.antigravity/projetos/automatizador-bravo/app/renderer/modules/ui.js)

Adicionar função para atualizar o status visual:

```javascript
// Adicionar ao objeto UI
updateSmtpStatus(status: 'valid' | 'invalid' | 'checking', message: string) {
    const indicator = document.getElementById('smtp-status-indicator');
    const icon = document.getElementById('smtp-status-icon');
    const text = document.getElementById('smtp-status-text');
    
    if (!indicator || !icon || !text) return;
    
    switch (status) {
        case 'valid':
            indicator.style.display = 'block';
            indicator.style.background = '#e8f5e9';
            indicator.style.border = '1px solid #4caf50';
            icon.textContent = '✅';
            text.textContent = message;
            break;
        case 'invalid':
            indicator.style.display = 'block';
            indicator.style.background = '#ffebee';
            indicator.style.border = '1px solid #f44336';
            icon.textContent = '❌';
            text.textContent = message;
            break;
        case 'checking':
            indicator.style.display = 'block';
            indicator.style.background = '#fff3e0';
            indicator.style.border = '1px solid #ff9800';
            icon.textContent = '⏳';
            text.textContent = message;
            break;
        default:
            indicator.style.display = 'none';
    }
}
```

## Implementação Recomendada

1. **Primeiramente**, implementar as melhorias de segurança com criptografia de credenciais
2. **Em seguida**, adicionar as funções de teste de conexão e e-mail de teste
3. **Depois**, atualizar a interface para incluir os botões e validações
4. **Finalmente**, adicionar os indicadores visuais de status e feedback ao usuário

Essas melhorias tornarão o sistema mais seguro, confiável e amigável para o usuário, com validação adequada e feedback claro sobre o status das configurações de e-mail.