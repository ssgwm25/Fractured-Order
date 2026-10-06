> Historical implementation checklist: the Industry orientation steps below
> describe the superseded form. Current Industry behavior is the Move 1
> Industry Strategic Plan documented in
> `docs/architecture/industry-strategic-plan.md`; Blue, Red, and Green retain
> the workflow described here.

Plan
Implement team-specific Strategic Orientation modals that capture each team’s catalogue selections, forecasts, and required free-text strategy. Persist the expanded data compatibly and expose it through Facilitator, White Cell, projection, and export workflows.
Scope
In:Blue, Red, Green, and Industry Strategic Orientation modals.
Strategic Orientation serialization, parsing, display, export, tests, and documentation.
Existing separate Green (Asian Pacific) and Green (Europe) forecast targets.

Out:Normal actions, proposals, RFIs, database/RLS changes, team topology, and the four-team pre-Move-1 gate.

Action items
[ ] Define the final team workflow matrix in [strategicOrientationDetails.js](/C:/Users/ssnguna/Local Sites/Fractured-Order/src/features/actions/strategicOrientationDetails.js).
Blue:Choose Blue’s orientation from the catalogue.
Forecast Red’s orientation from the catalogue.
Describe what Red is expected to do.

Red:Choose Red’s orientation from the catalogue.
Describe/rationalize Red’s orientation in free text.
Forecast Blue’s orientation.
Forecast Green (Asian Pacific).
Forecast Green (Europe).

Green:Forecast Blue’s orientation.
Choose Green’s orientation.
Describe Green’s strategy, in its own terms, given the Blue forecast.

Industry:Forecast Blue’s orientation.
Choose Industry’s orientation.
Describe Industry’s strategy, in its own terms, given the Blue forecast.

Implement this as a declarative profile keyed by team ID, defining ordered sections, forecast targets, required fields, labels, help text, and submit copy.
Add Red to the forecast-target registry while retaining the three existing Red forecast targets: Blue, Green (Asian Pacific), and Green (Europe).
[ ] Extend the persisted Strategic Orientation contract additively.
Add an explicit contract version.
Store independent fields for:ownOrientation.
forecastTargets.
orientationRationale.
forecastActionDescription.
strategyDescription.

Store each selected catalogue value with its stable ID, label, and tag.
Store Blue’s Red-action description alongside the Red forecast target.
Retain deterministic forecast ordering.
Reject unknown or duplicate targets during normalization.
Preserve the existing parser for legacy selection-only and forecast-only artifacts.
Update the view model to expose independent capabilities such as hasOwnOrientation, hasForecasts, hasOrientationRationale, and hasStrategyDescription instead of treating selection and forecast as mutually exclusive.
Leave getStrategicOrientationCompletion() unchanged: one submitted artifact from each of the four teams still clears the gate.
[ ] Refactor the modal implementation in [facilitator.js](/C:/Users/ssnguna/Local Sites/Fractured-Order/src/roles/facilitator.js).
Generate each modal from the team profile.
Render numbered or clearly separated sections in the exact workflow order.
Give every catalogue selection its own <fieldset>, unique legend, and radio group.
Use purpose-specific textarea labels:Describe what you expect Red to do
Describe and explain Red’s strategic orientation
Describe your strategy given this forecast

Maintain structured modal state for own orientation, forecast selections, rationale, expected actions, and strategy description.
Require every team-specific field and reject whitespace-only narratives.
Disable confirmation until all required catalogue choices are present; validate narrative fields on submission and show field-level errors plus an accessible error summary.
Restore all values when editing a returned artifact.
Ensure resubmission changes only the intended revision and retains untouched fields.
Generate titles and timeline summaries from the team’s own orientation while listing forecasts separately.
[ ] Update buttons, copy, and modal styling.
Rename the orientation controls in the four teams/*/facilitator.html pages to Strategic Orientation, avoiding incomplete labels such as Forecast Blue and Forecast Teams.
Update [modals.css](/C:/Users/ssnguna/Local Sites/Fractured-Order/styles/components/modals.css) for:Section separation and headings.
Compact catalogue cards.
Responsive single-column layout.
Modal-body scrolling at short viewport heights.
A footer that remains visible and keyboard reachable at 200% zoom.

Preserve arrow-key radio navigation, visible focus, focus trapping, Escape/Cancel behavior, screen-reader labels, and reduced-motion behavior.
[ ] Update every Strategic Orientation presentation surface.
Update originating-team cards in [facilitator.js](/C:/Users/ssnguna/Local Sites/Fractured-Order/src/roles/facilitator.js) to show:Own orientation.
Orientation rationale or strategy description.
Every forecast.
Blue’s expected Red actions.

Update Facilitator slides and projection mode in [scribe.js](/C:/Users/ssnguna/Local Sites/Fractured-Order/src/roles/scribe.js) with the same ordered fields.
Update White Cell queue cards, returned history, and review dialogs in [whitecell.js](/C:/Users/ssnguna/Local Sites/Fractured-Order/src/roles/whitecell.js).
Replace exclusive Selection/Forecast badges for new records with an accurate label such as Orientation & Forecast.
Continue rendering legacy records with their original selection-only or forecast-only labels.
Never infer a missing orientation, forecast, description, or rationale.
[ ] Update research exports in [researchExport.js](/C:/Users/ssnguna/Local Sites/Fractured-Order/src/features/export/researchExport.js).
Include the new fields in canonical JSON/CSV projections.
Add own orientation, forecasts, rationale, strategy description, and expected target actions to HTML and LaTeX reports.
Preserve stable target ordering: Red, Blue, Green (Asian Pacific), and Green (Europe) where applicable to the artifact.
Keep legacy records exportable without retroactively minting new fields.
Update export reconciliation so persisted values must match their rendered report values.
[ ] Add unit and contract tests.
In [strategicOrientationDetails.test.js](/C:/Users/ssnguna/Local Sites/Fractured-Order/src/features/actions/strategicOrientationDetails.test.js), add:Round-trip coverage for all four team profiles.
Red’s own catalogue selection and rationale.
Red’s three deterministically ordered forecasts.
Blue’s Red forecast and expected-action description.
Green and Industry strategy descriptions.
Unknown/duplicate target rejection.
Legacy artifact compatibility.

In [facilitator.test.js](/C:/Users/ssnguna/Local Sites/Fractured-Order/src/roles/facilitator.test.js), pin:Exact section order and labels per team.
Required choice and narrative validation.
Whitespace-only rejection.
Submit-button state.
Keyboard behavior.
Edit/resubmit prepopulation.
Exact serialized payload and timeline metadata.

Update [scribe.test.js](/C:/Users/ssnguna/Local Sites/Fractured-Order/src/roles/scribe.test.js), [whitecell.test.js](/C:/Users/ssnguna/Local Sites/Fractured-Order/src/roles/whitecell.test.js), and [researchExport.test.js](/C:/Users/ssnguna/Local Sites/Fractured-Order/src/features/export/researchExport.test.js) to assert complete, nonduplicated rendering.
Update repository documentation-contract assertions that currently describe Blue as the only team choosing an orientation.
[ ] Update E2E rehearsal coverage.
Refactor [liveDemoHarness.js](/C:/Users/ssnguna/Local Sites/Fractured-Order/tests/e2e/support/liveDemoHarness.js) so the orientation helper accepts:ownOrientation
Target-specific forecasts
orientationRationale
forecastActionDescription
strategyDescription

Update smoke and playthrough fixtures for all four teams.
Assert:Each modal shows only its required fields in the correct order.
Incomplete records cannot be submitted.
All entered values reach Facilitator and White Cell unchanged.
Returned artifacts reopen with every field populated.
Corrected artifacts resubmit without data loss.
All four artifacts still clear the pre-Move-1 gate.
Keyboard-only, mobile, short-viewport, and 200%-zoom flows remain usable.
Legacy fixtures render without console errors.

[ ] Align documentation with the new runtime behavior.
Update [README.md](/C:/Users/ssnguna/Local Sites/Fractured-Order/README.md) with the four-team workflow matrix.
Update [live-demo-runbook.md](/C:/Users/ssnguna/Local Sites/Fractured-Order/docs/live-demo-runbook.md) with exact manual checks for every field, handoff, return, and resubmission.
Update [playthrough-automation.md](/C:/Users/ssnguna/Local Sites/Fractured-Order/docs/playthrough-automation.md) and the functionality walkthrough to remove the old selection-versus-forecast model.
Document that no database migration is required because the new fields remain in the existing additive Strategic Orientation envelope.
[ ] Treat the implementation as complete only when:
Every team’s modal matches the approved order and terminology.

Red selects an orientation, describes it, and forecasts Blue plus both Green delegations.

Blue selects its orientation, forecasts Red, and describes Red’s expected actions.

Green and Industry each forecast Blue, choose their own orientation, and describe their strategy given the forecast.

All required fields are validated before persistence.

Create, edit, return, resubmit, projection, White Cell review, and export preserve identical structured values.

Legacy records remain readable and clearly labelled.

The one-artifact-per-team behavior and pre-Move-1 gate are unchanged.

Accessibility and responsive checks pass.

The human runs:
npm test -- --run src/features/actions/strategicOrientationDetails.test.js src/roles/facilitator.test.js src/roles/scribe.test.js src/roles/whitecell.test.js src/features/export/researchExport.test.js tests/unit/repo-docs-contract.test.js
npm run build
npm run test:e2e:smoke
npm run test:e2e:playthrough

Pass means every command exits successfully, the browser reports no console errors, and the E2E assertions verify field equality across the complete handoff/review workflow.

[ ] Commit the completed change with:
Title: feat: expand strategic orientation workflows by team
Description: Replace the generic Strategic Orientation modal with ordered, team-specific workflows for Blue, Red, Green, and Industry. Persist each team’s own catalogue orientation, target-specific forecasts, rationale, expected actions, and strategy description with legacy compatibility, then expose the complete artifact across Facilitator, White Cell, projection, export, documentation, and automated tests.
