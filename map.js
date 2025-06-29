let drawLayer = new ol.layer.Vector({
    source: new ol.source.Vector()
});

let map = new ol.Map({
    target: 'map',
    layers: [
        new ol.layer.Tile({
            source: new ol.source.OSM()
        }),
        drawLayer
    ],
    view: new ol.View({
        center: ol.proj.fromLonLat([37, 55]),
        zoom: 4
    })
});

// Tool to draw geometry
let draw = new ol.interaction.Draw({
    source: drawLayer.getSource(),
    type: 'Polygon' // или 'Point', 'LineString'
});
map.addInteraction(draw);

function saveGeometry() {
    let features = drawLayer.getSource().getFeatures();
    if (features.length === 0) return;

    const geojson = new ol.format.GeoJSON();
    const json = geojson.writeFeature(features[0]);
    
    console.log(features[0].getGeometry().getType().toLowerCase());
    console.log(json.geometry);

    fetch('/api/geo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: 'My Object',
            type: features[0].getGeometry().getType().toLowerCase(),
            geometryGeoJson: json.geometry
        })
    });
}

// Load existing objects
fetch('/api/geo')
    .then(res => res.json())
    .then(data => {
        const geojson = new ol.format.GeoJSON();
        data.forEach(obj => {
            const feature = geojson.readFeature({
                type: 'Feature',
                geometry: JSON.parse(obj.geometryGeoJson)
            });
            drawLayer.getSource().addFeature(feature);
        });
    });
