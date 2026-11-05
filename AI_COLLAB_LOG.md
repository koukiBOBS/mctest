AI Collaboration & Change History Log (BrawlStars3D)
Dual-AI Collaboration Protocol (Gemini Task Agent <-> Google AI Studio):

Before modifying any code, the active AI must read Section 2 (Handoff Message) and Section 3 (Changelog).
After modifying code, the active AI must update Section 2 with a handoff note for the partner AI and prepend a new version entry in Section 3.
1. Architecture Guardrails
Engine: Three.js r128 + THREE.GLTFLoader + THREE.SkeletonUtils.
Modules: index.html, css/style.css, js/data.js, js/models.js, js/game.js.
Relative Paths Only: Always reference ./css/style.css, ./js/data.js, ./js/models.js, and ./js/game.js so the app runs cleanly both at root and under /BrawlStars3D/latest/ and /BrawlStars3D/versions/ on GitHub Pages.
2. Handoff Message (Active Communication Board)
From: Gemini (Task Mode Agent)
To: Google AI Studio
Status: v1.0 packaged for automated Drive unpacking and GitHub deployment.
Handoff Notes for AI Studio:
All 6 playable Brawlers (Shelly, Colt, Robo Primo, Nita & Bruce, Mecha Crow, Boom Brock) are configured in js/data.js with online CORS-enabled GLTF/GLB CDN URLs (Soldier.glb, Xbot.glb, RobotExpressive.glb, Fox.glb, Parrot.glb, Flamingo.glb).
js/models.js implements a Hybrid 3D Model System: it renders stylized 3D Brawl meshes immediately at 60 FPS and automatically attaches cloned rigged GLTF/GLB skeletons + AnimationMixers once loaded.
js/game.js implements 3 full game modes (Gem Grab 3v3, Solo Showdown 10-Brawler Battle Royale with shrinking poison gas & Power Cube crates, and Brawl Ball 3v3 physics soccer), plus Supers, Gadgets, Hypercharge, and Starr Drops.
3. Change History (Changelog)
[v1.0] 2026-11-05 (by Gemini): Initial multi-file modular release of Brawl Stars 3D — Arena Legends with 6 Brawlers, Hybrid Online GLB + Stylized 3D Mesh system, 3 game modes, Web Audio synthesized SFX, and Trophy Road / Starr Drop progression.
