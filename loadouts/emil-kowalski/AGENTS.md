# Emil Kowalski Design

Use the bundled skills for interface design and motion work in the host project. Reply in the user's language, and treat the project's own design system as the source of truth.

## Pick the skill

- `emil-design-eng` is the default lens for interaction and visual judgment: hierarchy, spacing, typography, states, and the details that decide whether an interface feels considered.
- `animate` and `choreograph` design a motion. `review-animations` audits an existing one against the project's standards, and `improve-animations` turns the audit into a concrete plan.
- `animation-performance` covers compositor-friendly properties, layout thrash, and frame measurement.
- `apple-design` translates Apple's interaction patterns. `gestures` handles drag, dismissal, momentum, and focus. `mobile-native` covers iOS-specific layout and chrome.
- `break-ui` stress-tests a screen with extreme data, long strings, localization, and narrow widths.
- `learn-taste` builds a reference set. `pick-ui-library` chooses a component library before you hand-roll one.

Read the matching `SKILL.md` and its references before starting. Do not infer the skill's rules from this overview.

## Working rules

- Read the project's tokens and component rules first. When a project has a `DESIGN.md` or equivalent, follow it instead of inventing new values.
- Reuse existing components and states. A new primitive needs a reason the current one cannot cover.
- Animate `transform` and `opacity` by default. Keep motion interruptible, shorten or remove it under reduced motion, and never block input on decoration.
- Verify the result in the running app or simulator, at the real size and with real content. A code review alone does not confirm that the motion feels right.
- When a decision changes a token, a rule, or a recurring pattern, write it back to the design document in the same change.
