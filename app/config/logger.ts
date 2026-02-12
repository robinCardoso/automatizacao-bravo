import winston from 'winston';
import 'winston-daily-rotate-file';
import * as path from 'path';
import { AppPaths } from '../core/utils/AppPaths';

// Lazy init: criar pasta de logs após todos os módulos carregarem (evita "Cannot access 'fs' before initialization" no .exe empacotado)
const logsDir = AppPaths.getLogsPath();
setImmediate(() => {
  const fs = require('fs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
});

// Configuração do logger principal
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      if (stack) {
        return `${timestamp} [${level.toUpperCase()}]: ${message}\n${stack}`;
      }
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  defaultMeta: { service: 'automatizador-bravo' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),

    // Arquivo de erro com rotação
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '7d',
      level: 'error'
    }),

    // Arquivo geral com rotação
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

// Logger específico para automação
export const automationLogger = winston.createLogger({
  level: process.env.AUTOMATION_LOG_LEVEL || 'debug',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [AUTOMATION-${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, 'automation-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '7d'
    })
  ]
});

// Logger específico para sessões
export const sessionLogger = winston.createLogger({
  level: process.env.SESSION_LOG_LEVEL || 'debug',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [SESSION-${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, 'sessions.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ]
});

export default logger;