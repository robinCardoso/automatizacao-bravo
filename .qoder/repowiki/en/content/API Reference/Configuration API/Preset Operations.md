# Preset Operations

<cite>
**Referenced Files in This Document**
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts)
- [config-manager.ts](file://app/config/config-manager.ts)
- [main.ts](file://app/electron/main.ts)
- [preload.ts](file://app/electron/preload.ts)
- [presets.js](file://app/renderer/modules/presets.js)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts)
- [MIGRATION_PRESET_ISOLATION.md](file://MIGRATION_PRESET_ISOLATION.md)
- [FASE 6 — PRESETS E CONFIGURAÇÕES.md](file://docs/FASE 6 — PRESETS E CONFIGURAÇÕES.md)
- [main.js](file://app/renderer/main.js)
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
10. [Appendices](#appendices)

## Introduction
This document explains preset management operations in Automatizador Bravo, focusing on CRUD operations (addPreset, updatePreset, removePreset, getPresets) and the preset isolation mechanism that keeps site configurations separate per preset container. It covers automatic UUID generation, timestamp management, validation, conflict resolution, duplicate detection, and data consistency during operations. It also provides end-to-end examples for preset creation, site assignment, and lifecycle management.

## Project Structure
Preset operations span three layers:
- Renderer UI: collects preset data and triggers IPC calls
- Electron Main: exposes IPC handlers and delegates to repositories
- Engine/Config: validates, persists, and manages presets and isolated sites

```mermaid
graph TB
subgraph "Renderer"
UI["UI Modules<br/>presets.js"]
end
subgraph "Electron Main"
IPC["IPC Handlers<br/>main.ts"]
Repo["PresetRepository<br/>preset-repository.ts"]
end
subgraph "Engine/Config"
CM["ConfigManager<br/>config-manager.ts"]
AE["AutomationEngine<br/>automation-engine.ts"]
end
UI --> IPC
IPC --> Repo
Repo --> CM
AE --> Repo
AE --> CM
```

**Diagram sources**
- [main.ts](file://app/electron/main.ts#L117-L164)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L4-L32)
- [config-manager.ts](file://app/config/config-manager.ts#L85-L398)
- [presets.js](file://app/renderer/modules/presets.js#L17-L414)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L50-L238)

**Section sources**
- [main.ts](file://app/electron/main.ts#L117-L164)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L4-L32)
- [config-manager.ts](file://app/config/config-manager.ts#L85-L398)
- [presets.js](file://app/renderer/modules/presets.js#L17-L414)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L50-L238)

## Core Components
- PresetRepository: thin facade over ConfigManager for preset CRUD and usage tracking
- ConfigManager: Zod-based validation, persistence, and isolation of sites per preset
- Electron IPC: renderer-safe API for preset CRUD and automation orchestration
- Renderer Presets Module: form handling, scheduling UI, and preset lifecycle actions
- AutomationEngine: consumes preset sites and injects preset credentials into site configs

Key responsibilities:
- Automatic UUID generation for presets and sites
- Timestamp management (createdAt, lastUsedAt)
- Validation via Zod schemas
- Isolation of sites per preset container
- Conflict resolution and duplicate detection during import/export

**Section sources**
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L4-L32)
- [config-manager.ts](file://app/config/config-manager.ts#L35-L53)
- [config-manager.ts](file://app/config/config-manager.ts#L220-L232)
- [config-manager.ts](file://app/config/config-manager.ts#L265-L278)
- [main.ts](file://app/electron/main.ts#L128-L145)
- [presets.js](file://app/renderer/modules/presets.js#L154-L208)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L92-L104)

## Architecture Overview
End-to-end preset CRUD flow from UI to persistence and automation consumption.

```mermaid
sequenceDiagram
participant UI as "Renderer UI<br/>presets.js"
participant Preload as "Preload API<br/>preload.ts"
participant Main as "Electron Main<br/>main.ts"
participant Repo as "PresetRepository<br/>preset-repository.ts"
participant CM as "ConfigManager<br/>config-manager.ts"
UI->>Preload : "savePreset(preset)"
Preload->>Main : "ipcRenderer.invoke('save-preset', preset)"
alt preset has id
Main->>Repo : "update(id, preset)"
Repo->>CM : "updatePreset(id, preset)"
else new preset
Main->>Repo : "create(preset)"
Repo->>CM : "addPreset(preset)"
end
CM-->>Main : "success"
Main-->>Preload : "{ success : true }"
Preload-->>UI : "success"
```

**Diagram sources**
- [presets.js](file://app/renderer/modules/presets.js#L154-L208)
- [preload.ts](file://app/electron/preload.ts#L22-L25)
- [main.ts](file://app/electron/main.ts#L128-L145)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L13-L22)
- [config-manager.ts](file://app/config/config-manager.ts#L220-L232)

## Detailed Component Analysis

### PresetRepository
- Provides CRUD façade over ConfigManager
- Adds automatic timestamps and marks presets as used after automation runs
- Returns latest preset after create for immediate UI refresh

```mermaid
classDiagram
class PresetRepository {
+getAll() Preset[]
+getById(id) Preset?
+create(preset) Preset
+update(id, preset) void
+delete(id) void
+markAsUsed(id) void
}
class ConfigManager {
+getPresets() Preset[]
+addPreset(preset) void
+updatePreset(id, patch) void
+removePreset(id) void
}
PresetRepository --> ConfigManager : "delegates"
```

**Diagram sources**
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L4-L32)
- [config-manager.ts](file://app/config/config-manager.ts#L216-L243)

**Section sources**
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L4-L32)

### ConfigManager (Validation, Persistence, Isolation)
- Zod schemas define strict validation for presets and sites
- Automatic UUID generation for presets and sites
- Timestamps createdAt and lastUsedAt are managed during add/update
- Isolation: sites are stored within each preset, not globally
- Duplicate detection and conflict resolution during import/export

```mermaid
flowchart TD
Start(["Add/Update Preset"]) --> Parse["Parse with Zod schema"]
Parse --> Valid{"Valid?"}
Valid --> |No| ThrowErr["Throw validation error"]
Valid --> |Yes| FillDefaults["Fill defaults<br/>id, createdAt, sites[]"]
FillDefaults --> Save["Persist to config file"]
Save --> Done(["Done"])
```

**Diagram sources**
- [config-manager.ts](file://app/config/config-manager.ts#L35-L53)
- [config-manager.ts](file://app/config/config-manager.ts#L220-L232)
- [config-manager.ts](file://app/config/config-manager.ts#L245-L256)

**Section sources**
- [config-manager.ts](file://app/config/config-manager.ts#L35-L53)
- [config-manager.ts](file://app/config/config-manager.ts#L220-L232)
- [config-manager.ts](file://app/config/config-manager.ts#L245-L256)
- [config-manager.ts](file://app/config/config-manager.ts#L265-L278)
- [config-manager.ts](file://app/config/config-manager.ts#L353-L394)

### Electron IPC Handlers
- Renderer-safe exposure of preset operations
- Delegates to PresetRepository for CRUD
- Supports export/import of entire configuration including presets

```mermaid
sequenceDiagram
participant UI as "Renderer UI"
participant Preload as "preload.ts"
participant Main as "main.ts"
UI->>Preload : "getPresets()"
Preload->>Main : "ipcRenderer.invoke('get-presets')"
Main->>Main : "presetRepository.getAll()"
Main-->>Preload : "Preset[]"
Preload-->>UI : "Preset[]"
```

**Diagram sources**
- [preload.ts](file://app/electron/preload.ts#L22-L25)
- [main.ts](file://app/electron/main.ts#L128-L131)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L5-L7)

**Section sources**
- [preload.ts](file://app/electron/preload.ts#L22-L25)
- [main.ts](file://app/electron/main.ts#L128-L145)

### Renderer Presets Module (UI Workflows)
- Handles preset form submission, validation, and scheduling
- Generates UUID for new presets when missing
- Loads presets into selectors and lists, updates sidebar schedules
- Edits existing presets while preserving associated sites

```mermaid
flowchart TD
OpenForm["Open New/Edit Preset Form"] --> Fill["Fill Fields<br/>name, type, login, pass, destination"]
Fill --> Schedule["Configure Schedule<br/>mode, interval/fixed times"]
Schedule --> Submit["Click Save"]
Submit --> Validate{"Required fields present?"}
Validate --> |No| Notify["Show warning notification"]
Validate --> |Yes| BuildPayload["Build preset payload<br/>id (auto if new), schedule, sites[]"]
BuildPayload --> IPC["Call savePreset via preload"]
IPC --> Refresh["Refresh lists and selectors"]
```

**Diagram sources**
- [presets.js](file://app/renderer/modules/presets.js#L154-L208)
- [presets.js](file://app/renderer/modules/presets.js#L330-L349)
- [presets.js](file://app/renderer/modules/presets.js#L210-L238)

**Section sources**
- [presets.js](file://app/renderer/modules/presets.js#L154-L208)
- [presets.js](file://app/renderer/modules/presets.js#L330-L349)
- [presets.js](file://app/renderer/modules/presets.js#L210-L238)

### AutomationEngine Integration
- Consumes preset sites directly (isolated)
- Injects preset login/password into site credentials for execution
- Updates lastUsedAt after successful automation runs

```mermaid
sequenceDiagram
participant AE as "AutomationEngine"
participant Repo as "PresetRepository"
participant CM as "ConfigManager"
AE->>Repo : "getById(presetId)"
Repo->>CM : "getPresets()"
CM-->>Repo : "Preset[]"
Repo-->>AE : "Preset"
AE->>AE : "Use preset.sites (isolated)"
AE->>AE : "Inject preset.login/password into site"
AE-->>AE : "Run steps per site"
AE->>Repo : "markAsUsed(presetId)"
```

**Diagram sources**
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L92-L104)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L127-L133)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L216-L218)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L9-L11)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L28-L31)

**Section sources**
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L92-L104)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L127-L133)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L216-L218)

## Dependency Analysis
- PresetRepository depends on ConfigManager for validation and persistence
- Electron Main registers IPC handlers that delegate to PresetRepository
- Renderer UI interacts with IPC via preload.ts
- AutomationEngine depends on PresetRepository and ConfigManager for site isolation and credential injection

```mermaid
graph LR
UI["presets.js"] --> Preload["preload.ts"]
Preload --> Main["main.ts"]
Main --> Repo["preset-repository.ts"]
Repo --> CM["config-manager.ts"]
AE["automation-engine.ts"] --> Repo
AE --> CM
```

**Diagram sources**
- [main.js](file://app/renderer/main.js#L47-L58)
- [preload.ts](file://app/electron/preload.ts#L22-L25)
- [main.ts](file://app/electron/main.ts#L128-L145)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L1-L3)
- [config-manager.ts](file://app/config/config-manager.ts#L1-L2)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L10-L10)

**Section sources**
- [main.js](file://app/renderer/main.js#L47-L58)
- [main.ts](file://app/electron/main.ts#L128-L145)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L1-L3)
- [config-manager.ts](file://app/config/config-manager.ts#L1-L2)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L10-L10)

## Performance Considerations
- Zod parsing occurs on every add/update; keep preset payloads minimal to reduce overhead
- Isolated sites avoid global site aggregation costs during automation runs
- Batch updates: prefer updating preset fields in a single call to minimize disk writes
- Use markAsUsed sparingly; it performs an update operation per run completion

## Troubleshooting Guide
Common issues and resolutions:
- Validation errors on save: ensure required fields (name, login, password) are provided; check schedule configuration
- Preset not found: verify presetId exists via getPresets or getById
- Duplicate presets after import: importConfig detects existing IDs and updates; review warnings returned by importConfig
- Missing sites after migration: verify isolation migration applied; confirm sites are under preset.sites, not global

Operational tips:
- Use exportConfig/importConfig to back up and restore presets with their isolated sites
- Confirm lastUsedAt updates after automation completes

**Section sources**
- [config-manager.ts](file://app/config/config-manager.ts#L353-L394)
- [config-manager.ts](file://app/config/config-manager.ts#L245-L256)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L216-L218)

## Conclusion
Preset management in Automatizador Bravo is built around strict validation, automatic identifiers, and strong isolation of site configurations per preset. The layered architecture ensures robust CRUD operations, predictable lifecycle management, and seamless integration with automation workflows. The documented patterns and examples enable consistent creation, assignment, and maintenance of presets while preserving data integrity and resolving conflicts.

## Appendices

### CRUD Operations Reference
- addPreset: Validates and persists a new preset; generates id and createdAt automatically
- updatePreset: Validates and merges partial updates; preserves existing sites
- removePreset: Removes preset by id; maintains data consistency
- getPresets: Returns all presets; used by UI and automation

**Section sources**
- [config-manager.ts](file://app/config/config-manager.ts#L220-L232)
- [config-manager.ts](file://app/config/config-manager.ts#L245-L256)
- [config-manager.ts](file://app/config/config-manager.ts#L234-L243)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L5-L7)

### Preset Isolation Mechanism
- Sites are stored within each preset (not globally)
- AutomationEngine consumes preset.sites directly
- Migration removes global sites list and enforces per-preset site arrays

**Section sources**
- [MIGRATION_PRESET_ISOLATION.md](file://MIGRATION_PRESET_ISOLATION.md#L8-L34)
- [MIGRATION_PRESET_ISOLATION.md](file://MIGRATION_PRESET_ISOLATION.md#L44-L87)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L92-L104)

### Automatic UUID Generation and Timestamps
- UUIDs: generated for presets and sites when missing
- Timestamps: createdAt on add; lastUsedAt on automation completion

**Section sources**
- [config-manager.ts](file://app/config/config-manager.ts#L223-L225)
- [config-manager.ts](file://app/config/config-manager.ts#L271)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L28-L31)

### Examples

#### Example 1: Create a New Preset
- Steps:
  - Open preset form in UI
  - Fill name, type, login, password, destination
  - Click Save; UI builds payload with id if missing
  - IPC invokes save-preset; main handler calls PresetRepository.create
  - ConfigManager adds preset with generated id and createdAt
  - UI refreshes lists and selectors

**Section sources**
- [presets.js](file://app/renderer/modules/presets.js#L154-L208)
- [main.ts](file://app/electron/main.ts#L133-L138)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L13-L18)
- [config-manager.ts](file://app/config/config-manager.ts#L220-L232)

#### Example 2: Assign Sites to a Preset
- Steps:
  - Select preset in UI
  - Navigate to Sites tab
  - Add/edit sites; each site gets a UUID if missing
  - Save site; main handler updates preset.sites atomically
  - AutomationEngine reads preset.sites for execution

**Section sources**
- [MIGRATION_PRESET_ISOLATION.md](file://MIGRATION_PRESET_ISOLATION.md#L113-L156)
- [config-manager.ts](file://app/config/config-manager.ts#L265-L278)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L92-L104)

#### Example 3: Update Preset Credentials and Run Automation
- Steps:
  - Edit preset form; update login/password
  - Save preset; ConfigManager validates and merges
  - AutomationEngine injects credentials into site configs
  - After run, markAsUsed updates lastUsedAt

**Section sources**
- [config-manager.ts](file://app/config/config-manager.ts#L245-L256)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L127-L133)
- [automation-engine.ts](file://app/automation/engine/automation-engine.ts#L216-L218)
- [preset-repository.ts](file://app/automation/engine/preset-repository.ts#L28-L31)

#### Example 4: Import/Export Presets with Isolated Sites
- Steps:
  - Export configuration; includes presets and all nested sites
  - Import configuration; merges by id, preserving existing or adding new
  - Warnings indicate updates/additions

**Section sources**
- [config-manager.ts](file://app/config/config-manager.ts#L334-L348)
- [config-manager.ts](file://app/config/config-manager.ts#L353-L394)