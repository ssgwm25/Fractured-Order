# Fractured Order component registry

This is the reusable-component and semantic-event registry required by
`DESIGN_STANDARDS.md`. Source components live under `src/components/` unless a
feature-specific owner is named. New variants and semantic events update this
registry in the same change.

## Shared components

| Component | Single purpose | Variants and reason | States | Token groups | Used on |
| --- | --- | --- | --- | --- | --- |
| Button | Invoke one named action. | Primary for the main action; secondary/ghost for alternatives; warning/danger for consequential confirmation. | default, hover, focus, disabled, pending | color, type, spacing, radius, border, motion | All role surfaces |
| Modal | Hold one bounded decision or form while background content is inert. | `sm`–`xl` match content density. | opening, active, dirty, saving, error, closing | color, type, spacing, radius, elevation, motion, z-index | Authoring, review, confirmation |
| Unsaved-change confirmation | Prevent accidental loss from any dirty-form exit. | Browser-native for unload; shared confirm behavior for application exits. | clean, dirty, retain, discard | browser-native or Modal/Button roles | Modal forms, inline presentation edit, navigation, seat release |
| Toast | Announce transient operation feedback without replacing durable state. | info, success, warning, error. | entering, visible, dismissed | semantic color, type, spacing, motion, z-index | All role surfaces |
| Durable notification | Present workflow work that survives reload until read/dismissed per its contract. | Workflow-family content only. | unread, read, dismissed | semantic color, type, spacing, border | Facilitator and operator alerts |
| Badge | Label record lifecycle, priority, role, or state in text as well as color. | Lifecycle, priority, neutral. | active, muted | semantic color, type, spacing, radius | Lists and cards |
| Card | Group one record or bounded information unit. | Static or keyboard-activatable. | default, focus, selected, expanded | surface, type, spacing, border | Dashboards and queues |
| Tabs | Switch between peer views without changing the underlying record. | Standard and action-mark rail. | selected, unselected, disabled | color, type, spacing, border | Queues, Move marks, reports |
| Table | Present comparable records with explicit headers. | Compact or standard density. | loading, populated, empty, error | type, spacing, border | Operator and export surfaces |
| Loader | Identify a bounded pending operation. | Page or inline. | loading, delayed, failure handoff | color, spacing, motion | Startup and writes |
| Header | Identify role, Session, live game state, timer, and global actions. | Role-specific identity content. | connected, degraded, disconnected | surface, type, spacing, border | All application pages |
| Sidebar | Navigate role-owned sections and expose unread state. | Expanded, collapsed, compact drawer. | active, unread, open, closed | surface, type, spacing, border, motion | Role workspaces |
| Section | Provide a titled content region with description and actions. | Standard or dense. | loading, empty, error, ready | type, spacing | Role workspaces |
| Industry Turn Sheet | Author one structured sector Proposal while referencing an immutable baseline after Proposal 1. | Proposal 1 baseline editors; Proposal 2+ reference view. | clean, dirty, validation error, saving, failed, saved | form, semantic color, type, spacing, border | Industry Scribe |
| Move control | Display and request server-authorized Move transitions. | Previous and next. | unavailable with reason, available, pending, failed | semantic color, type, spacing | White Cell |

## Semantic event map

Sound is deliberately silent except for the separately registered notification
cue; every event remains complete without sound.

| Semantic event | Color role | Symbol | Motion | Sound role |
| --- | --- | --- | --- | --- |
| Save started | informational | Progress indicator | loading motion token | silent |
| Save completed | success | Check mark | brief entrance token | silent |
| Save failed | error | Error mark | brief entrance token | notification cue where enabled |
| Validation blocked | error | Field error mark + text | none | silent |
| Unsaved exit requested | warning | Warning mark | modal entrance token or browser-native | silent |
| Artifact handed forward | informational | Directional arrow | brief entrance token | notification cue where enabled |
| Artifact returned | warning | Return arrow | brief entrance token | notification cue where enabled |
| Artifact completed | success | Check mark | brief entrance token | notification cue where enabled |
| Move unavailable | warning | Named missing requirements | none | silent |
| Realtime degraded | warning | Connection status + text | none | silent |
| Authorization denied | error | Lock mark + text | none | silent |

