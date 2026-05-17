# Polices embarquées dans le PDF

[Inter](https://rsms.me/inter/) v4.1 sous licence SIL OFL 1.1 (voir [OFL.txt](OFL.txt)).

Les fichiers `Inter-Regular.ttf` et `Inter-Bold.ttf` sont des **sous-sets** Latin + caractères français + symboles utilisés dans la quittance, pour ne pas alourdir inutilement le PDF généré ni le transfert réseau.

| Fichier | Taille full | Taille sous-set | Réduction |
|---|---|---|---|
| Inter-Regular.ttf | 411 KB | ~115 KB | ~72 % |
| Inter-Bold.ttf | 420 KB | ~117 KB | ~72 % |

## Régénérer les sous-sets

Si Inter est mis à jour ou si on a besoin de nouveaux caractères, voici la commande (nécessite Python + [`fonttools`](https://github.com/fonttools/fonttools) — `pip install fonttools`) :

```bash
# Depuis ce dossier, après avoir téléchargé les .ttf complets en Inter-Regular.full.ttf / Inter-Bold.full.ttf
for variant in Regular Bold; do
  pyftsubset Inter-${variant}.full.ttf \
    --output-file=Inter-${variant}.ttf \
    --unicodes="U+0020-007E,U+00A0-00FF,U+0152-0153,U+0178,U+0192,U+02C6,U+02DC,U+2013,U+2014,U+2018-201A,U+201C-201E,U+2020-2022,U+2026,U+2030,U+2039,U+203A,U+20AC,U+2122,U+2190-2193,U+2206,U+220F,U+2211,U+2212,U+221A,U+221E,U+2248,U+2260,U+2264,U+2265" \
    --layout-features='*' --glyph-names --symbol-cmap --legacy-cmap --notdef-glyph \
    --notdef-outline --recommended-glyphs --name-legacy --drop-tables= --name-IDs='*' \
    --name-languages='*'
done
```

Les plages Unicode couvrent : ASCII de base, Latin-1 Supplement (avec accents français `àâçéèêëîïôùûüÿ` + `°«»·`), Latin Extended A pour `œŒŸ`, tirets typographiques, guillemets et apostrophes courbes, `€`, et quelques symboles mathématiques au cas où.

**Important** : Inter n'inclut pas les emojis `✉`/`☎`. Le PDF utilise donc `Email :` / `Tél. :` en clair, pas d'icône.
