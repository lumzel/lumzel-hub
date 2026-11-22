# Huashu Design

HTML-native visual design studio for high-fidelity interactive prototypes, 1920x1080 HTML slide decks, timeline-driven animations and video/GIF export, infographics, Xiaohongshu carousels, App Store screenshots, and design critique.

Use the bundled `huashu-design` skill when the user asks for visual design deliverables in HTML (prototypes, UI mockups, slide decks, motion/video, infographics, or design reviews). Reply in the user's conversation language.

- Follow `skills/huashu-design/SKILL.md` and route to the matching module handbook under `references/modules/` before authoring.
- Resolve all helper script and asset paths relative to the `huashu-design` skill root (`$HD`), not the user's project directory.
- Note that preset BGM `.mp3` tracks (`assets/bgm-*.mp3`) and prebuilt showcase previews (`assets/showcases/`) are omitted from the bundled package to stay within Hub size limits; pass custom `--bgm=<path>` or supply audio assets when rendering narrated videos.
