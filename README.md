# Wikidata QA scripts
Wikidata quality assurance scripts, written in NodeJS

## Boundary utilities

Pre-requisites:
* `npm install axios qs csv-parser csv-writer`

Scripts:

**`bounds_to_csv <OSM ID>`** - Download a .csv file containing the ID and wikidata (if tagged) on all level 7-9 admin boundaries within the specified county or state.

**`wikidata_check <csv filename>`** - Take a bounds_to_csv file and perform wikidata lookup to check for problems. Produces a new csv file with wikidata lookups and QA findings.
