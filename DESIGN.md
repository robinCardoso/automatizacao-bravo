---
name: Automatizador Bravo Design System
description: Visual language for the Automatizador Bravo corporate web automation and dashboard application
colors:
  primary: "#4299e1"
  success: "#48bb78"
  warning: "#ed8936"
  danger: "#e53e3e"
  neutral-bg: "#f8fafc"
  neutral-bg-white: "#ffffff"
  text-ink: "#0f172a"
  text-muted: "#64748b"
  border-subtle: "#e2e8f0"
typography:
  display:
    fontFamily: "Outfit, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-bg-white}"
    rounded: "{rounded.md}"
    padding: "10px 24px"
  card-premium:
    backgroundColor: "{colors.neutral-bg-white}"
    rounded: "{rounded.lg}"
    padding: "20px"
---

# Design System: Automatizador Bravo

## 1. Overview

**Creative North Star: "The Resilient Operations Command"**

Automatizador Bravo is a high-reliability desktop application for web automation and real-time sales reporting. The interface is optimized to reduce cognitive fatigue during long operational shifts and to present data with executive clarity. It rejects decorative clutter, glowing neon grids, and standard AI purple gradients.

### Key Characteristics:
- Muted color strategy focusing accents on status and action.
- Dense, highly readable native typography that adapts instantly to system settings.
- Highly functional layout grid with distinct, clean spacing.

## 2. Colors

A functional palette designed to direct operator focus to warnings, execution status, and key metrics.

### Primary
- **Active Accent Blue** (#4299e1): Used for primary action focus, selection indications, and links.

### Neutral
- **Slate Ink** (#0f172a): Primary color for high-contrast, legible typography.
- **Cool Slate** (#f8fafc): Background color for the application shell and main content layout.
- **Muted Steel** (#64748b): Secondary typography color for help text, descriptions, and labels.
- **Subtle Gray** (#e2e8f0): Border color for panels, cards, and input boundaries.

### Named Rules
**The Accent-as-Action Rule.** Colored accents must only be used to highlight active interactive states, errors, successes, or alerts. Never use accents decoratively.

## 3. Typography

**Display Font:** Outfit (with system sans-serif fallback)  
**Body Font:** system-ui (native OS stack)  

### Hierarchy
- **Display (Outfit, Bold, 14px-18px):** Used for main headers, dashboard totals, and page titles.
- **Body (system-ui, Regular/Medium, 13px, 1.5 line-height):** Used for status descriptions, presets lists, and general inputs.
- **Label (system-ui, Bold, 11px, 0.8px letter-spacing):** Used for field labels, tiny metadata, and table headers.

## 4. Elevation

The application relies on flat, modern layouts. Depth is created using clean borders and subtle surface color variations instead of heavy ambient shadows.

### Shadow Vocabulary
- **Surface Hover Glow** (`box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03)`): Applied to cards and sidebar sections when hovered to indicate interactivity.
- **Interactive Focus** (`box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1)`): Standard focus indicator for buttons and dropdowns.

## 5. Components

### Buttons
- **Shape:** Rounded Corners (8px radius).
- **Primary:** Active Accent Blue (#4299e1) with white text, bold font, and 10px 24px padding.
- **Hover:** Subtle transform lift and shadow elevation on active state.

### Cards / Containers
- **Corner Style:** Large Rounded Corners (12px radius).
- **Background:** White (#ffffff) on Cool Slate (#f8fafc) background.
- **Border:** Subtle Gray (#e2e8f0) 1px border.

### Inputs / Fields
- **Style:** 1px Subtle Gray border, 8px border radius, background color #fcfdfe.
- **Focus:** Border changes to Active Accent Blue with interactive focus glow.

## 6. Do's and Don'ts

### Do:
- **Do** write all user-facing labels in mixed case (Sentence case) to ensure reading flow.
- **Do** use system-ui typography stacks for data lists and text passages to make the application feel native.
- **Do** keep spacing consistent by using the defined 12px (sm) / 16px (md) / 20px (lg) spacing scale.

### Don't:
- **Don't** use border-left/right thicker than 1px as a colored highlight on cards or alerts (side-stripes).
- **Don't** use purple/violet gradients and cyan-on-dark paletizing.
- **Don't** display text transformed into uppercase for sentences longer than 20 characters.
