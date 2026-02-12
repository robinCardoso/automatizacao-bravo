# Snapshot Metadata Management

<cite>
**Referenced Files in This Document**
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts)
- [SnapshotContract.ts](file://app/policy/snapshot/SnapshotContract.ts)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts)
- [SnapshotGate.ts](file://app/policy/snapshot/SnapshotGate.ts)
- [FileNamingPolicy.ts](file://app/policy/snapshot/FileNamingPolicy.ts)
- [SchemaMap.ts](file://app/config/SchemaMap.ts)
- [schemaMaps.json](file://data/schemaMaps.json)
- [VENDA_META_1_TRIMESTRE_2026_SC.json](file://snapshots/site-1769612315557/VENDA_META_1_TRIMESTRE_2026_SC.json)
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
This document describes Snapshot Metadata Management within the Snapshot Safety Policy (SSP) framework. It explains the metadata schema design, data structure organization, and lifecycle management of snapshot metadata. It documents the metadata fields, validation rules, storage mechanisms, and operational patterns for updates and retrievals. It also clarifies the relationship between metadata and snapshot identification, audit trails, and compliance reporting, and provides guidelines for extending metadata schemas and maintaining consistency across snapshot operations.

## Project Structure
The snapshot metadata system is organized around a small set of focused modules under the policy/snapshot directory, with configuration managed via JSON schema maps and stored alongside snapshots.

```mermaid
graph TB
subgraph "Policy Layer"
SM["SnapshotMeta.ts"]
SC["SnapshotContract.ts"]
SSP["SafeSnapshotPolicy.ts"]
SG["SnapshotGate.ts"]
FNP["FileNamingPolicy.ts"]
end
subgraph "Config Layer"
SMT["SchemaMap.ts"]
SMJ["schemaMaps.json"]
end
subgraph "Storage"
META["VENDA_META_1_TRIMESTRE_2026_SC.json"]
end
SM --> SMT
SM --> SMJ
SSP --> SMJ
SG --> SM
SG --> SC
FNP --> SC
META --> SM
```

**Diagram sources**
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)
- [SnapshotContract.ts](file://app/policy/snapshot/SnapshotContract.ts#L1-L20)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts#L1-L25)
- [SnapshotGate.ts](file://app/policy/snapshot/SnapshotGate.ts#L1-L28)
- [FileNamingPolicy.ts](file://app/policy/snapshot/FileNamingPolicy.ts#L1-L35)
- [SchemaMap.ts](file://app/config/SchemaMap.ts#L1-L13)
- [schemaMaps.json](file://data/schemaMaps.json#L1-L9)
- [VENDA_META_1_TRIMESTRE_2026_SC.json](file://snapshots/site-1769612315557/VENDA_META_1_TRIMESTRE_2026_SC.json#L1-L16)

**Section sources**
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)
- [SnapshotContract.ts](file://app/policy/snapshot/SnapshotContract.ts#L1-L20)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts#L1-L25)
- [SnapshotGate.ts](file://app/policy/snapshot/SnapshotGate.ts#L1-L28)
- [FileNamingPolicy.ts](file://app/policy/snapshot/FileNamingPolicy.ts#L1-L35)
- [SchemaMap.ts](file://app/config/SchemaMap.ts#L1-L13)
- [schemaMaps.json](file://data/schemaMaps.json#L1-L9)
- [VENDA_META_1_TRIMESTRE_2026_SC.json](file://snapshots/site-1769612315557/VENDA_META_1_TRIMESTRE_2026_SC.json#L1-L16)

## Core Components
- SnapshotMeta: Defines the metadata structure persisted per snapshot.
- SnapshotContract: Provides identity and file naming contracts.
- SafeSnapshotPolicy: Enforces schema validity and primary key requirements.
- SnapshotGate: Validates snapshot identity consistency against existing metadata.
- FileNamingPolicy: Generates deterministic file paths for current/deleted/meta artifacts.
- SchemaMap and schemaMaps.json: Define per-type primary keys and optional comparison fields.

**Section sources**
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)
- [SnapshotContract.ts](file://app/policy/snapshot/SnapshotContract.ts#L1-L20)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts#L1-L25)
- [SnapshotGate.ts](file://app/policy/snapshot/SnapshotGate.ts#L1-L28)
- [FileNamingPolicy.ts](file://app/policy/snapshot/FileNamingPolicy.ts#L1-L35)
- [SchemaMap.ts](file://app/config/SchemaMap.ts#L1-L13)
- [schemaMaps.json](file://data/schemaMaps.json#L1-L9)

## Architecture Overview
The metadata lifecycle centers on three files per snapshot identity: CURRENT (xlsx), DELETED (xlsx), and META (json). The META file acts as a guardian, containing identity, timestamps, schema version, primary key used, row count, and checksum. Operations must validate identity against META before proceeding, and must update META after successful processing.

```mermaid
sequenceDiagram
participant Engine as "Snapshot Engine"
participant Gate as "SnapshotGate"
participant Policy as "SafeSnapshotPolicy"
participant Naming as "FileNamingPolicy"
participant Meta as "SnapshotMeta"
participant FS as "File System"
Engine->>Naming : "resolveSnapshotFiles(identity)"
Naming-->>Engine : "{current, deleted, meta}"
Engine->>FS : "read(meta)"
FS-->>Engine : "metaContent"
Engine->>Meta : "parse(metaContent)"
Engine->>Gate : "validateSnapshotIdentity(meta, identity)"
Gate-->>Engine : "ok or error"
Engine->>Policy : "getSchema(identity.tipo)"
Policy-->>Engine : "SchemaMap"
Engine->>FS : "process CURRENT/DELETED"
Engine->>FS : "write(meta) with updated fields"
```

**Diagram sources**
- [SnapshotGate.ts](file://app/policy/snapshot/SnapshotGate.ts#L1-L28)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts#L1-L25)
- [FileNamingPolicy.ts](file://app/policy/snapshot/FileNamingPolicy.ts#L1-L35)
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)
- [VENDA_META_1_TRIMESTRE_2026_SC.json](file://snapshots/site-1769612315557/VENDA_META_1_TRIMESTRE_2026_SC.json#L1-L16)

## Detailed Component Analysis

### Metadata Schema Design
The metadata schema defines a compact, versioned record that ties a snapshot to its identity and operational state. It includes:
- Identity: type, period, and geographic unit (uf)
- lastUpdated: ISO timestamp of last update
- schemaVersion: version string for the schema used
- primaryKeyUsed: array of primary key column names applied
- rowCount: number of rows captured
- checksum: cryptographic digest of the dataset

```mermaid
classDiagram
class SnapshotMeta {
+identity : Identity
+lastUpdated : string
+schemaVersion : string
+primaryKeyUsed : string[]
+rowCount : number
+checksum : string
}
class Identity {
+tipo : string
+period : string
+uf : string
}
SnapshotMeta --> Identity : "contains"
```

**Diagram sources**
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)

**Section sources**
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)
- [VENDA_META_1_TRIMESTRE_2026_SC.json](file://snapshots/site-1769612315557/VENDA_META_1_TRIMESTRE_2026_SC.json#L1-L16)

### Data Structure Organization
- Per-identity files: CURRENT.xlsx, DELETED.xlsx, META.json
- Deterministic naming: based on tipo, period, and uf
- Centralized schema maps: per-type primary keys and optional compare fields

```mermaid
flowchart TD
A["Identity {tipo, period, uf}"] --> B["Build names"]
B --> C["CURRENT.xlsx"]
B --> D["DELETED.xlsx"]
B --> E["META.json"]
A --> F["Load SchemaMap by tipo"]
F --> G["primaryKeyUsed"]
G --> H["Diff & Validation"]
```

**Diagram sources**
- [FileNamingPolicy.ts](file://app/policy/snapshot/FileNamingPolicy.ts#L1-L35)
- [schemaMaps.json](file://data/schemaMaps.json#L1-L9)

**Section sources**
- [FileNamingPolicy.ts](file://app/policy/snapshot/FileNamingPolicy.ts#L1-L35)
- [schemaMaps.json](file://data/schemaMaps.json#L1-L9)

### Metadata Lifecycle Management
- Creation: On first snapshot generation, write META with initial identity, schemaVersion, primaryKeyUsed, rowCount=0, checksum empty
- Update: After processing CURRENT/DELETED, update lastUpdated, schemaVersion, primaryKeyUsed, rowCount, and compute/assign checksum
- Validation: Before any operation, read META and validate identity fields match the requested identity; abort if mismatch
- Deletion: Maintain DELETED artifact and update META accordingly

```mermaid
flowchart TD
Start(["Start"]) --> ReadMeta["Read META.json"]
ReadMeta --> HasMeta{"META exists?"}
HasMeta --> |No| InitMeta["Initialize META with identity and schemaVersion"]
HasMeta --> |Yes| Validate["Validate identity against META"]
Validate --> Match{"Match?"}
Match --> |No| Abort["Abort with mismatch error"]
Match --> |Yes| Process["Process CURRENT/DELETED"]
Process --> Update["Update lastUpdated, primaryKeyUsed, rowCount, checksum"]
Update --> Write["Write META.json"]
InitMeta --> Write
Write --> End(["End"])
Abort --> End
```

**Diagram sources**
- [SnapshotGate.ts](file://app/policy/snapshot/SnapshotGate.ts#L1-L28)
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)

**Section sources**
- [SnapshotGate.ts](file://app/policy/snapshot/SnapshotGate.ts#L1-L28)
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)
- [VENDA_META_1_TRIMESTRE_2026_SC.json](file://snapshots/site-1769612315557/VENDA_META_1_TRIMESTRE_2026_SC.json#L1-L16)

### Validation Rules
- Identity integrity: tipo, period, and uf must match between requested identity and existing META
- Schema presence: a SchemaMap must exist for tipo and must define a non-empty primaryKey
- File naming: deterministic naming ensures consistent lookup and prevents cross-period contamination

```mermaid
flowchart TD
A["New Identity {tipo, period, uf}"] --> B["Read META"]
B --> C{"Identity matches?"}
C --> |No| E["Throw mismatch error"]
C --> |Yes| D["Load SchemaMap by tipo"]
D --> F{"primaryKey defined?"}
F --> |No| G["Throw invalid schema error"]
F --> |Yes| H["Proceed"]
```

**Diagram sources**
- [SnapshotGate.ts](file://app/policy/snapshot/SnapshotGate.ts#L1-L28)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts#L1-L25)

**Section sources**
- [SnapshotGate.ts](file://app/policy/snapshot/SnapshotGate.ts#L1-L28)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts#L1-L25)

### Storage Mechanisms
- META is stored as a JSON file named with the pattern: "<tipo>_META_<period>_<uf>.json"
- CURRENT and DELETED are Excel files with deterministic names
- SchemaMaps are loaded from a JSON file keyed by tipo

```mermaid
graph LR
A["Identity {tipo, period, uf}"] --> B["FileNamingPolicy"]
B --> C["META.json path"]
B --> D["CURRENT.xlsx path"]
B --> E["DELETED.xlsx path"]
F["schemaMaps.json"] --> G["SchemaMap by tipo"]
```

**Diagram sources**
- [FileNamingPolicy.ts](file://app/policy/snapshot/FileNamingPolicy.ts#L1-L35)
- [schemaMaps.json](file://data/schemaMaps.json#L1-L9)

**Section sources**
- [FileNamingPolicy.ts](file://app/policy/snapshot/FileNamingPolicy.ts#L1-L35)
- [schemaMaps.json](file://data/schemaMaps.json#L1-L9)

### Examples of Metadata Content
A real-world example demonstrates the identity, timestamps, schema version, primary key used, row count, and checksum fields.

- Example path: [VENDA_META_1_TRIMESTRE_2026_SC.json](file://snapshots/site-1769612315557/VENDA_META_1_TRIMESTRE_2026_SC.json#L1-L16)

**Section sources**
- [VENDA_META_1_TRIMESTRE_2026_SC.json](file://snapshots/site-1769612315557/VENDA_META_1_TRIMESTRE_2026_SC.json#L1-L16)

### Update Procedures
- Read existing META
- Validate identity
- Load SchemaMap for tipo
- Process CURRENT and DELETED datasets
- Compute checksum and update rowCount
- Write updated META

```mermaid
sequenceDiagram
participant Proc as "Processor"
participant FS as "File System"
participant Meta as "SnapshotMeta"
Proc->>FS : "read(META.json)"
FS-->>Proc : "metaContent"
Proc->>Meta : "parse(metaContent)"
Proc->>Proc : "process datasets"
Proc->>Proc : "compute checksum, update rowCount"
Proc->>FS : "write(META.json)"
```

**Diagram sources**
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)
- [VENDA_META_1_TRIMESTRE_2026_SC.json](file://snapshots/site-1769612315557/VENDA_META_1_TRIMESTRE_2026_SC.json#L1-L16)

**Section sources**
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)
- [VENDA_META_1_TRIMESTRE_2026_SC.json](file://snapshots/site-1769612315557/VENDA_META_1_TRIMESTRE_2026_SC.json#L1-L16)

### Retrieval Patterns
- Resolve file paths using identity and naming policy
- Read META to confirm identity and schema version
- Use primaryKeyUsed for downstream diff and validation steps

```mermaid
flowchart TD
A["Given identity {tipo, period, uf}"] --> B["resolveSnapshotFiles()"]
B --> C["Read META.json"]
C --> D["Verify identity and schemaVersion"]
D --> E["Use primaryKeyUsed for operations"]
```

**Diagram sources**
- [FileNamingPolicy.ts](file://app/policy/snapshot/FileNamingPolicy.ts#L1-L35)
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)

**Section sources**
- [FileNamingPolicy.ts](file://app/policy/snapshot/FileNamingPolicy.ts#L1-L35)
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)

### Relationship to Snapshot Identification, Audit Trails, and Compliance Reporting
- Snapshot identification: META anchors tipo, period, and uf to ensure consistent and verifiable snapshot identity.
- Audit trails: lastUpdated provides a timestamp for each update; checksum enables immutable verification of dataset integrity.
- Compliance reporting: schemaVersion and primaryKeyUsed enable auditors to verify adherence to governance policies and schema evolution.

**Section sources**
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)
- [VENDA_META_1_TRIMESTRE_2026_SC.json](file://snapshots/site-1769612315557/VENDA_META_1_TRIMESTRE_2026_SC.json#L1-L16)

### Guidelines for Extending Metadata Schemas and Managing Consistency
- Extend SnapshotMeta carefully: add optional fields with defaults and ensure backward compatibility.
- Maintain schemaVersions: increment schemaVersion when metadata structure changes.
- Enforce identity gates: always validate identity before processing to prevent cross-period contamination.
- Keep primaryKeyUsed synchronized: update primaryKeyUsed whenever primary key composition changes.
- Use deterministic naming: rely on FileNamingPolicy to avoid ambiguous file paths.
- Centralize schema maps: manage SchemaMap entries per tipo in schemaMaps.json to enforce primary key rules.

**Section sources**
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts#L1-L25)
- [FileNamingPolicy.ts](file://app/policy/snapshot/FileNamingPolicy.ts#L1-L35)
- [schemaMaps.json](file://data/schemaMaps.json#L1-L9)

## Dependency Analysis
The following diagram shows how components depend on each other and on configuration.

```mermaid
graph TB
SM["SnapshotMeta.ts"] --> SMT["SchemaMap.ts"]
SM --> SMJ["schemaMaps.json"]
SSP["SafeSnapshotPolicy.ts"] --> SMJ
SG["SnapshotGate.ts"] --> SM
SG --> SC["SnapshotContract.ts"]
FNP["FileNamingPolicy.ts"] --> SC
```

**Diagram sources**
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)
- [SchemaMap.ts](file://app/config/SchemaMap.ts#L1-L13)
- [schemaMaps.json](file://data/schemaMaps.json#L1-L9)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts#L1-L25)
- [SnapshotGate.ts](file://app/policy/snapshot/SnapshotGate.ts#L1-L28)
- [SnapshotContract.ts](file://app/policy/snapshot/SnapshotContract.ts#L1-L20)
- [FileNamingPolicy.ts](file://app/policy/snapshot/FileNamingPolicy.ts#L1-L35)

**Section sources**
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)
- [SchemaMap.ts](file://app/config/SchemaMap.ts#L1-L13)
- [schemaMaps.json](file://data/schemaMaps.json#L1-L9)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts#L1-L25)
- [SnapshotGate.ts](file://app/policy/snapshot/SnapshotGate.ts#L1-L28)
- [SnapshotContract.ts](file://app/policy/snapshot/SnapshotContract.ts#L1-L20)
- [FileNamingPolicy.ts](file://app/policy/snapshot/FileNamingPolicy.ts#L1-L35)

## Performance Considerations
- Keep META minimal: only essential fields reduce IO overhead.
- Use deterministic naming: avoids expensive directory scans.
- Validate early: identity gate prevents unnecessary processing.
- Batch updates: update META atomically after all dataset writes complete.

## Troubleshooting Guide
Common issues and resolutions:
- Identity mismatch error: Indicates META vs. requested identity mismatch; verify tipo, period, and uf.
- Schema not defined: Ensure tipo exists in schemaMaps.json with a non-empty primaryKey.
- Missing META: Initialize META with correct identity and schemaVersion before processing.
- Cross-period contamination: Rely on SnapshotGate to abort operations with mismatched identities.

**Section sources**
- [SnapshotGate.ts](file://app/policy/snapshot/SnapshotGate.ts#L1-L28)
- [SafeSnapshotPolicy.ts](file://app/policy/snapshot/SafeSnapshotPolicy.ts#L1-L25)

## Conclusion
Snapshot Metadata Management in SSP provides a robust, deterministic mechanism for identifying, validating, and auditing snapshots. By anchoring identity in META, enforcing schema validity, and using deterministic naming, the system ensures consistency and compliance across snapshot operations. Extending the metadata schema should be done carefully with versioning and backward compatibility in mind.

## Appendices

### Appendix A: Metadata Field Reference
- identity.tipo: Report type identifier
- identity.period: Period identifier (e.g., Q1_YYYY)
- identity.uf: Geographic unit
- lastUpdated: ISO timestamp of last update
- schemaVersion: Version of the schema used
- primaryKeyUsed: Array of primary key column names
- rowCount: Number of rows in the dataset
- checksum: Cryptographic digest of the dataset

**Section sources**
- [SnapshotMeta.ts](file://app/policy/snapshot/SnapshotMeta.ts#L1-L18)
- [VENDA_META_1_TRIMESTRE_2026_SC.json](file://snapshots/site-1769612315557/VENDA_META_1_TRIMESTRE_2026_SC.json#L1-L16)