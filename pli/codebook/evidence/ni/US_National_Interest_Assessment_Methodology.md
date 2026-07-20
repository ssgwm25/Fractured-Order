# U.S. National Interest Assessment Methodology

**Statecraft Simulations Group · Research Layer (game-agnostic)**  
**July 2026**  
**Location:** `National Security Strategy Folder/`

**Evidence base:** `NSS_Interest_Matrix.xlsx`, NSS corpus (1993–2025), National War College primer (`2025 NWC NSS Primer copy.pdf`)

**Application:** See `Fractured Order 2.0/design/adjudication/FO2.0_NI_Adjudication_Spec.md`

---

## Purpose

This document defines **what** U.S. national interests are and **how** to assess tier movement using NSS language and National War College adjudication grammar. It contains no simulation mechanics, dashboard rules, or game-specific calibration.

---

## Six Interest Domains

NSS documents rarely label interests *vital*, *major*, or *peripheral*. They emphasize **objectives** and **regional priorities**. These six domains distill bipartisan NSS language (1993–2025).

| ID | Domain | Definition |
|----|--------|------------|
| **NI-1** | **Homeland & Strategic Access** | Protection of the American people, territory, and critical infrastructure; energy and strategic supply access; force posture adequate to deny catastrophic harm. |
| **NI-2** | **Economic Prosperity & Tech Leadership** | U.S. competitiveness, jobs, innovation, industrial capacity, and leadership in sectors that define long-run power. |
| **NI-3** | **Alliance / Partner Credibility** | Willingness of allies and partners to align with U.S. policy, share burden, and resist hedging toward adversaries or alternative blocs. |
| **NI-4** | **Indo-Pacific Stability & Deterrence** | Regional balance that prevents PRC coercion, preserves Taiwan-related supply chains, and avoids uncontrolled escalation. |
| **NI-5** | **Rules / Market Integrity / Reciprocity** | U.S. ability to shape standards, trade rules, financial architecture, and nonproliferation norms; enforce reciprocity. |
| **NI-6** | **Domestic Political Sustainability** | Congressional and public support; industry acceptance; avoidance of self-inflicted economic shock that undermines policy continuity. |

Full era-by-era NSS citations: **NSS Interest Matrix** (sheet: Interest Matrix; Clinton 1994 detail sheet).

---

## Orientation Priors (analytic)

When mapping policy actions to domains, typical priors by strategic orientation:

| Orientation | Primary domains (typical) | Effect horizon |
|-------------|---------------------------|----------------|
| **Pressure** | NI-4, NI-3, NI-5 | Immediate |
| **Stabilization** | NI-3, NI-1, NI-6 | Medium (1–2 years) |
| **Reframing** | NI-2, NI-5, NI-4 | Long (2–4 years) |

---

## National War College Tier Rubric

**Source:** National War College / National Defense University, *A National Security Strategy Primer* (local working copy: `2025 NWC NSS Primer copy.pdf`). Presidential NSS texts do **not** apply these labels systematically; practitioners use them as **adjudication grammar**.

### Tier definitions

| Tier | National War College definition (paraphrased) | Use |
|------|-------------------------------------------|-----|
| **Vital** | State would bear **nearly any cost and risk** to protect — including significant war risk. | Assign **+2 / −2** tier deltas **sparingly**. |
| **Important / Major** | State would be **weakened** if it did not act; costs carefully weighed. | Default **+1 / −1** tier deltas. |
| **Peripheral** | Desirable only if costs and risks are **extremely limited**. | **0** unless trivially low-cost. |

### Tier delta codes (per domain)

| Code | Meaning |
|------|---------|
| **+2** | Advances vital-level stake in domain |
| **+1** | Supports major interest — clear net gain if credible |
| **0** | Neutral or offsetting second-order effects |
| **−1** | Weakens major interest |
| **−2** | Damages vital-level stake |

### Threat cross-check

For high-magnitude negative assessments:

**Threat = Capability (adversary) × Will (adversary) × Vulnerability (U.S.)**

High escalation with negative NI-3 often indicates alliance credibility damage even when NI-2 appears positive.

---

## Bipartisan Commonalities (30+ years)

1. Economic strength and prosperity  
2. Alliance and partner credibility  
3. Military readiness / homeland protection  
4. Nonproliferation and WMD risk  
5. Regional stability (Indo-Pacific rising post-2010)  
6. American leadership in shaping international rules  

## PRC Framing Evolution (corpus summary)

| Period | Typical framing |
|--------|-----------------|
| **1993–1999** | Reform opportunity; engagement; prevent China as regional threat |
| **2002–2006** | Military modernization concern; some partnership language |
| **2010–2015** | Rising power; manage competition |
| **2017–2025** | Revisionist / pacing competitor; economic competition first |

Clinton 1994 (*Engagement and Enlargement*) is the historical floor — not the default lens for post-2017 competitive-stability scenarios.

---

## Related Files

| File | Role |
|------|------|
| `NSS_Interest_Matrix.xlsx` | Domain × NSS year matrix |
| `build_nss_interest_matrix.py` | Regenerate matrix |
| `FO2.0_NI_Adjudication_Spec.md` | Fractured Order 2.0 application (in FO2.0 repo) |
