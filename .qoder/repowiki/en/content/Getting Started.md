# Getting Started

<cite>
**Referenced Files in This Document**
- [package.json](file://package.json)
- [tsconfig.json](file://tsconfig.json)
- [README](file://README)
- [COMO_GERAR_INSTALAVEL.md](file://COMO_GERAR_INSTALAVEL.md)
- [app/electron/main.ts](file://app/electron/main.ts)
- [app/renderer/index.html](file://app/renderer/index.html)
- [app/renderer/main.js](file://app/renderer/main.js)
- [app/config/config-manager.ts](file://app/config/config-manager.ts)
- [app/config/app-config.json](file://app/config/app-config.json)
- [app/core/utils/AppPaths.ts](file://app/core/utils/AppPaths.ts)
- [app/automation/engine/automation-engine.ts](file://app/automation/engine/automation-engine.ts)
- [app/automation/engine/preset-repository.ts](file://app/automation/engine/preset-repository.ts)
- [app/automation/sessions/session-manager.ts](file://app/automation/sessions/session-manager.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [System Requirements](#system-requirements)
3. [Installation Procedures](#installation-procedures)
4. [Development Environment Setup](#development-environment-setup)
5. [Initial Configuration Steps](#initial-configuration-steps)
6. [First-Time Usage Tutorial](#first-time-usage-tutorial)
7. [Build Process for Installers](#build-process-for-installers)
8. [Troubleshooting Common Setup Issues](#troubleshooting-common-setup-issues)
9. [Basic Project Structure Navigation](#basic-project-structure-navigation)
10. [Performance Considerations](#performance-considerations)
11. [Troubleshooting Guide](#troubleshooting-guide)
12. [Conclusion](#conclusion)

## Introduction
Automatizador Bravo is a corporate-grade web automation desktop application built with Electron and Playwright. It enables automated data extraction from ERP systems across multiple Brazilian states, featuring a modern UI, session management, scheduling, and enterprise-safe snapshot policies for data integrity auditing.

## System Requirements
- Operating System: Windows 10/11 (64-bit)
- Minimum RAM: 4 GB
- Disk Space: ~500 MB free (installer size ~250–350 MB depending on runtime dependencies)
- Execution Level: asInvoker (no admin privileges required)
- Node.js: 18.x or later (recommended)
- npm: latest LTS

[No sources needed since this section provides general guidance]

## Installation Procedures
- Download the installer from the release folder generated during the build process.
- Run the installer with default settings; it creates desktop and Start Menu shortcuts and sets up auto-start.
- After installation, launch the application from the Start Menu or Desktop shortcut.
- The application stores configuration and data under the user profile directory.

**Section sources**
- [COMO_GERAR_INSTALAVEL.md](file://COMO_GERAR_INSTALAVEL.md#L67-L72)

## Development Environment Setup
- Prerequisites
  - Install Node.js and npm (18.x or later).
  - Ensure PowerShell is available for scripts.
- Clone or copy the repository locally.
- Install dependencies:
  - Run: `npm install`
- Build the project:
  - Run: `npm run build`
- Start in development mode:
  - Run: `npm run dev`
- Watch mode for live compilation:
  - Run: `npm run watch`

Notes:
- TypeScript configuration targets ES2020 with CommonJS modules.
- The Electron main process runs from `dist/electron/main.js`.

**Section sources**
- [package.json](file://package.json#L7-L17)
- [tsconfig.json](file://tsconfig.json#L1-L24)
- [README](file://README#L1-L29)

## Initial Configuration Steps
- Launch the application.
- Open the configuration modal from the top-right actions.
- Configure general settings:
  - Headless mode (visible/invisible automation).
  - Action delay, retries, and timeouts.
  - Email notifications (SMTP) for automation summaries.
- Create or import presets:
  - Presets group related sites and workflows.
  - Each preset holds login credentials and destination folders.
- Add sites and define workflows:
  - Map selectors for login fields and actions.
  - Define step sequences (hover, click, fill, download).
  - Optionally enable snapshot-based auditing with primary keys.
- Save configuration and test connectivity.

Key locations:
- Configuration is stored under the user profile directory.
- Paths are managed by the application’s path utilities.

**Section sources**
- [app/renderer/index.html](file://app/renderer/index.html#L180-L591)
- [app/config/config-manager.ts](file://app/config/config-manager.ts#L58-L78)
- [app/core/utils/AppPaths.ts](file://app/core/utils/AppPaths.ts#L11-L17)

## First-Time Usage Tutorial
- Select a preset from the main controls.
- Click “START” to initiate automation.
- Monitor progress in the console panel and audit table.
- Use the “STOP” button to halt execution.
- Manage sessions via the “SESSIONS” action if needed.
- Review logs and export them using the footer action.

UI entry points:
- Main controls card for preset selection and actions.
- Audit table for per-site results and status.
- Console panel for real-time logs and workflow overlay.

**Section sources**
- [app/renderer/index.html](file://app/renderer/index.html#L80-L159)
- [app/renderer/main.js](file://app/renderer/main.js#L72-L94)

## Build Process for Installers
- Prerequisites:
  - Ensure TypeScript is compiled: `npm run build`
  - Verify icon exists: `build/icon.ico`
- Generate installer:
  - Single-command: `npm run dist`
  - Alternative scripts:
    - `npm run dist:dir` (without compression)
    - `npm run dist:portable` (zip portable)
    - `npm run pack` (executable without installer)
- Output:
  - Installer: `release/Automatizador Bravo Setup 1.0.0.exe`
  - Unpacked: `release/win-unpacked/`
- Auto-start behavior:
  - Enabled automatically on first run; can be toggled in settings.

**Section sources**
- [COMO_GERAR_INSTALAVEL.md](file://COMO_GERAR_INSTALAVEL.md#L1-L257)
- [package.json](file://package.json#L13-L17)

## Troubleshooting Common Setup Issues
- Icon missing during build:
  - Ensure `build/icon.ico` exists before running `npm run dist`.
- Module not found errors:
  - Reinstall dependencies: `Remove-Item -Recurse -Force node_modules; npm install; npm run dist`
- Installer does not start:
  - Temporarily disable antivirus or add an exception.
- Application fails to open after install:
  - Check logs in the user profile logs directory.
- File locked or EPERM during build:
  - Close the app, then rerun the build command.

**Section sources**
- [COMO_GERAR_INSTALAVEL.md](file://COMO_GERAR_INSTALAVEL.md#L170-L191)

## Basic Project Structure Navigation
- Electron main process:
  - Entry: `app/electron/main.ts`
  - Initializes BrowserWindow, Tray, IPC handlers, and scheduler.
- Renderer UI:
  - Entry: `app/renderer/index.html`
  - Modular JavaScript: `app/renderer/main.js` and modules under `app/renderer/modules/`
- Configuration:
  - `app/config/config-manager.ts`: Zod-based validation and migration logic.
  - `app/config/app-config.json`: Default configuration template.
- Automation engine:
  - `app/automation/engine/automation-engine.ts`: Orchestrates Playwright sessions and steps.
  - `app/automation/engine/preset-repository.ts`: CRUD for presets.
  - `app/automation/sessions/session-manager.ts`: Manages persistent browser contexts.
- Paths and persistence:
  - `app/core/utils/AppPaths.ts`: Ensures directories under user profile.

**Section sources**
- [app/electron/main.ts](file://app/electron/main.ts#L1-L387)
- [app/renderer/index.html](file://app/renderer/index.html#L1-L640)
- [app/renderer/main.js](file://app/renderer/main.js#L1-L182)
- [app/config/config-manager.ts](file://app/config/config-manager.ts#L1-L408)
- [app/config/app-config.json](file://app/config/app-config.json#L1-L1521)
- [app/automation/engine/automation-engine.ts](file://app/automation/engine/automation-engine.ts#L1-L611)
- [app/automation/engine/preset-repository.ts](file://app/automation/engine/preset-repository.ts#L1-L34)
- [app/automation/sessions/session-manager.ts](file://app/automation/sessions/session-manager.ts#L1-L225)
- [app/core/utils/AppPaths.ts](file://app/core/utils/AppPaths.ts#L1-L60)

## Performance Considerations
- Headless mode reduces resource usage; enable for scheduled runs.
- Adjust action delay and retry counts based on network conditions.
- Use snapshot-based auditing selectively to minimize unnecessary processing.
- Monitor memory usage; the application includes a watchdog that logs memory health.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Build failures:
  - Clean cache and rebuild: remove `release` and `dist/node_modules`, then `npm run build && npm run dist`.
- Session issues:
  - Clear sessions via the sessions modal or CLI scripts.
- Logging:
  - Logs are written to the user profile logs directory; review for automation errors.
- Auto-start problems:
  - Toggle auto-start in settings or via Windows Startup settings.

**Section sources**
- [COMO_GERAR_INSTALAVEL.md](file://COMO_GERAR_INSTALAVEL.md#L113-L120)
- [app/automation/sessions/session-manager.ts](file://app/automation/sessions/session-manager.ts#L188-L200)

## Conclusion
You are now ready to develop, configure, and run Automatizador Bravo. Start with setting up the development environment, create your first preset and site, and then build and deploy the installer. Use the troubleshooting guide for common issues and adjust performance settings for your environment.

[No sources needed since this section summarizes without analyzing specific files]