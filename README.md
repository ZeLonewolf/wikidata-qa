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
  nwr["boundary"~"^census|administrative|statistical$"](area.searchArea);
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
type:relation boundary=* place=* hasRole:label parent place=*
```
## Scripts
- `admin2label.js` - Change admin_centre relation roles to label. Command line argument is the path to an OSM file.
- `label_attach.js` - Attaches place nodes as label members to matching boundary relations where there is a 1:1 name match. Takes an OSM file path as argument.
- `propspark.js` - Generates QuickStatements CSV file to add property values to Wikidata items based on OSM tags. Takes an OSM file path, source tag key, and Wikidata property ID as arguments.
- `rolepurge.js` - Removes relation members with a specified role. Takes an OSM file path and role name as arguments.
- `substring_replace.js` - Replaces all occurrences of a substring in a specified OSM tag with a new string. Takes an OSM file path, a tag key, a search string, and a replacement string as arguments.
- `tagspark.js` - Copies values from a specified Wikidata property to a specified OSM tag. Takes an OSM file path, a Wikidata property ID, and an OSM tag key as arguments.
- `tagpatch.js` - Applies recommended tag changes to an OSM file based on a JSON file of recommended changes. Takes an OSM file path and a JSON file path as arguments. The recommended tags JSON file is generated by running `node us-wikidata_qa.js "State Name"` which outputs it to `output/State_Name_recommended_tags.json`.
- `wikidata_find.js` - Adds wikidata tags to OSM elements by matching names with Wikidata entities of a specific type. Takes an OSM file path, key=value pairs (semicolon-separated), and a Wikidata QID for the instance type as arguments.
