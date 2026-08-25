# Fractured Order 2.0 — Information Brief Specification

**Track:** Information (explanatory only — **no scoring**)  
**Bibliography:** Sources 21–22 in `PLI_Annotated_Bibliography.md` `(Information)`

**Operating principle — PLI briefs, the SME edits/approves text.** There is no information score, band, or delta.

---

## When this track runs

**Default lane:** Plenum **Instrument of Power** (`actions.mechanism`) — starting map only, not the sole authority. Bundled tools and mislabeled filings must be caught by the agent/SME (see Architecture / track routing).

| Instrument of Power | Information track |
|---------------------|-------------------|
| Informational | **Required** |
| Diplomatic / Economic / Military | Off by default; open as a **secondary facet** only with cited dual-lane evidence (`secondary_facet_citation`), or flag `needs_human` if the Informational label is wrong |

---

## Brief structure (required sections)

The agent returns JSON matching `schemas/info_brief_schema.json` with these text sections:

1. **summary** — 1–2 paragraph plain-language overview of the information environment implications of the action.
2. **audiences** — primary/secondary audiences (domestic, allied, adversary, Global South, sectoral, etc.).
3. **narratives** — frames the action creates, reinforces, or contests (Blue / Red / Green perspectives as relevant).
4. **second_order_effects** — likely second- and third-order information effects (credibility, mobilization, propaganda value, ally messaging friction).
5. **sme_questions** — concrete questions the SME should answer before finalizing White Cell notes.
6. **suggested_sme_edits** — optional bullets the SME might tighten or correct.

Optional: `evidence_notes` citing open-source analogs (no fabricated classified claims).

**Forbidden:** numeric scores, Likert bands, “effectiveness 1–10,” or any field that could be mistaken for adjudication arithmetic.

---

## SME workflow

1. Agent produces brief → status `pending`.
2. SME edits text **in Plenum** (Diplomacy & Information review). After that seat is approved or overridden, TSJ and Verba copy the finalized packet from the SME console into their tools in another window.
3. SME marks `approved` / `overridden` with rationale; approved text is the Information output of record for reports.

---

## Engine / validator role

`tracks/info_brief.py` only checks that required text sections exist and that no numeric score keys are present. It does not alter wording.
