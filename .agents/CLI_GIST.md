# CLI gist

- VERIFIED[fixtures] `/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python tools/make_fixtures.py -- input v43` (4.3.0); v52 needs Blender 5.2.2 (dmg from download.blender.org, sha256 checked).
- VERIFIED[browsers] `bunx playwright install chromium` (part of `make setup`).
- VERIFIED[verify w/o git] `find src test e2e tools website vscode-extension/src vscode-extension/test-electron spec README.md ARCH.md Makefile package.json -type f -not -path '*/dist/*' -not -path '*/node_modules/*' > tmp/changed.txt && python3 <plugin>/scripts/vae.py verify --repo . --changed tmp/changed.txt`
- VERIFIED[vscode e2e] `make vscode-e2e` uses /Applications/Visual Studio Code.app (VSCODE_EXECUTABLE overrides) with a throwaway profile in tmp/vscode-test-profile; it opens a VS Code window for ~10 s.
- VERIFIED[scene fixture] `<Blender> -b --factory-startup --python tools/make_scene_fixture.py -- input scene_v43` (4.3.0) and `-- input scene_v52` (5.2.2 dmg, sha256 dc4125399b8bfefe283cc1624d6cfc7809d1cac20ace51072127eb371f31f210).
- VERIFIED[texture fixture] `<Blender 4.3> -b --factory-startup --python tools/make_texture_fixture.py -- input texture_v43`, then delete `input/textures/texture_rough.png` (the fixture packs it; the file must not exist so the packed path is exercised).
