# Wikidata QA scripts
Wikidata quality assurance scripts, written in NodeJS

Currently, these scripts check for problem in municipal-level boundaries (`admin_level=7` through `admin_level=9`).

Link: https://zelonewolf.github.io/wikidata-qa

## Useful links

- [2024 Census Bureau Gazetteer](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer)
- [Census bureau magic decoder ring](https://www.census.gov/library/reference/code-lists/ansi.html)
- [2024 TIGER/Line® Shapefiles: Places](https://www.census.gov/cgi-bin/geo/shapefiles/index.php?year=2024&layergroup=Places)

## Downloading boundary and place node data for a state

To download boundary and place node data for a state, use the following overpass query in JOSM:

```
[out:json][timeout:300];
area["boundary"="administrative"]["name"="NAME_OF_STATE"]["admin_level"=4]->.searchArea;
(
  nwr["boundary"~"^census|administrative$"](area.searchArea);
  rel[type=boundary][admin_level](area.searchArea);
  rel[type=boundary][boundary=place](area.searchArea);
  node[place](area.searchArea);
);
out body;
>;
out skel qt;
```

## Useful JOSM queries

To find boundary relations that have both a label and a (redundant) place node, use the following JOSM query examples (Ctrl+F to find it):

```
type:relation boundary=census place=* hasRole:label
type:relation boundary=administrative admin_level=8 place=* hasRole:label
```
