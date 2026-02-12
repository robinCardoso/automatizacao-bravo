import nodemailer from 'nodemailer';
import { AppConfig, configManager } from '../../config/config-manager';
import { automationLogger } from '../../config/logger';

export interface EmailOptions {
    to?: string;
    subject: string;
    text?: string;
    html?: string;
    attachments?: any[];
}

export class NotificationService {
    private static instance: NotificationService;

    private constructor() { }

    public static getInstance(): NotificationService {
        if (!NotificationService.instance) {
            NotificationService.instance = new NotificationService();
        }
        return NotificationService.instance;
    }

    /**
     * Tenta enviar um e-mail com sistema de fallback e re-tentativas
     */
    async sendEmail(options: EmailOptions, smtpOverride?: any): Promise<boolean> {
        const config = configManager.getConfig();
        const notificationConfig = config.notifications;

        const isTest = !!smtpOverride;
        if (!isTest && (!notificationConfig || !notificationConfig.enabled)) {
            automationLogger.debug('[Notification] Notificação desabilitada.');
            return false;
        }

        // 1. Tentar com SMTP Primário (ou override)
        const primarySmtp = smtpOverride || notificationConfig?.smtp;
        let success = await this.sendEmailWithRetries(options, primarySmtp, notificationConfig.retryAttempts);

        // 2. Fallback para SMTP Secundário se o primário falhar e não for um teste
        if (!success && !isTest && notificationConfig.fallbackSmtp) {
            automationLogger.warn('[Notification] SMTP Primário falhou. Tentando Fallback...');
            success = await this.sendEmailWithRetries(options, notificationConfig.fallbackSmtp, 1);
        }

        return success;
    }

    /**
     * Envia e-mail com lógica de re-tentativa (Exponential Backoff)
     */
    private async sendEmailWithRetries(options: EmailOptions, smtp: any, maxAttempts: number): Promise<boolean> {
        if (!smtp || (!smtp.user && smtp.authType !== 'oauth2')) return false;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const transporterConfig: any = {
                    host: smtp.host,
                    port: smtp.port,
                    secure: smtp.secure,
                };

                // Suporte a OAuth2 ou Login Tradicional
                if (smtp.authType === 'oauth2') {
                    transporterConfig.auth = {
                        type: 'OAuth2',
                        user: smtp.user,
                        clientId: smtp.clientId,
                        clientSecret: smtp.clientSecret,
                        refreshToken: smtp.refreshToken
                    };
                } else {
                    transporterConfig.auth = {
                        user: smtp.user,
                        pass: smtp.pass,
                    };
                }

                const transporter = nodemailer.createTransport(transporterConfig);

                const mailOptions = {
                    from: `"Automatizador Bravo" <${smtp.user}>`,
                    to: options.to || configManager.getConfig().notifications?.recipient,
                    subject: `🤖 BRAVO | ${options.subject}`,
                    text: options.text,
                    html: options.html,
                    attachments: options.attachments,
                };

                await transporter.sendMail(mailOptions);
                automationLogger.info(`[Notification] E-mail enviado com sucesso na tentativa ${attempt}`);
                return true;
            } catch (error: any) {
                automationLogger.error(`[Notification] Erro na tentativa ${attempt}/${maxAttempts}: ${error.message}`);

                if (attempt < maxAttempts) {
                    const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        return false;
    }

    /**
     * Testa a conexão SMTP com as configurações fornecidas
     */
    async testConnection(smtpConfig?: any): Promise<{ success: boolean; error?: string }> {
        try {
            const config = configManager.getConfig();
            const smtp = smtpConfig || config.notifications?.smtp;

            if (!smtp || !smtp.host) {
                return { success: false, error: 'Configuração SMTP incompleta' };
            }

            automationLogger.info(`[Notification] Testando conexão SMTP via ${smtp.host}:${smtp.port}`);

            const transporterConfig: any = {
                host: smtp.host,
                port: smtp.port,
                secure: smtp.secure,
            };

            if (smtp.authType === 'oauth2') {
                transporterConfig.auth = {
                    type: 'OAuth2',
                    user: smtp.user,
                    clientId: smtp.clientId,
                    clientSecret: smtp.clientSecret,
                    refreshToken: smtp.refreshToken
                };
            } else {
                transporterConfig.auth = {
                    user: smtp.user,
                    pass: smtp.pass,
                };
            }

            const transporter = nodemailer.createTransport(transporterConfig);
            await transporter.verify();

            return { success: true };
        } catch (error: any) {
            automationLogger.error(`[Notification] Erro no teste de conexão: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Envia e-mail de teste
     */
    async sendTestEmail(options: { to: string; subject: string; body: string }, smtpConfig?: any): Promise<{ success: boolean; error?: string }> {
        try {
            const recipient = options.to || (smtpConfig ? smtpConfig.user : null);

            automationLogger.info(`[Notification] Enviando e-mail de teste para ${recipient}`);

            const success = await this.sendEmail({
                to: recipient,
                subject: options.subject,
                text: options.body
            }, smtpConfig);

            if (success) {
                return { success: true };
            } else {
                return { success: false, error: 'Falha ao enviar e-mail. Verifique os logs para mais detalhes.' };
            }
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Envia resumo de execução do Preset com template PROFISSIONAL
     */
    async sendAutomationSummary(presetName: string, results: any[]): Promise<void> {
        const config = configManager.getConfig();
        const total = results.length;
        const successCount = results.filter(r => r.success).length;
        const errorCount = total - successCount;
        const totalDurationMs = results.reduce((acc, r) => acc + (r.duration || 0), 0);
        const durationStr = (totalDurationMs / 1000 / 60).toFixed(1) + ' min';

        const dateStr = new Date().toLocaleString('pt-BR');
        const statusColor = errorCount === 0 ? '#48c774' : '#f14668';
        const statusLabel = errorCount === 0 ? 'SUCESSO TOTAL' : `CONCLUÍDO COM ${errorCount} ERROS`;

        const html = `
<!DOCTYPE html>
<html>
<body style="font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f7f9; color: #333;">
    <div style="max-width: 700px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05); border-top: 6px solid #2c3e50;">
        
        <!-- HEADER -->
        <div style="padding: 30px; background: #2c3e50; color: white;">
            <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">Automatizador Bravo</div>
            <div style="font-size: 14px; opacity: 0.8;">Relatório de Execução do Sistema</div>
        </div>

        <!-- SUMMARY CARD -->
        <div style="padding: 30px;">
            <div style="display: flex; align-items: center; margin-bottom: 25px;">
                <div style="background: ${statusColor}; color: white; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 13px;">
                    ${statusLabel}
                </div>
                <div style="margin-left: auto; color: #7f8c8d; font-size: 13px;">
                    ${dateStr}
                </div>
            </div>

            <div style="font-size: 18px; color: #2c3e50; font-weight: 600; margin-bottom: 20px;">
                Resumo do Preset: <span style="color: #3498db;">${presetName}</span>
            </div>

            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <tr>
                    <td style="padding: 15px; background: #f8f9fa; border-radius: 8px 0 0 8px; width: 33%; text-align: center; border-right: 1px solid #eee;">
                        <div style="font-size: 12px; color: #95a5a6; text-transform: uppercase;">Total de Sites</div>
                        <div style="font-size: 22px; font-weight: bold; color: #2c3e50;">${total}</div>
                    </td>
                    <td style="padding: 15px; background: #f8f9fa; width: 33%; text-align: center; border-right: 1px solid #eee;">
                        <div style="font-size: 12px; color: #48c774; text-transform: uppercase;">Sucessos</div>
                        <div style="font-size: 22px; font-weight: bold; color: #48c774;">${successCount}</div>
                    </td>
                    <td style="padding: 15px; background: #f8f9fa; border-radius: 0 8px 8px 0; width: 33%; text-align: center;">
                        <div style="font-size: 12px; color: #95a5a6; text-transform: uppercase;">Duração Total</div>
                        <div style="font-size: 22px; font-weight: bold; color: #2c3e50;">${durationStr}</div>
                    </td>
                </tr>
            </table>

            <!-- TABLE -->
            <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px; color: #2c3e50;">Detalhes por Site</div>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="border-bottom: 2px solid #eee;">
                        <th style="padding: 12px 8px; text-align: left; color: #7f8c8d;">UF / Site</th>
                        <th style="padding: 12px 8px; text-align: center; color: #7f8c8d;">Status</th>
                        <th style="padding: 12px 8px; text-align: left; color: #7f8c8d;">Observação</th>
                    </tr>
                </thead>
                <tbody>
                    ${results.map(r => `
                        <tr style="border-bottom: 1px solid #f9f9f9;">
                            <td style="padding: 12px 8px;">
                                <div style="font-weight: 600;">${r.siteName}</div>
                                <div style="font-size: 11px; color: #95a5a6;">${r.sspResult?.uf || 'XX'}</div>
                            </td>
                            <td style="padding: 12px 8px; text-align: center;">
                                <span style="padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: bold; background: ${r.success ? '#e8f5e9' : '#ffebee'}; color: ${r.success ? '#1e4620' : '#c62828'};">
                                    ${r.success ? 'OK' : 'FALHA'}
                                </span>
                            </td>
                            <td style="padding: 12px 8px; color: ${r.success ? '#7f8c8d' : '#e74c3c'};">
                                ${r.success ? (r.sspResult ? `+${r.sspResult.added} / -${r.sspResult.removed}` : 'Processado') : r.errorMessage}
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <!-- LOGO / FOOTER -->
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
                <div style="font-size: 11px; color: #bdc3c7;">
                    Este é um relatório automático gerado pelo Automatizador Bravo.<br>
                    Para suporte técnico, contate a administração do sistema.
                </div>
            </div>
        </div>
    </div>
</body>
</html>
        `;

        await this.sendEmail({
            subject: `Resumo: ${presetName} (${successCount}/${total})`,
            html: html
        });
    }
}

export const notificationService = NotificationService.getInstance();
