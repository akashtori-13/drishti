# VIDEO BRAIN — must read before any video work

This folder (`video/`) is the brain for all video production. Start here,
then `docs/VIDEO.md` (240-second event cut) for constraints.

> **Scope note:** the framework below is written for long-form technical
> documentaries. Our shipped event cut is 240 seconds (`docs/VIDEO.md`) —
> use this skill for structure, stakes, and visuals; compress the 8-act arc
> to hook → primer → hurdle → payoff → impact when cutting short-form.

# Skill Specification: Hard-Tech Documentary & Breakthrough Discovery Framework (`skill.md`)

> **Purpose:** A master blueprint for scripting and producing long-form, high-retention technical documentaries. This framework combines maverick character arcs, multi-stage engineering obstacles, intuitive visual analogies, and physical artifact storytelling—modeled after Veritasium’s Blue LED documentary.

---

## 1. Executive Directives & Persona

* **Narrative Style:** High-stakes scientific biography meets technical investigation. Combines rigorous physics/engineering with human drama, corporate conflict, and underdog persistence.
* **Core Conflict Engine:** **Maverick Outlier vs. Industry Consensus.** Frame the breakthrough not as a lucky guess, but as an isolated individual defying multi-billion-dollar consensus and bureaucratic orders.
* **Visual Principle (Tactile Realism):** Never explain a physical concept with pure text or abstract voiceover alone. Pair every abstract principle with a physical handheld prop, a 3D structural animation, or archival evidence.

---

## 2. Narrative Arc Structure (The 8-Act Arc)

### Act 1: The Invisible Everyday Miracle & The Impossible Wall (0%–8%)
* **Narrative Goal:** Hook the audience using an everyday object everyone takes for granted, then reveal the massive historical/scientific impossibility behind it.
* **Script Pattern:**
  * Show a physical object in hand (e.g., a transparent LED casing emitting colored light).
  * Establish the "Missing Link": Red and Green existed, but without Blue, full-spectrum light (White) was impossible.
  * State the scale of failure: 30 years, thousands of top corporate researchers (IBM, Bell Labs, GE), hundreds of millions of dollars wasted, leading to the industry consensus that it was impossible.

### Act 2: The Physical & Quantum Primer (8%–25%)
* **Narrative Goal:** Give the audience the exact mental model needed to understand the technical breakthrough later in the video.
* **Analogy Mechanics:** Translate complex physics into everyday spatial metaphors.
  * *Example:* Explain energy levels and band gaps using a **hockey stadium seating hierarchy** (Valence Band = ground seats, Conduction Band = balcony level, Band Gap = empty space between levels).
* **Rule:** Keep explanations visual, step-by-step, and grounded in basic mechanics (e.g., N-type doping adding extra electrons, P-type doping creating positive holes).

### Act 3: The Underdog Maverick & The Scrapped Lab (25%–35%)
* **Narrative Goal:** Introduce the human protagonist and establish extreme underdog status.
* **Character Framing:**
  * **Low Status / High Grit:** Isolated lab, scavenged and self-welded equipment, frequent explosions, lack of academic prestige/PhD, disrespected by elite peers.
  * **The High-Stakes Gamble:** A failing small company (Nichia) risking a huge portion of its budget on a desperate moonshot proposal.

### Act 4: The Core Technical Hurdles — The 3 Escalating "Boss Battles" (35%–70%)
* **Narrative Goal:** Structure the scientific journey as three sequential, increasingly difficult obstacles that defeated everyone else.

1. **Hurdle 1 (Material Science):** Choosing the disfavored material (Gallium Nitride vs. Zinc Selenide) and solving crystal lattice mismatch using custom hardware modifications (Two-Flow MOCVD reactor).
2. **Hurdle 2 (Chemical Physics):** Solving the P-type doping puzzle by discovering that hydrogen atoms were blocking acceptor holes, then using thermal annealing to free them.
3. **Hurdle 3 (Quantum Engineering):** Boosting light output power from micro-watts to high efficiency by forcing immiscible materials (Indium + GaN) to form active quantum wells and adding blocking layers.
* **Pacing Directive:** Intercut technical victories with escalating corporate pushback (e.g., CEO sending explicit memo orders to *"Stop work immediately"* that the protagonist crumples up and ignores).

### Act 5: The Eureka Sequence & Climax of Creation (70%–75%)
* **Narrative Goal:** Deliver the sensory payoff of the discovery.
* **Visual & Audio:** Show the bright blue emission (450 nm, 1500 µW output) glowing intensely in the room.
* **Emotional Beat:** Contrast the protagonist's quiet personal triumph ("I felt like I had reached the top of Mount Fuji") with the industry's total shock.

### Act 6: Commercial Disruption & Planetary Impact (75%–85%)
* **Narrative Goal:** Expand the scale from a single laboratory result to global transformation.
* **Data Metrics:** Show the rapid market shift (e.g., 1% of lighting in 2010 to >50% in 2022), energy efficiency gains, and carbon emission reductions (1.4 billion tons of $CO_2$ saved).

### Act 7: The Tragic IP Conflict & Corporate Exploitation (85%–92%)
* **Narrative Goal:** Inject real-world grit and bitterness to avoid a cliché Hollywood happy ending.
* **The Exploitation Paradox:** The company makes billions, while the inventor receives a trivial $170 patent bonus.
* **The Legal Battle:** Follow the inventor’s exit, countersuit, pyrrhic legal victory ($8M settlement consumed by legal fees), and strained personal relationships.

### Act 8: Laboratory Realism & Philosophical Epilogue (92%–100%)
* **Narrative Goal:** Ground the final thoughts in live, authentic laboratory interactions and a lingering thesis on human problem-solving.
* **In-Person Interview:** Transition to a live interview in the inventor's current lab (inspecting next-gen Micro-LEDs / UV LEDs / Fusion projects).
* **Concluding Philosophical Thesis:** Reframe the story from "knowing the most physics" to **relentless determination, critical thinking, and non-conformity in the face of consensus**.

---

## 3. Visual Artifacts & Motion Production Guide

To replicate this visual storytelling style, integrate four distinct classes of visual artifacts throughout the script:

| Visual Artifact Category | Specific Examples from Video | Production & Motion Graphics Directive |
| :--- | :--- | :--- |
| **1. Physical Handheld Props** | • Transparent vs. colored LED casings [00:00:00]<br>• Incandescent light bulbs vs. LED bulbs [00:03:29]<br>• Silicon wafers and Micro-LED chips [00:29:28] | Host holds physical objects directly in front of the camera to anchor theoretical concepts in tangible reality. |
| **2. 3D Schematic & Physics Animations** | • Hockey stadium balcony metaphor for Valence/Conduction Bands [00:00:15]<br>• PN Junction depletion zone and photon creation [00:07:50]<br>• Substrate crystal lattice mismatch (Sapphire vs GaN 16% gap) [00:13:16]<br>• MOCVD gas flow dynamics (turbulent single flow vs. laminar two-flow gas pinning) [00:16:48]<br>• Hydrogen atom bonding/release during thermal annealing [00:20:36] | Clean 3D motion graphics using clear spatial metaphors. Use floating particle effects for electrons/holes and geometric grids for crystal structures. |
| **3. Archival & Historical Evidence** | • 1960s GE/Monsanto LED advert clippings [00:00:13]<br>• B-roll of 1970s calculators, stereos, and indicators [00:00:35]<br>• Corporate cease-and-desist notes & internal letters [00:00:13]<br>• Historical conference photos (Akazaki, Amano, Maruska) [00:14:06] | Layer vintage paper textures, archival photo pans, bold quote overlays, and document highlight effects. |
| **4. Live Cinematography & Lab Artifacts** | • Macro lens close-ups of self-welded MOCVD equipment [00:02:30]<br>• Laboratory wafer inspection under microscopes [00:29:40]<br>• Direct candid interview footage with the scientist [00:24:00] | High-contrast macro shots of hardware, real workbench tools, and dynamic over-the-shoulder interview framing. |

---

## 4. Dialogue Polish & Script Rules

* **Concrete Metrics over Vague Scale:** Never say *"It was extremely bright"* or *"It took a long time"*. Say *"It produced 1,500 microwatts of light at 450 nanometers—over 100 times brighter than previous prototypes"*.
* **Direct Human Conflict:** Quote internal memos and rival scientists directly (*"Gallium nitride has no future"*, *"Stop work on gallium nitride immediately"*).
* **Anti-AI Tone Filter:** Remove passive academic summaries. Use active verbs, personal stakes, and narrative tension (*"Out of spite, he published his paper without company knowledge"*).

---

## 5. Production & Scripting Checklist

| Section | Target Beat | Mandatory Execution Checklist |
| :--- | :--- | :--- |
| **Opening (0–3 min)** | Hook & Gap | [ ] Physical prop demo in hand.<br>[ ] Establish why the problem was deemed impossible. |
| **Theory (3–10 min)** | Physics Primer | [ ] 3D stadium/balcony visual analogy for band gaps.<br>[ ] Step-by-step PN junction animation. |
| **Character (10–18 min)** | Maverick Setup | [ ] Scavenged hardware & isolated lab visual artifacts.<br>[ ] Clear state of corporate risk ($3M gamble). |
| **Climax (18–26 min)** | The 3 Hurdles | [ ] Two-flow reactor gas animation.<br>[ ] Hydrogen detachment chemical animation.<br>[ ] InGaN quantum well visual stack. |
| **Ending (26–33 min)** | IP Conflict & Future | [ ] Patent payout vs. revenue visual comparison.<br>[ ] Live lab interview / next-gen research teaser. |
