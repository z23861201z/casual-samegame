# ATTRIBUTION · Gate Runner

## Quaternius — Zombie Apocalypse / Post Apocalypse Pack (CC0)

- Author: [Quaternius](https://quaternius.com/)
- Pack page: https://quaternius.com/packs/zombieapocalypsekit.html
- Poly Pizza bundle: https://poly.pizza/bundle/Post-Apocolypse-Pack-jg0We8Clu0
- License: **CC0 / Public Domain** (free for personal and commercial use; attribution appreciated, not required)
- Formats used: glTF / GLB from poly.pizza CDN (`static.poly.pizza`)

### Models vendored under `assets/gltf/`

| File | Source model |
|------|----------------|
| `sam.glb` | Characters Sam |
| `matt.glb` | Characters Matt (downloaded; player uses Sam) |
| `zombie.glb` / `zombie-b.glb` | Zombie |
| `zombie-half.glb` | Zombie half |
| `big-arm.glb` | Big arm |
| `street-straight.glb` / `street-straight-crack.glb` | Street Straight / Crack |
| `traffic-barrier.glb` / `plastic-barrier.glb` | Traffic / Plastic Barrier |
| `barrel.glb` | Barrel |
| `traffic-cone.glb` | Traffic Cone |
| `street-light.glb` | Street Light |
| `fire-hydrant.glb` | Fire Hydrant |
| `trash-bag.glb` | Trash Bag |
| `container-green.glb` | Container Green |
| `pallet.glb` | Pallet |
| `rifle.glb` | Rifle |

## Quaternius — Ultimate Monsters (CC0)

- Pack page: https://quaternius.com/packs/ultimatemonsters.html
- Poly Pizza bundle: https://poly.pizza/bundle/Ultimate-Monsters-Bundle-5oyGWAmOB6
- License: **CC0 / Public Domain**

| File | Source model | Poly Pizza |
|------|----------------|------------|
| `orc.glb` | Orc | https://poly.pizza/m/5vO2YJsPEf |
| `demon.glb` | Demon | https://poly.pizza/m/Mo2ky6vkf8 |
| `yeti.glb` | Yeti | https://poly.pizza/m/ceRHrn8HHE |
| `dragon-evolved.glb` | Dragon Evolved | https://poly.pizza/m/LlwD0QNUPj |

Animations used for Boss Dragon Evolved: `Punch` / `Headbutt` (attack), `HitReact`, `Death`, plus `Flying_Idle`.

See `assets/gltf/manifest.json` for poly.pizza model IDs and source URLs.

### Re-download

```bash
# from games/gate-runner/
bash scripts/download-quaternius.sh
```

Optional full official Drive folder (Post Apocalypse):  
https://drive.google.com/drive/folders/1mWP6sCHun7OUMHQeDNZLrXTteXlzWg_t

## Three.js

- https://threejs.org/ — MIT License
- Loaded at runtime via jsDelivr ESM import map (`three@0.170.0`) including `EffectComposer` / `UnrealBloomPass`.

## Code

Original game code in this folder is MIT, same as the repository.
