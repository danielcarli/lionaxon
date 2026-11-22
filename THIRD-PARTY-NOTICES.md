# Third-party notices

LionAxon includes the following free software. Each keeps its own licence.

| Component | Version | Licence | Where |
|---|---|---|---|
| [polygon-clipping](https://github.com/mfogel/polygon-clipping) (Mike Fogel and contributors) | 0.15.7 | MIT | `src/vendor/polygon-clipping/` (boolean operations on polygons: subtractions) |
| [splaytree](https://github.com/w8r/splay-tree) (Alexander Milevski), inside polygon-clipping | 3.2.4 | MIT | bundled in `polygon-clipping.mjs` |
| [robust-predicates](https://github.com/mourner/robust-predicates) (Vladimir Agafonkin), inside polygon-clipping | 3.0.3 | Unlicense | bundled in `polygon-clipping.mjs` |
| [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans) (Tokotype) | — | SIL Open Font License 1.1 | `src/workbench/browser/media/fonts/` (interface and sheets) |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) (JetBrains) | — | SIL Open Font License 1.1 | `src/workbench/browser/media/fonts/` (numbers in the interface, mono labels) |
| [Archivo Narrow](https://github.com/Omnibus-Type/ArchivoNarrow) (Omnibus-Type) | — | SIL Open Font License 1.1 | `src/workbench/browser/media/fonts/` (condensed labels) |
| [Source Serif 4](https://github.com/adobe-fonts/source-serif) (Adobe) | — | SIL Open Font License 1.1 | `src/workbench/browser/media/fonts/` (serif labels) |
| [Architects Daughter](https://fonts.google.com/specimen/Architects+Daughter) (Kimberly Geswein) | — | SIL Open Font License 1.1 | `src/workbench/browser/media/fonts/` (handwritten labels) |
| [Electron](https://www.electronjs.org) | 45 | MIT | the runtime of the app (not in this repository) |

The full licence texts are in `src/vendor/polygon-clipping/LICENSE.md` and in the `OFL-*.txt` files next to the fonts.
The sheets you export embed Plus Jakarta Sans and the fonts of the labels they use (PDF and PNG); the OFL allows it.
