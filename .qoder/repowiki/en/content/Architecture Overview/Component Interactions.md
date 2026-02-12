# Component Interactions

<cite>
**Referenced Files in This Document**
- [main.ts](file://app/electron/main.ts)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts)
- [scheduler-service.ts](file://app/automation/engine/scheduler-service.ts)
- [session-manager.ts](file://app/automation/sessions/session-manager.ts)
- [login-handler.ts](file://app/automation/sessions/login-handler.ts)
- [step-executor.ts](file://app/automation/engine/step-executor.ts)
- [selector-resolver.ts](file://app/automation/engine/selector-resolver.ts)
- [DiffEngine.ts](file://app/core/diff/DiffEngine.ts)
- [Consolidator.ts](file://app/core/consolidation/Consolidator.ts)
- [config-manager.ts](file://app/config/config-manager.ts)
- [NotificationService.ts](file://app/core/notifications/NotificationService.ts)
- [main.js](file://app/renderer/main.js)
- [index.html](file://app/renderer/index.html)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts)
- [SnapshotContract.ts](file://app/policy/snapshot/SnapshotContract.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document explains how the system coordinates automation across layers, how configuration changes propagate, and how components interact to deliver reliable browser automation with snapshot auditing. It focuses on:
- How the main process coordinates with automation services
- How configuration changes propagate through the system
- How the preset repository orchestrates workflow execution
- How the session manager integrates with browser automation
- How the diff engine relates to snapshot policies
- Observer pattern implementation for real-time UI updates and status reporting
- Typical automation workflows, error propagation, and state synchronization

## Project Structure
The system is organized into distinct layers:
- Electron main process: IPC handlers, tray, scheduling, and lifecycle
- Automation engine: orchestration, session management, step execution, and progress emission
- Policies and snapshot engine: safe snapshot policy and diff engine
- Consolidation: master snapshot aggregation
- Renderer: UI, state, and real-time updates via Electron IPC

```mermaid
graph TB
subgraph "Electron Main"
MAIN["main.ts"]
SCH["scheduler-service.ts"]
end
subgraph "Automation Layer"
AE["automation-engine.ts"]
PM["preset-repository.ts"]
SM["session-manager.ts"]
LH["login-handler.ts"]
SE["step-executor.ts"]
SR["selector-resolver.ts"]
end
subgraph "Policies & Snapshot"
SSP["SafeSnapshotPolicy.ts"]
DE["DiffEngine.ts"]
end
subgraph "Consolidation"
CONS["Consolidator.ts"]
end
subgraph "Config & Notifications"
CM["config-manager.ts"]
NS["NotificationService.ts"]
end
subgraph "Renderer"
RMAIN["main.js"]
UI["index.html"]
end
MAIN --> AE
MAIN --> SCH
AE --> SM
AE --> LH
AE --> SE
SE --> SR
AE --> PM
AE --> CONS
AE --> NS
SE --> DE
DE --> SSP
MAIN --> CM
RMAIN --> MAIN
UI --> RMAIN
```

**Diagram sources**
- [main.ts](file://app/electron/main.ts#L1-L387)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L1-L611)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L1-L34)
- [scheduler-service.ts](file://app/automation/engine/scheduler-service.ts#L1-L145)
- [session-manager.ts](file://app/automation/sessions/session-manager.ts#L1-L225)
- [login-handler.ts](file://app/automation/sessions/login-handler.ts#L1-L364)
- [step-executor.ts](file://app/automation/engine/step-executor.ts#L1-L549)
- [selector-resolver.ts](file://app/automation/engine/selector-resolver.ts#L1-L135)
- [DiffEngine.ts](file://app/core/diff/DiffEngine.ts#L1-L230)
- [Consolidator.ts](file://app/core/consolidation/Consolidator.ts#L1-L138)
- [config-manager.ts](file://app/config/config-manager.ts#L1-L408)
- [NotificationService.ts](file://app/core/notifications/NotificationService.ts#L1-L115)
- [main.js](file://app/renderer/main.js#L1-L182)
- [index.html](file://app/renderer/index.html#L1-L640)

**Section sources**
- [main.ts](file://app/electron/main.ts#L1-L387)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L1-L611)
- [scheduler-service.ts](file://app/automation/engine/scheduler-service.ts#L1-L145)
- [session-manager.ts](file://app/automation/sessions/session-manager.ts#L1-L225)
- [login-handler.ts](file://app/automation/sessions/login-handler.ts#L1-L364)
- [step-executor.ts](file://app/automation/engine/step-executor.ts#L1-L549)
- [selector-resolver.ts](file://app/automation/engine/selector-resolver.ts#L1-L135)
- [DiffEngine.ts](file://app/core/diff/DiffEngine.ts#L1-L230)
- [Consolidator.ts](file://app/core/consolidation/Consolidator.ts#L1-L138)
- [config-manager.ts](file://app/config/config-manager.ts#L1-L408)
- [NotificationService.ts](file://app/core/notifications/NotificationService.ts#L1-L115)
- [main.js](file://app/renderer/main.js#L1-L182)
- [index.html](file://app/renderer/index.html#L1-L640)

## Core Components
- Electron main process: registers IPC handlers, starts scheduler, manages tray, and routes UI commands to automation services.
- Automation engine: runs presets, manages sessions, executes steps, emits progress, and consolidates results.
- Preset repository: CRUD for presets and marks usage.
- Session manager: persistent browser contexts per site, profile migration, and lifecycle control.
- Login handler: automated login, captcha detection, manual intervention, and reauthentication.
- Step executor: executes workflow steps, supports SSP-aware downloads and diff processing.
- Selector resolver: robust element resolution with retries and visibility checks.
- Diff engine: reads previous/current snapshots, computes diffs, and writes consolidated files.
- Consolidator: merges multiple snapshot outputs into master files.
- Config manager: validates and persists configuration, presets, and site definitions.
- Notification service: optional email summaries after automation completion.
- Renderer: modular UI, real-time status updates, and user-driven actions.

**Section sources**
- [main.ts](file://app/electron/main.ts#L117-L281)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L50-L608)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L4-L32)
- [session-manager.ts](file://app/automation/sessions/session-manager.ts#L67-L223)
- [login-handler.ts](file://app/automation/sessions/login-handler.ts#L13-L364)
- [step-executor.ts](file://app/automation/engine/step-executor.ts#L25-L549)
- [selector-resolver.ts](file://app/automation/engine/selector-resolver.ts#L4-L135)
- [DiffEngine.ts](file://app/core/diff/DiffEngine.ts#L23-L230)
- [Consolidator.ts](file://app/core/consolidation/Consolidator.ts#L20-L138)
- [config-manager.ts](file://app/config/config-manager.ts#L85-L398)
- [NotificationService.ts](file://app/core/notifications/NotificationService.ts#L13-L115)
- [main.js](file://app/renderer/main.js#L1-L182)
- [index.html](file://app/renderer/index.html#L1-L640)

## Architecture Overview
The main process acts as the central coordinator:
- Receives UI actions and configuration requests via IPC
- Starts/stops automation and schedules periodic runs
- Manages browser sessions and exposes session management APIs
- Emits progress and completion events consumed by the renderer

```mermaid
sequenceDiagram
participant UI as "Renderer UI<br/>index.html"
participant R as "Renderer Bridge<br/>main.js"
participant M as "Electron Main<br/>main.ts"
participant SCH as "Scheduler<br/>scheduler-service.ts"
participant AE as "Automation Engine<br/>automation-engine.ts"
participant SM as "Session Manager<br/>session-manager.ts"
participant LH as "Login Handler<br/>login-handler.ts"
participant SE as "Step Executor<br/>step-executor.ts"
UI->>R : User clicks "Start"
R->>M : ipcRenderer.invoke("start-automation")
M->>AE : runAutomation({presetId})
AE->>SM : getSession(siteId, headless)
AE->>LH : performLogin(site, context, headless)
AE->>SE : executeSteps(site.steps)
SE-->>AE : progress events
AE-->>M : automation-progress
M-->>R : webContents.send("automation-progress")
R-->>UI : update progress UI
AE-->>M : automation-complete/error
M-->>R : webContents.send(...)
R-->>UI : finalize UI state
SCH->>AE : runAutomation(preset) (scheduled)
```

**Diagram sources**
- [main.ts](file://app/electron/main.ts#L214-L241)
- [scheduler-service.ts](file://app/automation/engine/scheduler-service.ts#L38-L96)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L62-L238)
- [session-manager.ts](file://app/automation/sessions/session-manager.ts#L103-L138)
- [login-handler.ts](file://app/automation/sessions/login-handler.ts#L28-L77)
- [step-executor.ts](file://app/automation/engine/step-executor.ts#L59-L110)
- [main.js](file://app/renderer/main.js#L151-L172)

**Section sources**
- [main.ts](file://app/electron/main.ts#L117-L281)
- [scheduler-service.ts](file://app/automation/engine/scheduler-service.ts#L16-L96)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L62-L238)
- [main.js](file://app/renderer/main.js#L151-L172)

## Detailed Component Analysis

### Main Process Coordination
- IPC handlers expose configuration, presets, sessions, and automation control to the renderer.
- SchedulerService periodically triggers automation runs for enabled presets.
- Tray and watchdog support long-running operation health.

```mermaid
flowchart TD
A["IPC Request<br/>get-config/save-config"] --> B["ConfigManager<br/>config-manager.ts"]
C["IPC Request<br/>start-automation"] --> D["AutomationEngine.runAutomation"]
E["IPC Request<br/>get-session-status"] --> F["SessionManager.getSessionStatus"]
G["IPC Request<br/>open-browser-for-login"] --> H["AutomationEngine.openBrowserForLogin"]
I["SchedulerService"] --> J["runAutomation(presetId)"]
```

**Diagram sources**
- [main.ts](file://app/electron/main.ts#L119-L281)
- [config-manager.ts](file://app/config/config-manager.ts#L192-L212)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L478-L515)
- [session-manager.ts](file://app/automation/sessions/session-manager.ts#L205-L214)
- [scheduler-service.ts](file://app/automation/engine/scheduler-service.ts#L76-L81)

**Section sources**
- [main.ts](file://app/electron/main.ts#L117-L281)
- [scheduler-service.ts](file://app/automation/engine/scheduler-service.ts#L16-L96)

### Preset Repository Orchestration
- Provides CRUD for presets and marks last-used timestamps.
- Used by AutomationEngine to fetch preset sites and credentials.

```mermaid
classDiagram
class PresetRepository {
+getAll() Preset[]
+getById(id) Preset
+create(preset) Preset
+update(id, preset)
+delete(id)
+markAsUsed(id)
}
class AutomationEngine {
+runAutomation(options)
}
class ConfigManager {
+getPresets() Preset[]
}
PresetRepository --> ConfigManager : "delegates"
AutomationEngine --> PresetRepository : "queries"
```

**Diagram sources**
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L4-L32)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L92-L94)
- [config-manager.ts](file://app/config/config-manager.ts#L216-L218)

**Section sources**
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L4-L32)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L92-L94)

### Session Manager Integration
- Ensures Playwright browsers are installed, manages persistent contexts per site, and migrates profiles.
- Provides close, clear, and status APIs.

```mermaid
sequenceDiagram
participant AE as "AutomationEngine"
participant SM as "SessionManager"
AE->>SM : getSession(siteId, headless)
SM-->>AE : BrowserContext (persistent)
AE->>AE : navigate, login, execute steps
AE->>SM : closeSession(siteId) / closeActiveSessions()
```

**Diagram sources**
- [session-manager.ts](file://app/automation/sessions/session-manager.ts#L103-L138)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L290-L294)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L193-L194)

**Section sources**
- [session-manager.ts](file://app/automation/sessions/session-manager.ts#L67-L223)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L290-L294)

### Login Handler and Reauthentication
- Attempts automated login, detects CAPTCHA, and supports manual login with a timeout.
- Reauthenticates when session expires during automation.

```mermaid
flowchart TD
A["performLogin(site, context, headless)"] --> B{"Already logged in?"}
B --> |Yes| C["Success"]
B --> |No| D["Attempt auto-login"]
D --> E{"Login success?"}
E --> |Yes| C
E --> |No| F{"Captcha detected?"}
F --> |Yes| G{"Headless?"}
G --> |Yes| H["Error: CAPTCHA in headless"]
G --> |No| I["Manual login with timeout"]
F --> |No| J["Failure"]
```

**Diagram sources**
- [login-handler.ts](file://app/automation/sessions/login-handler.ts#L28-L77)
- [login-handler.ts](file://app/automation/sessions/login-handler.ts#L108-L151)
- [login-handler.ts](file://app/automation/sessions/login-handler.ts#L187-L209)
- [login-handler.ts](file://app/automation/sessions/login-handler.ts#L214-L246)

**Section sources**
- [login-handler.ts](file://app/automation/sessions/login-handler.ts#L28-L77)
- [login-handler.ts](file://app/automation/sessions/login-handler.ts#L288-L360)

### Step Execution and Snapshot Diff
- Executes steps with retries and delays; handles downloads with SSP-aware logic.
- Uses DiffEngine to compare new downloads against previous snapshots and write consolidated outputs.

```mermaid
sequenceDiagram
participant SE as "StepExecutor"
participant DE as "DiffEngine"
participant AE as "AutomationEngine"
SE->>SE : executeStep(download)
SE->>DE : run(siteId, identity, tempPath, base, keys)
DE-->>SE : DiffResult
SE-->>AE : lastDiffResult + currentPeriod
AE->>AE : consolidate(results, destination)
```

**Diagram sources**
- [step-executor.ts](file://app/automation/engine/step-executor.ts#L397-L511)
- [DiffEngine.ts](file://app/core/diff/DiffEngine.ts#L55-L219)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L197-L214)
- [Consolidator.ts](file://app/core/consolidation/Consolidator.ts#L26-L63)

**Section sources**
- [step-executor.ts](file://app/automation/engine/step-executor.ts#L397-L511)
- [DiffEngine.ts](file://app/core/diff/DiffEngine.ts#L23-L230)
- [Consolidator.ts](file://app/core/consolidation/Consolidator.ts#L20-L138)

### Configuration Propagation
- Renderer loads/saves configuration via IPC; ConfigManager validates and persists.
- Changes trigger UI updates and can enable/disable scheduler globally.

```mermaid
sequenceDiagram
participant UI as "Renderer UI"
participant R as "Renderer Bridge"
participant M as "Electron Main"
participant CM as "ConfigManager"
UI->>R : saveConfig()
R->>M : ipcRenderer.invoke("save-config", config)
M->>CM : saveConfig(config)
CM-->>M : success
M-->>R : {success : true}
R-->>UI : showNotification
```

**Diagram sources**
- [main.js](file://app/renderer/main.js#L97-L135)
- [main.ts](file://app/electron/main.ts#L123-L126)
- [config-manager.ts](file://app/config/config-manager.ts#L196-L212)

**Section sources**
- [main.js](file://app/renderer/main.js#L97-L135)
- [main.ts](file://app/electron/main.ts#L119-L126)
- [config-manager.ts](file://app/config/config-manager.ts#L192-L212)

### Observer Pattern for Real-Time UI Updates
- AutomationEngine emits progress events; Electron forwards them to renderer; renderer updates UI.
- Renderer listens to automation-progress, automation-complete, automation-error, and site-complete events.

```mermaid
sequenceDiagram
participant AE as "AutomationEngine"
participant M as "Electron Main"
participant R as "Renderer Bridge"
participant UI as "Renderer UI"
AE->>AE : emitProgress(progress)
AE->>M : webContents.send("automation-progress", progress)
M-->>R : webContents.send(...)
R-->>UI : updateWorkflowProgress(data)
AE-->>M : webContents.send("site-complete", result)
M-->>R : webContents.send(...)
R-->>UI : addAuditRow(result)
```

**Diagram sources**
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L548-L556)
- [main.ts](file://app/electron/main.ts#L151-L154)
- [main.js](file://app/renderer/main.js#L151-L182)
- [index.html](file://app/renderer/index.html#L118-L134)

**Section sources**
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L548-L556)
- [main.ts](file://app/electron/main.ts#L151-L154)
- [main.js](file://app/renderer/main.js#L151-L182)
- [index.html](file://app/renderer/index.html#L118-L134)

### Diff Engine and Snapshot Policies
- DiffEngine loads SafeSnapshotPolicy schemas and computes diffs using primary keys.
- Supports custom primary keys and robust column resolution.

```mermaid
classDiagram
class DiffEngine {
+run(siteId, identity, newDownloadPath, customBase, customPrimaryKeys) DiffResult
}
class SafeSnapshotPolicy {
+getSchema(tipo) SchemaMap
}
class SnapshotContract {
<<types>>
}
DiffEngine --> SafeSnapshotPolicy : "loads schema"
DiffEngine --> SnapshotContract : "uses identity"
```

**Diagram sources**
- [DiffEngine.ts](file://app/core/diff/DiffEngine.ts#L23-L45)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts#L3-L24)
- [SnapshotContract.ts](file://app/policy/snapshot/SnapshotContract.ts#L9-L13)

**Section sources**
- [DiffEngine.ts](file://app/core/diff/DiffEngine.ts#L23-L230)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts#L3-L24)
- [SnapshotContract.ts](file://app/policy/snapshot/SnapshotContract.ts#L1-L20)

## Dependency Analysis
- Loose coupling via IPC and singletons (e.g., configManager, notificationService).
- Strong cohesion within layers: automation engine encapsulates browser orchestration; step executor encapsulates workflow execution; diff engine encapsulates snapshot comparison.
- Potential circular dependency avoided by renderer module wiring and explicit imports.

```mermaid
graph LR
MAIN["main.ts"] --> AE["automation-engine.ts"]
MAIN --> SCH["scheduler-service.ts"]
AE --> SM["session-manager.ts"]
AE --> LH["login-handler.ts"]
AE --> SE["step-executor.ts"]
SE --> SR["selector-resolver.ts"]
AE --> PM["preset-repository.ts"]
AE --> CONS["Consolidator.ts"]
AE --> NS["NotificationService.ts"]
SE --> DE["DiffEngine.ts"]
DE --> SSP["SafeSnapshotPolicy.ts"]
MAIN --> CM["config-manager.ts"]
RMAIN["main.js"] --> MAIN
```

**Diagram sources**
- [main.ts](file://app/electron/main.ts#L1-L387)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L1-L611)
- [scheduler-service.ts](file://app/automation/engine/scheduler-service.ts#L1-L145)
- [session-manager.ts](file://app/automation/sessions/session-manager.ts#L1-L225)
- [login-handler.ts](file://app/automation/sessions/login-handler.ts#L1-L364)
- [step-executor.ts](file://app/automation/engine/step-executor.ts#L1-L549)
- [selector-resolver.ts](file://app/automation/engine/selector-resolver.ts#L1-L135)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L1-L34)
- [Consolidator.ts](file://app/core/consolidation/Consolidator.ts#L1-L138)
- [NotificationService.ts](file://app/core/notifications/NotificationService.ts#L1-L115)
- [DiffEngine.ts](file://app/core/diff/DiffEngine.ts#L1-L230)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts#L1-L25)
- [config-manager.ts](file://app/config/config-manager.ts#L1-L408)
- [main.js](file://app/renderer/main.js#L1-L182)

**Section sources**
- [main.ts](file://app/electron/main.ts#L1-L387)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L1-L611)
- [scheduler-service.ts](file://app/automation/engine/scheduler-service.ts#L1-L145)
- [session-manager.ts](file://app/automation/sessions/session-manager.ts#L1-L225)
- [login-handler.ts](file://app/automation/sessions/login-handler.ts#L1-L364)
- [step-executor.ts](file://app/automation/engine/step-executor.ts#L1-L549)
- [selector-resolver.ts](file://app/automation/engine/selector-resolver.ts#L1-L135)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L1-L34)
- [Consolidator.ts](file://app/core/consolidation/Consolidator.ts#L1-L138)
- [NotificationService.ts](file://app/core/notifications/NotificationService.ts#L1-L115)
- [DiffEngine.ts](file://app/core/diff/DiffEngine.ts#L1-L230)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts#L1-L25)
- [config-manager.ts](file://app/config/config-manager.ts#L1-L408)
- [main.js](file://app/renderer/main.js#L1-L182)

## Performance Considerations
- Headless vs visible mode trade-offs: headless reduces resource usage but may trigger anti-bot measures; visible mode improves reliability for CAPTCHA.
- Retry and timeout tuning: defaultRetries and defaultTimeout impact stability and runtime.
- Memory watchdog: periodic RSS monitoring helps detect leaks or accumulation.
- Consolidation cost: merging many snapshots can be I/O intensive; consider batching and disk space planning.
- Session reuse: persistent contexts reduce cold-start overhead but require careful cleanup.

[No sources needed since this section provides general guidance]

## Troubleshooting Guide
- Automation stuck or slow:
  - Verify headless mode and actionDelay settings.
  - Check session expiration and reauthentication flow.
- CAPTCHA failures:
  - Run in visible mode once to resolve challenges; ensure login selectors are correct.
- Snapshot diffs not computed:
  - Confirm reportType and primaryKeys are configured; verify schema availability.
- Session corruption:
  - Clear sessions or delete individual site profiles; ensure Playwright browsers are installed.
- UI not updating:
  - Confirm IPC listeners are registered and automation-progress events are emitted.

**Section sources**
- [login-handler.ts](file://app/automation/sessions/login-handler.ts#L57-L63)
- [login-handler.ts](file://app/automation/sessions/login-handler.ts#L288-L360)
- [DiffEngine.ts](file://app/core/diff/DiffEngine.ts#L67-L74)
- [session-manager.ts](file://app/automation/sessions/session-manager.ts#L170-L183)
- [main.js](file://app/renderer/main.js#L151-L172)

## Conclusion
The system coordinates browser automation through a layered design:
- The main process exposes IPC endpoints and schedules runs
- The automation engine orchestrates sessions, login, and step execution
- The preset repository and config manager provide isolated, portable workflows
- The diff engine and consolidator enforce enterprise-grade snapshot integrity
- The renderer consumes real-time events to keep users informed

This architecture enables scalable, observable, and maintainable automation with strong separation of concerns and clear data flows.