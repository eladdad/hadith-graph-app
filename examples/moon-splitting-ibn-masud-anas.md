# Moon-splitting import sample

Import `moon-splitting-ibn-masud-anas.hadith-graph.json` through **Options → Import JSON** in the current site.

This uses the existing `hadith-graph-bundle`, version `1`, with no application changes. It contains **8 text witnesses / source records, represented by 9 chain entries**: 5 Ibn Masʿūd entries from 4 witnesses and 4 Anas ibn Mālik entries from 4 witnesses. All selections are event narratives.

Arabic matn and narrator labels are copied from `corpus-data` in the supplied `moon_split_explorer.html`. Each HTML `narrator_chains` route becomes an `isnad` array, followed by the compiler named in the HTML. The app applies its normal whitespace normalization on import. No additional transmission links or narrator identifications were inferred. Citations and original qualifications are retained in each report note; the underlying external sources were not independently rechecked for this conversion.

| HTML witness | Source | Version-1 entries |
| --- | --- | --- |
| W001 | Ṣaḥīḥ al-Bukhārī 3636 | 1 |
| W002 | Ṣaḥīḥ al-Bukhārī 3869 | 1 |
| W006 | Ṣaḥīḥ al-Bukhārī 4864 [شعبة بن الحجاج]; 4864 [سفيان غير محسوم] | 2 |
| W010 | Ṣaḥīḥ Muslim 2800c | 1 |
| W021 | Ṣaḥīḥ al-Bukhārī 3868 | 1 |
| W024 | Ṣaḥīḥ al-Bukhārī 4868 | 1 |
| W035 | Jāmiʿ al-Tirmidhī 3286 | 1 |
| W172 | Musnad Abī Yaʿlā 3114 | 1 |

## Useful comparisons

- **W006 / Bukhārī 4864 versus W024 / Bukhārī 4868:** Shuʿba, Yaḥyā al-Qaṭṭān, and Musaddad are shared, but Shuʿba's preceding narrator is al-Aʿmash for Ibn Masʿūd and Qatāda for Anas. This exercises the route-context issue.
- **W001 versus W002:** Ibn Masʿūd / Abū Maʿmar branches through Mujāhid and Ibrāhīm al-Nakhaʿī; the wording also differs.
- **W010 / Muslim 2800c:** the closing wording is «اللهم اشهد», whereas other selected Ibn Masʿūd texts use «اشهدوا».
- **W021, W024, W035, W172:** Anas / Qatāda branches through Saʿīd b. Abī ʿArūba, Shuʿba, Maʿmar, and Shaybān; compare the Ḥirāʾ wording, «فرقتين», and «مرتين».

## Conversion details

- W006 supplies two named routes and one shared matn. The current schema needs two report entries; both notes explicitly record that these are one source text. Neither route is discarded.
- The unresolved Sufyān in W006 retains the HTML's qualified Arabic label and is kept distinct from Sufyān b. ʿUyayna in W001.
- The current site merges shared narrators by name and does not provide the HTML's contextual/trie view. This file tests the current representation; it does not add those capabilities.
- Highlights are empty so the sample is ready for manual comparison without pre-assigned wording attributions.
- Positions and widths are unset, allowing the site's existing automatic layout. Use Ctrl + scroll to zoom out; you can then rearrange and highlight the reports and export your work.
- To see a source reference, select its matn card and open the report note beneath it.
