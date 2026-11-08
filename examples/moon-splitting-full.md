# Full moon-splitting HTML corpus

Import **`moon-splitting-full.hadith-graph.json`** using **Options → Import JSON**.

This is a version-1 bundle for the current site, containing **244 entries**:

- **195 graphed text witnesses**, from 187 source records across 29 collections, represented by **237 chain entries**.
- **7 appendix texts**, each represented by its supplied authority/source label and matn, with no transmission arrows.

The original small Ibn Masʿūd/Anas sample remains available separately.

## Conversion

Every `narrator_chains` route from the HTML is included in its original witness and route order, followed by the HTML's compiler label. All Arabic matns and narrator labels are copied verbatim. No text is replaced with an editorial expansion, and separate source witnesses with identical wording remain separate. Import applies the app's normal whitespace normalization.

The site supports one chain per report, so a witness with several paths needs several entries. Its repeated matn represents **one shared source text**, not independent wording attestations for each route. Each note identifies the witness, source record, and route. W173 and W180 each supply a second path in `narrator_chains`/`graph_paths` without a matching `branch_details` record; both are retained with an explicit conversion suffix.

The seven appendix texts occupy reports **#238–244**. Their single labels are isolated attributions, not reconstructed isnads. The Qummī label names a source, and the Muṭʿim/Jubayr label retains the HTML's uncertainty. Any supplied partial-chain wording is retained in the notes. The appendix's other 25 entries are research notes or critical route fragments without separate matns; all 32 appendix records are preserved in the companion file.

## Qualifications retained

The HTML's uncertain or discontinuous links are recorded in each affected report's note, including compiler-side gaps. **Version 1 does not support dashed edges**, so those qualifications are not visually encoded in this import. This affects W003, W004, W037, W054, W062–W064, W079, W135, W137, W148, W162, W187–W189. The conversion supplies no missing transmitters.

Source links, original isnad wording, full source records, report kinds, source-status qualifications, branch notes, and additional textual/recension metadata are retained. Source-status descriptions are copied from the HTML; this conversion does not independently re-verify external sources or assign authenticity grades.

Highlights, saved positions, and widths start empty. The site calculates its own layout. This full corpus is substantially larger than the earlier sample.

## Source companion

`moon-splitting-full-source-notes.json` is a reference archive, rather than an import bundle. It contains the original HTML metadata, every witness record, all 32 appendix records, conversion counts, and a report-number index mapping site entries back to their HTML witness or appendix ID.

To regenerate both JSON files from the supplied HTML:

```sh
python scripts/convert-moon-split-html.py /path/to/moon_split_explorer.html
```

The converter reads the embedded `corpus-data` JSON without executing the HTML's JavaScript.
