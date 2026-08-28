# Motion Guide — For Claude, By Claude

**Purpose:** This is a standing reference for any Claude instance building or overhauling animations on card-based sites and apps. Read it before touching motion code. It covers the *why* (principles), the *numbers* (tokens), the *how* (implementation patterns, mostly CSS + light JS, framework-agnostic but with React/Framer Motion notes), and an *audit protocol* for improving existing animations without discarding what already works.

Optimize for: **mobile-first, card-based UI**, buttery scroll-snap with a strong sense of inertia, ambient motion that makes the interface feel alive, and springy "liquid glass" responsiveness — all while staying performant (60/120fps, low battery/CPU cost).

---

## 0. How to use this document

1. **Before writing any animation**, check if the project already has documented motion conventions (a style guide, existing keyframes, a motion tokens file, prior instructions in the conversation). If so:
   - Extract their durations, easings, and patterns.
   - Compare against Section 2 (tokens) and Section 8 (audit protocol).
   - Keep whatever isn't actively working against the principles here. Only override values that are objectively worse (linear easing, >600ms micro-interactions, layout-thrashing properties, no reduced-motion handling, missing snap behavior on scrollable card rows, etc).
   - Never silently discard a documented brand-motion decision (e.g. "our modals always slide from the right") — respect the *intent*, upgrade the *execution* (curve, duration, spring feel, performance).
2. **When building fresh**, start from Section 2's tokens, apply Section 3 (card patterns) and Section 4 (scroll-snap + inertia), layer in Section 5 (ambient motion) and Section 6 (liquid-glass springiness), and validate against Section 7 (performance) and Section 9 (checklist) before shipping.
3. Everything here assumes CSS custom properties + `prefers-reduced-motion` support are non-negotiable defaults, not nice-to-haves.
4. **When auditing an existing project's animations, say so out loud only when it's a big deal.** Run the Section 8 checks silently, apply routine tweaks (curve swap, duration retune, adding reduced-motion support, fixing a layout-thrashing property) without narrating each one — those aren't worth a callout. But if the audit concludes an animation should be **dramatically changed or removed outright** (wrong pattern entirely, actively fighting the interaction it's attached to, or working against what the product is trying to do), **say so explicitly and up front**, name the animation, and say why — don't quietly downgrade it or bury the recommendation in a list of minor notes. Silence should mean "only small refinements were made."

---

## 1. Motion Philosophy (synthesized)

Three ideas underpin everything this style of motion does, pulled from modern mobile/spatial design language and the broader motion literature:

1. **Restraint with intent.** Nothing moves without a reason. Motion communicates state change, hierarchy, or feedback — it is never decoration for its own sake. If you can't say *what a given animation is telling the user*, cut it.
2. **Physics over geometry.** Real objects don't move linearly and don't stop instantly. This motion style is almost universally spring- or easing-curve-driven, never `linear`, and rarely a flat `ease`. Motion should feel like it has mass, momentum, and a settling point — this is the literal definition of *inertia* you asked for.
3. **Continuity of space.** Elements don't teleport between states; they transform continuously from A to B (matched geometry, shared-element transitions, scale+fade combos) so the user's mental model of "where did that go" is never broken. This is what makes glassy surfaces, sheet presentations, and icon-to-app transitions feel like one continuous material rather than a cut.
4. **Hierarchy through choreography.** When many things animate at once, they don't all move together — they're staggered and grouped by importance so attention is guided, not overwhelmed.
5. **Speed with legibility.** Fast enough to feel responsive, slow enough to be readable. The typical range for this kind of motion converges tightly: **~150–500ms** for most UI motion, under 200ms for tiny in-place feedback (toggles, taps), 300–500ms for full transitions between screens/major states, and under ~600ms even for the most expressive springs. Nothing in a polished interface should run past ~600ms except deliberate, rare hero moments.

---

## 2. Motion Tokens (the numbers to actually use)

Define these once as CSS custom properties (or your framework's theme/tokens file) and never hardcode raw durations/curves in components again.

```css
:root {
  /* === Durations === */
  --motion-instant: 100ms;   /* toggle flips, checkbox ticks, tiny state flips */
  --motion-fast:    180ms;   /* button press, tap feedback, icon morphs */
  --motion-base:    260ms;   /* card hover/press, small transitions */
  --motion-medium:  380ms;   /* card-to-detail expansion, sheet content swap */
  --motion-slow:    500ms;   /* full screen/page transitions, modal present */
  --motion-hero:    650ms;   /* rare: first-load hero reveals, onboarding */

  /* === Easing curves (cubic-bezier) === */
  /* Standard ease: fast out, gentle settle. Default for most UI motion. */
  --ease-standard: cubic-bezier(0.32, 0.72, 0, 1);
  /* Ease-out: quick start, soft landing — entrances */
  --ease-out-soft: cubic-bezier(0.16, 1, 0.3, 1);
  /* Ease-in: for elements leaving the screen */
  --ease-in-soft: cubic-bezier(0.7, 0, 0.84, 0);
  /* Snappy, slight overshoot-adjacent settle — buttons, toggles */
  --ease-snappy: cubic-bezier(0.22, 1, 0.36, 1);

  /* === Spring physics (for JS-driven springs: Framer Motion, react-spring, CSS @starting-style + linear() approximations) === */
  /* stiffness / damping / mass triples tuned to feel "liquid glass" */
  --spring-gentle:  { stiffness: 210, damping: 26, mass: 1 };    /* card settle, sheet drag release */
  --spring-snappy:  { stiffness: 420, damping: 32, mass: 0.9 };  /* button press, toggle */
  --spring-bouncy:  { stiffness: 300, damping: 18, mass: 1 };    /* playful overshoot: like/heart burst, badge pop */
  --spring-heavy:   { stiffness: 170, damping: 30, mass: 1.4 };  /* big sheets, full-screen cards, modal present */
}
```

**Rules of thumb:**
- If it's a *direct manipulation* (drag, swipe, scroll-linked) → use a **spring**, driven 1:1 by gesture velocity, never a fixed-duration curve. Springs are what make inertia and "liquid" behavior real, not just implied.
- If it's a *programmatic* transition (tap opens a modal, route changes) → use a **cubic-bezier duration token** above. Reserve springs here only for the "arrival" beat (slight overshoot on settle), not the whole transition.
- Never use `linear`, `ease` (the CSS default), or a duration over 600ms for anything that isn't an intentional hero moment.
- One curve family per gesture type across the whole product. Don't mix five different bezier curves for "the same kind of thing" (e.g. every card press should ease identically).

---

## 3. Card-Based Design: Motion Patterns

Since most work will be card UIs, these are the default behaviors to implement unless a project's existing spec says otherwise.

### 3.1 Card entrance (on load / on data arrival)
- Stagger cards in by **index × 40–60ms**, capped around 8–10 visible cards (don't stagger 40 cards one-by-one — cap the stagger group and let overflow enter together or via scroll-reveal, see 3.4).
- Combine **opacity 0→1** with a **small translateY (12–20px → 0)** and optional **scale 0.96→1**. Use `--ease-out-soft`, `--motion-medium`.
- Never slide cards in from off-screen edges by default (feels dated, causes reflow-adjacent jank) — the subtle rise+fade+scale combo is the modern standard pattern (opacity+scale+translateY "natural state transitions").

### 3.2 Card press / tap feedback
- On `pointerdown`: scale to **0.97**, apply a subtle shadow/elevation reduction, spring via `--spring-snappy`. Duration effectively ~120–160ms to the pressed state.
- On release: spring back to 1.0 with a **tiny overshoot** (1.0 → 1.012 → 1.0) using `--spring-bouncy` — this overshoot is what reads as "liquid" rather than "mechanical."
- This must be GPU-only (`transform`, not `width`/`top`/`margin`). See Section 7.

### 3.3 Card → detail expansion (the "hero" transition)
This is the single highest-leverage animation in a card app — get it right and the whole product feels premium.
- Use a **shared-element / FLIP-style transition**: the tapped card should visually *become* the detail view, not be replaced by it. In practice:
  1. Capture the card's current bounding box (`getBoundingClientRect`).
  2. Render the detail view positioned/scaled to exactly match that box.
  3. On the next frame, animate the detail view's transform to its natural full-screen/expanded position while cross-fading in the extra detail content that wasn't in the card.
  4. Background dims/blurs and the surrounding cards scale down slightly (0.96–0.98) and defocus, reinforcing depth (the "background shrinks slightly and darkens" pattern).
- Duration: `--motion-medium` to `--motion-slow` (380–500ms), curve `--ease-standard`, or a `--spring-heavy` if gesture-driven (e.g. drag-to-expand).
- In React: this is exactly what `layoutId` in Framer Motion or the View Transitions API (`document.startViewTransition`) is for — reach for those instead of hand-rolling FLIP math when available.
- Reverse the exact same choreography on dismiss — collapsing back into the originating card, not a generic fade-out. Directional symmetry is a core principle here: state changes should be reversible-looking, not one-way cuts.

### 3.4 Scroll-triggered reveal for below-fold cards
- Use `IntersectionObserver`, not scroll listeners, to trigger entrance for cards as they approach the viewport (rootMargin `"0px 0px -10% 0px"` so they animate slightly before fully visible).
- Same opacity/translateY/scale treatment as 3.1, but per-card as it enters — no need to restagger already-visible cards.
- Only animate an element in **once**; don't re-trigger on scroll-back-up (feels chaotic, hurts performance) unless the design explicitly wants a "re-animate every time" ambient feel for a specific decorative element.

### 3.5 Card hover (large-screen only)
- Lift: `translateY(-4px)` + shadow growth, `--motion-fast`, `--ease-out-soft`.
- Optional subtle scale (1.0 → 1.015) — keep it small; large hover-scale reads as cheap/template-y, not refined.
- Pair with a soft ambient shimmer or highlight-follow-cursor effect only if the product is meant to feel premium/showcase-y (portfolio, product launch page) — skip on utilitarian/dense UI (dashboards, data-heavy cards).

---

## 4. Scroll-Snap & Inertia (mobile priority)

This is the centerpiece you asked for: **the card you stop scrolling on should snap to a focused position, and every scroll interaction should carry a felt sense of momentum.**

### 4.1 Baseline: native CSS scroll-snap
Always start here — it's GPU-accelerated, free, and matches native iOS momentum scrolling out of the box. Only reach for JS-driven scroll physics (4.3) when you need effects native snap can't do (focus-scaling, parallax tied to snap position, cross-fading based on distance-from-center).

```css
.card-rail {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;     /* or 'y mandatory' for vertical feeds */
  scroll-behavior: smooth;           /* only for programmatic scrolls, not needed for touch */
  -webkit-overflow-scrolling: touch; /* legacy but harmless */
  overscroll-behavior-x: contain;
  gap: 16px;
  padding-inline: calc(50% - var(--card-width) / 2); /* centers first/last card */
}

.card {
  scroll-snap-align: center;         /* the "focus" position — use center, not start,
                                         when the goal is spotlighting one card */
  scroll-snap-stop: always;          /* prevents skipping past a card on a fast flick —
                                         critical for the "always land on one card" feel */
}
```

For a **vertical full-bleed card feed** (story/reel-style):
```css
.feed {
  height: 100dvh;
  overflow-y: auto;
  scroll-snap-type: y mandatory;
  overscroll-behavior-y: contain;
}
.feed > .card {
  height: 100dvh;
  scroll-snap-align: start; /* or center if the card is shorter than viewport */
  scroll-snap-stop: always;
}
```

**Key details that make snap feel "inertial" rather than abrupt:**
- Never disable native momentum (don't `preventDefault` touch scroll events unless you're fully replacing the physics yourself — see 4.3).
- `scroll-snap-stop: always` is what gives the "settle on exactly one card no matter how hard you flick" feeling you described — without it, a fast flick can sail past several cards, which reads as chaotic, not inertial.
- Use `scroll-padding` on the container instead of hacky margins when you need snap targets to line up with a header/nav offset.

### 4.2 "Focus" treatment for the snapped card
Once a card is the one centered/snapped, give it visual priority so the snap *feels* like it's spotlighting something, not just stopping:

```css
.card {
  transition: transform var(--motion-base) var(--ease-standard),
              opacity var(--motion-base) var(--ease-standard),
              filter var(--motion-base) var(--ease-standard);
  transform: scale(0.92);
  opacity: 0.6;
  filter: saturate(0.85) brightness(0.95);
}
.card.is-focused {
  transform: scale(1);
  opacity: 1;
  filter: saturate(1) brightness(1);
}
```
Drive `.is-focused` via `IntersectionObserver` with a threshold tuned to "mostly centered" (e.g. `threshold: [0.6, 0.9]` and pick the entry with highest `intersectionRatio`), or — for tighter, continuous coupling to scroll position — via `scroll-timeline`/`animation-timeline: scroll()` where supported, which lets the browser drive the focus scale purely off scroll offset with zero JS and zero jank:

```css
@supports (animation-timeline: scroll()) {
  .card {
    animation: focus-scale linear both;
    animation-timeline: view(x); /* or view(y) for vertical rails */
    animation-range: entry 0% cover 50%;
  }
  @keyframes focus-scale {
    from { transform: scale(0.92); opacity: 0.6; }
    to   { transform: scale(1); opacity: 1; }
  }
}
```
Feature-detect and fall back to the IntersectionObserver approach for browsers without scroll-driven animations support.

### 4.3 When you need true custom inertia (JS-driven)
Use this only when native snap + `scroll-timeline` genuinely can't deliver the feel needed (e.g. a horizontally-dragged carousel that must also respond to a button-triggered "snap to card N" with spring physics, or a coverflow-style rail with 3D depth).

Pattern:
1. Track pointer velocity during drag (delta position / delta time over the last ~80ms window).
2. On release, don't jump to the nearest snap point instantly — feed the release velocity into a spring or decay function (`spring(currentOffset, targetOffset, velocity, {stiffness, damping})`) so the card rail keeps drifting in the direction of the flick before curving into the snap point. This is literally what "inertia" means physically and is the difference between snap feeling *mechanical* vs *alive*.
3. Libraries that do this well out of the box: **Framer Motion's `useDragControls` + `dragTransition={{ power: 0.3, timeConstant: 200 }}`** (decay-based, exactly this pattern), or a small custom spring using the constants in Section 2.
4. Always clamp so a hard flick can't overshoot more than one extra card away from the nearest snap target — feels intentional rather than out of control.

```jsx
// Framer Motion example: draggable card rail with inertial release + snap
<motion.div
  drag="x"
  dragConstraints={{ left: -maxScroll, right: 0 }}
  dragTransition={{ power: 0.35, timeConstant: 220, modifyTarget: (target) => snapToNearestCard(target) }}
  dragElastic={0.08}
/>
```

### 4.4 Rubber-banding at the edges
When a scroll rail hits its start/end, don't hard-stop — allow a small elastic overscroll (`dragElastic: 0.15–0.25` in Framer Motion, or rely on native `overscroll-behavior: auto` + the platform's own rubber-band on iOS Safari). This single detail sells "physical material" more than almost anything else; a well-tuned interface never hard-stops a scroll.

---

## 5. Ambient Motion

You want motion happening even when nobody's touching anything — the interface should feel like it's *breathing*, not static until interacted with. Use ambient motion **sparingly and cheaply** so it never competes with functional animation or burns battery.

Patterns, roughly in order of subtlety → expressiveness:

1. **Micro-breathing on key focal elements.** A hero card, a CTA button, an avatar: scale between 1.0 and 1.015 on an 4–6s ease-in-out loop. Barely perceptible consciously, but reads as "alive."
   ```css
   @keyframes breathe {
     0%, 100% { transform: scale(1); }
     50% { transform: scale(1.015); }
   }
   .hero-card { animation: breathe 5s ease-in-out infinite; }
   ```
2. **Gradient/light drift.** Slowly animate a background gradient's position or a soft radial highlight's offset (10–20s loop, `ease-in-out` or a sine-based JS loop) behind glass/blurred surfaces — this is a huge part of what makes glassy surfaces feel alive rather than like a static frosted PNG.
3. **Parallax on scroll for background layers.** Background blobs/gradients/imagery move at 0.3–0.6× the scroll speed of foreground cards. Do this with `transform: translate3d` tied to scroll position (ideally via `animation-timeline: scroll()` or a rAF-throttled listener — never an unthrottled scroll handler).
4. **Idle micro-motion on icons/illustrations.** SF-Symbols-style icons that get a subtle wobble, a loading dot that pulses, an icon that very slightly floats (translateY ±2px, 3–4s loop).
5. **Cursor/tilt-following light (large screens only).** A soft radial highlight or 3D tilt (max ±4deg) that follows pointer position on a card — throttle via rAF, disable entirely on touch devices (no pointer to follow) and under `prefers-reduced-motion`.

**Ambient motion budget rule:** at any given moment, no more than 2–3 ambient loops should be running simultaneously in the viewport. Stack too many independent breathing/floating loops and the screen reads as anxious/glitchy instead of alive. Vary their periods (don't make everything a 3s loop — use a spread like 4s/6s/9s) so they don't visually sync up into a distracting pulse.

All ambient/looping animation must pause when the tab/view is not visible (`document.visibilityState`) and must respect `prefers-reduced-motion: reduce` by freezing to the resting frame — never fully removing the element, just stopping the loop.

---

## 6. Glass Surface Bounce & Fluidity

The feel you're describing — bouncy, fluid, materially soft — comes from three things working together, not one "bounciness" setting:

1. **Springs, not curves, for anything touched.** Every drag, press, or gesture-driven interaction should terminate in a spring with slight underdamping (damping ratio around 0.7–0.85, i.e. `--spring-bouncy`/`--spring-gentle` above) so it overshoots by a couple of percent and settles rather than stopping dead. This is the #1 lever for "liquid" feel.
2. **Backdrop blur + specular-feeling highlights on glass surfaces**, animated in step with the element's motion — not just a static `backdrop-filter: blur()`. When a glass sheet/card moves or resizes, its blur radius, saturation, and a subtle top-edge highlight should animate along with the transform so the material reads as reactive, not like a frosted sticker.
   ```css
   .glass-surface {
     backdrop-filter: blur(20px) saturate(1.6);
     background: rgba(255,255,255,0.12);
     border: 1px solid rgba(255,255,255,0.25);
     box-shadow:
       inset 0 1px 0 rgba(255,255,255,0.4),
       0 8px 30px rgba(0,0,0,0.12);
     transition: backdrop-filter var(--motion-base) var(--ease-standard),
                 transform var(--motion-base) var(--ease-standard);
   }
   ```
   For genuinely dynamic liquid-glass distortion (content behind the glass subtly warping/refracting as the surface moves), an SVG `<feDisplacementMap>` filter driven by pointer or motion state can be layered in for hero moments — expensive, so use only on 1–2 signature surfaces, not every card.
3. **Continuous, connected transforms, never a hard cut mid-gesture.** If a card is mid-drag and the user releases, the animation must continue from the exact current position/velocity into the spring resolution — never snap back to a start state and re-animate from scratch. This continuity (no discontinuities in position or velocity) is what separates "fluid" from "twitchy."

A useful gut-check: **if you removed all color and just watched the silhouette move, would it look like it has weight and gives a little when it stops?** If everything stops on a dime, it will read as flat no matter how nice the visuals are.

---

## 7. Performance Rules (non-negotiable)

Beauty and speed are not in tension if you animate the right properties.

**Only animate these (compositor-only, no layout/paint cost):**
- `transform` (translate/scale/rotate — use `translate3d`/`scale3d` to force GPU layer even for 2D moves)
- `opacity`
- `filter` (blur/saturate — more expensive than transform/opacity but still compositor-friendly in modern browsers; use sparingly and not on huge elements simultaneously)

**Never animate (cause layout thrash / jank):**
- `width`, `height`, `top`, `left`, `right`, `bottom`, `margin`, `padding`
- If you need a "size change" effect, use `transform: scale()` on a wrapper, or animate a `clip-path`/`mask` instead of true dimensions.

**Additional rules:**
- Apply `will-change: transform` (or `opacity`) only on elements *about to* animate (on hover-intent/pointerdown), and remove it after — leaving `will-change` on permanently bloats GPU memory and can hurt performance on lower-end devices.
- Batch DOM reads and writes; never read `getBoundingClientRect()` inside a loop that also writes styles (forces synchronous layout/"layout thrashing"). Read all measurements first, then write.
- Throttle any scroll/pointermove-driven animation to `requestAnimationFrame` — never let a raw `scroll`/`mousemove` handler write styles directly, dozens of times per frame.
- Prefer CSS animations/transitions and native `animation-timeline: scroll()`/View Transitions over JS-driven animation wherever the effect is achievable natively — the browser's compositor thread will always outperform main-thread JS for the same visual result, and it keeps working even if the main thread is busy (e.g. during data fetch/hydration).
- Cap simultaneous complex effects: don't run `backdrop-filter: blur()` on more than a handful of stacked/overlapping elements at once, and don't run heavy box-shadows during active drag/scroll (swap to a cheaper shadow or none while in motion, restore on settle) — this single trick prevents most scroll-jank on card feeds with elevated cards.
- Test on a throttled/mid-tier mobile profile, not just a dev machine — this kind of motion feels effortless partly because it's tuned against real thermal/CPU constraints, not just designed to look good in a demo.
- Always implement:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```
  Then, where a specific animation is load-bearing for usability (e.g. a progress spinner), give it an explicit reduced-motion-safe fallback rather than letting the blanket rule kill it silently.

---

## 8. Auditing & Overhauling Existing Animation Instructions

When a project already has animation specs (from an earlier prompt, a design system, or existing code), don't bulldoze them. Run this comparison:

| Check | If it fails this guide's baseline... |
|---|---|
| **Curve type** | Linear or CSS default `ease` → replace with the matching token from Section 2 (keep the same *duration* if the project explicitly tuned it, just fix the curve). |
| **Duration** | >600ms on a UI micro-interaction, or <100ms on something that should read as deliberate (modal open) → retune into the ranges in Section 2, preserving the relative ordering the project intended (e.g. if their spec says "cards animate faster than modals," keep cards faster than modals, just bring both into range). |
| **Animated properties** | Anything animating `width`/`height`/`top`/`left`/box layout props → rewrite using `transform`/`clip-path` equivalents that produce the same visual result. |
| **Scroll rails without snap** | A horizontal/vertical card rail with free scroll and no snap-to-card → add `scroll-snap-type`/`scroll-snap-align`/`scroll-snap-stop` per Section 4, unless the project explicitly wants free-scroll browsing (e.g. a dense list where snapping would feel restrictive — respect that if stated). |
| **No reduced-motion support** | Missing `prefers-reduced-motion` handling entirely → always add it, this is never something to skip regardless of prior instructions. |
| **Directional inconsistency** | Sheets/menus that enter from inconsistent directions across the app (e.g. some slide up, some slide from random sides with no logic) → consolidate to one consistent directionality system per the principle in Section 1.3, unless a documented reason distinguishes them (e.g. "contextual menus always emerge from their trigger point" is a valid, keep-able rule). |
| **Everything animates at once** | A screen where 10+ elements all fade/slide in simultaneously with identical timing → introduce staggering (Section 3.1) grouped by importance, preserving which elements the project considered "primary" if that was specified. |
| **No sense of inertia on gesture-driven motion** | Drag/swipe interactions that snap or reset instantly on release with no velocity carry-through → add spring-based release physics per Section 4.3/6, without changing the interaction's fundamental behavior (what it does), only how it *feels* getting there. |
| **Ambient motion missing entirely on a "should feel alive" project** | Static hero sections/cards with zero idle motion → layer in Section 5 patterns at the lowest-cost tier first (breathing, gradient drift) before reaching for anything heavier. |

**Golden rule for overhauls:** preserve *what* the animation communicates and *when* it fires (the project's intent/spec); only upgrade *how* it physically moves (curve, spring, performance, snap behavior, inertia). If a stated instruction directly conflicts with a performance or accessibility rule in Section 7 (e.g. "animate the width for this expand"), fix it silently as part of implementation — don't ship a jank-causing pattern just because it was requested, but do preserve the visual *result* they described.

### 8.1 Flag big changes; stay quiet about small ones

Every row in the table above is a routine fix — make it and move on, no need to itemize it in the response. Reserve an explicit callout for cases that clear a higher bar:

- **The pattern itself is wrong**, not just its tuning — e.g. a hard cut where continuity is called for, a modal that should be a card expansion, a whole ambient loop that's actively distracting rather than atmospheric.
- **An animation fights the interaction it's attached to** — press feedback that fires mid-scroll (see Section 8.2), a transition that interrupts itself on repeated input, motion that fights `scroll-snap` instead of supporting it.
- **An animation works against what the product is trying to do** — heavy, slow motion on something meant to feel instant; playful bounce on something that should read as serious/precise; motion dense enough to undercut the "restraint with intent" principle in Section 1.

When any of these apply: say so plainly, name the specific animation, and give the one-sentence reason — before diving into implementation, not buried after it. Something a person can act on in five seconds: *"The modal's fade-and-scale is fighting your scroll-snap — I'd replace it with a FLIP-style expansion instead of tuning the fade further."* Don't hedge it as a minor note among a list of small tweaks, and don't soften a real recommendation into a tweak just to avoid the conversation.

### 8.2 A recurring bug worth checking for by name: transform collisions

The single most common cause of an animation reading as janky, jumpy, or "moving wrong" on touch is two different states trying to own the same `transform` property on the same element — e.g. a scroll-snap focus scale and a press-feedback scale both writing `transform: scale(...)` on one node. Whichever rule wins the cascade fires as an abrupt jump instead of a smooth composition, and on a touchscreen this often reads as the element shifting sideways rather than just scaling, because the jump happens mid-gesture.

When auditing, check every element that has more than one motion behavior applied to it (focus/defocus + press, drag + hover, entrance + idle ambient loop). If two behaviors both animate `transform` on the same node, split it: one behavior owns the outer element, the other owns an inner wrapper, so the transforms compose through nesting instead of overwriting each other. This is a "dramatically change" situation, not a tweak — flag it per 8.1 rather than patching the timing.

Related: don't let a press/tap effect fire immediately on `pointerdown` for anything that lives inside a scrollable container. The first several pixels of a tap and the first several pixels of a scroll gesture are indistinguishable — trigger the visible press state on `pointerdown`, but track movement and cancel it (no bounce, no click) the moment total movement passes ~8px, rather than letting the element visibly pop while the user is mid-swipe past it.

### 8.3 iOS Safari's native drag ghost (mobile-only, easy to miss in desktop testing)

On real iOS Safari — not visible in desktop browser testing — a long-press-and-move on ordinary styled `<div>` content (cards, image-like gradient blocks, anything visually "picture-like") can trigger the browser's own native drag-and-drop affordance. It spawns a floating, slightly skewed ghost snapshot of the element that detaches from the layout and follows the finger independently of your actual scroll/press JS — it can look exactly like the content is "being dragged" even though none of your code is doing it. It also isn't clipped by a parent's `overflow: hidden`, since it renders as an OS-level drag preview, not DOM content, so it can visibly spill outside a card or phone-frame boundary.

This is a default-on browser behavior, not a bug in a specific animation, so treat it as a baseline requirement rather than something to catch per-project in an audit: any card-based mobile build should set this globally from the start —

```css
*{
  -webkit-user-drag: none;
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
}
```

and give every scroll container an explicit `touch-action` matching its actual axis (`pan-y` for a vertical feed, `pan-x` for a horizontal rail) so the browser never has to guess which gesture a touch belongs to. If a real screen recording shows content that looks like it's peeling off and following the finger with a slight tilt — especially if it briefly renders outside a clipped container — check for this before assuming the scroll-snap or spring logic is at fault.

### 8.4 The single-axis overflow trap (why a snap feed can suddenly become draggable off-axis)

A scroll container that sets `overflow-y: auto` (or `scroll`) but leaves `overflow-x` unset does **not** get `visible` on that axis by default. Per the CSS Overflow spec, if one axis is set to a scrolling value and the other is left at `visible`, the browser is required to force the other axis to behave as `auto` too — visible-plus-scrollable is a disallowed combination. In practice this means a vertical scroll-snap feed silently becomes horizontally scrollable (and thus freely draggable, off its snap grid) the moment anything inside it is even slightly wider than the container — a long label, an annotation chip, an untruncated string, a nested horizontal rail's own scrollbar gutter.

This is dangerous specifically because it's **content-dependent and easy to miss in testing**: a build can scroll perfectly on every screen that happens not to contain anything overflow-wide, then start free-draggable/off-grid the moment a later screen has one wide element — reading exactly like an intermittent, hard-to-reproduce bug rather than what it is (a missing CSS property). The same applies in reverse for a horizontal rail with `overflow-x: auto` and no `overflow-y` set.

Always set both axes explicitly on any scroll-snap container, even when one is meant to do nothing:

```css
.vertical-feed  { overflow-y: auto; overflow-x: hidden; }
.horizontal-rail{ overflow-x: auto; overflow-y: hidden; }
```

Pair this with `overscroll-behavior: contain` on the container so it also can't hand off its edges to a parent/page-level scroll or rubber-band, and double-check `touch-action` on any nested scroll container isn't restricted to only its own axis (`pan-x` alone on a horizontal rail will block a vertical swipe that starts on top of it from ever reaching the vertical feed underneath it — use `pan-x pan-y` on nested rails so both gestures can still resolve to whichever container actually owns that axis).

---

## 9. Pre-Ship Checklist

Before considering any animation work "done," confirm:

- [ ] Every transition uses a token from Section 2 — no ad-hoc durations/curves scattered through the code.
- [ ] Only `transform`, `opacity`, and (sparingly) `filter` are animated; nothing triggers layout.
- [ ] Card rails/feeds have `scroll-snap-type` + `scroll-snap-align` + `scroll-snap-stop: always`, and the snapped/focused card gets a visible focus treatment (scale/opacity/saturation shift).
- [ ] Any drag-to-scroll or swipeable surface carries release velocity into a spring/decay, not an instant snap.
- [ ] Card→detail transitions use shared-element/FLIP/View-Transition continuity, not a hard cut or generic fade.
- [ ] Multi-element entrances are staggered and grouped by importance, capped at a sane group size.
- [ ] At least one, but no more than 2–3, ambient motion loops are present per viewport (breathing, gradient drift, or parallax), each on a distinct period.
- [ ] Glass/blur surfaces animate their material properties (blur/saturation/highlight) in sync with transform changes, not just statically.
- [ ] `will-change` is applied just-in-time and removed after use.
- [ ] Scroll/pointer-driven JS animation is rAF-throttled or replaced with `animation-timeline: scroll()` where supported.
- [ ] `prefers-reduced-motion: reduce` is handled globally, with deliberate fallbacks for load-bearing animations.
- [ ] Tested (or reasoned through) on a throttled/mobile-class performance profile, not just desktop.
- [ ] Existing project animation instructions were compared against Section 8 and intentionally preserved or upgraded — not silently overwritten.
- [ ] No element has two behaviors (focus/press, drag/hover, entrance/idle) both writing `transform` directly on it — split into outer/inner wrappers where that happens (Section 8.2).
- [ ] Press/tap feedback inside any scrollable container cancels itself once pointer movement passes ~8px, instead of firing on raw `pointerdown` (Section 8.2).
- [ ] Global `-webkit-user-drag`, `-webkit-touch-callout`, and `user-select: none` are set, and every scroll container has an explicit `touch-action` (`pan-y`/`pan-x`) — prevents iOS Safari's native drag-ghost from being mistaken for a scroll/animation bug (Section 8.3).
- [ ] Every scroll-snap container sets **both** `overflow-x` and `overflow-y` explicitly (never leaves one at the default `visible`) plus `overscroll-behavior: contain` — otherwise wide content can silently make the container scrollable/draggable on the wrong axis (Section 8.4). Nested rails use `touch-action: pan-x pan-y`, not a single axis, so vertical swipes starting on them still reach the outer feed.
- [ ] If the audit surfaced anything that should be dramatically changed or removed (not just tuned), it was said plainly and up front — not folded into a list of minor notes (Section 8.1).

---

## 10. Quick-Reference Cheat Sheet

```
DURATIONS      100 / 180 / 260 / 380 / 500 / 650 ms   (instant → hero)
DEFAULT CURVE  cubic-bezier(0.32, 0.72, 0, 1)
ENTRANCE       cubic-bezier(0.16, 1, 0.3, 1)
EXIT           cubic-bezier(0.7, 0, 0.84, 0)
SPRING (press) stiffness 420 / damping 32 / mass 0.9
SPRING (drag)  stiffness 210 / damping 26 / mass 1
SPRING (pop)   stiffness 300 / damping 18 / mass 1   ← overshoots, "liquid"
ANIMATE ONLY   transform, opacity, filter
SNAP           scroll-snap-type + align:center + stop:always
STAGGER        40–60ms per item, cap ~8–10
AMBIENT BUDGET 2–3 loops max, staggered periods (4s/6s/9s)
ALWAYS         prefers-reduced-motion handling + rubber-band edges + spring release
```
