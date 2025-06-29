let drawLayer = new ol.layer.Vector({
    source: new ol.source.Vector()
});

let objectsLayer = new ol.layer.Vector({
    source: new ol.source.Vector()
});

let selectedFeature = null;
let map = new ol.Map({
    target: 'map',
    layers: [
        new ol.layer.Tile({
            source: new ol.source.OSM()
        }),
        objectsLayer, 
        drawLayer     
    ],
    view: new ol.View({
        center: ol.proj.fromLonLat([37, 55]),
        zoom: 4
    })
});

let draw = new ol.interaction.Draw({
    source: drawLayer.getSource(),
    type: 'Polygon'
});
map.addInteraction(draw);

let select = new ol.interaction.Select({
    layers: [objectsLayer]
});
map.addInteraction(select);

let current_num_obj = 0;

select.on('select', (e) => {
    if (e.selected.length > 0) {
        selectedFeature = e.selected[0];
        document.getElementById('delete-btn').disabled = false;
    } else {
        selectedFeature = null;
        document.getElementById('delete-btn').disabled = true;
    }
});

function saveGeometry() {
    const features = drawLayer.getSource().getFeatures();
    if (features.length === 0) return;

    const objectName = prompt('Введите имя объекта:', 'Новый объект');
    if (!objectName) return;

    const geojson = new ol.format.GeoJSON();
    const json = geojson.writeFeature(features[current_num_obj]);
    
    fetch('/object/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: objectName,
            type: features[current_num_obj].getGeometry().getType().toLowerCase(),
            geometryGeoJson: json.geometry
        })
    })
    .then(response => {
        if (!response.ok) throw new Error('Ошибка сохранения');
        drawLayer.getSource().clear();
        loadObjects();
    })
    .catch(error => {
        console.error('Ошибка сохранения:', error);
        alert(`Ошибка сохранения: ${error.message}`);
    });

    console.log(features[current_num_obj]);
    current_num_obj++;
}

function deleteObject() {
    if (!selectedFeature) {
        alert('Выберите объект для удаления!');
        return;
    }

    if (!confirm('Вы уверены, что хотите удалить этот объект?')) return;

    const featureId = selectedFeature.getId();
    
    fetch('/object/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: featureId })
    })
    .then(response => {
        if (!response.ok) throw new Error('Ошибка удаления');
   
        objectsLayer.getSource().removeFeature(selectedFeature);
        selectedFeature = null;
        document.getElementById('delete-btn').disabled = true;
        
        loadObjects();
    })
    .catch(error => {
        console.error('Ошибка удаления:', error);
        alert(`Ошибка удаления: ${error.message}`);
    });
    current_num_obj--;
}

function loadObjects() {
    fetch('/objects')
    .then(res => {
        if (!res.ok) throw new Error('Ошибка загрузки объектов');
        return res.json();
    })
    .then(data => {
        renderObjectsList(data);
        
        const geojson = new ol.format.GeoJSON();
        const source = objectsLayer.getSource();
        source.clear();
        
        data.forEach(obj => {
            try {
                const feature = geojson.readFeature({
                    type: 'Feature',
                    geometry: JSON.parse(obj.geometryGeoJson),
                    id: obj.id
                });
                source.addFeature(feature);
            } catch (e) {
                console.error('Ошибка создания объекта:', e);
            }
        });
    })
    .catch(error => {
        console.error('Ошибка:', error);
        document.getElementById('objects-list').innerHTML = `
            <div class="alert alert-danger">
                Не удалось загрузить объекты: ${error.message}
            </div>
        `;
    });
}

function renderObjectsList(objects) {
    const container = document.getElementById('objects-list');
    
    if (objects.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info">
                Нет сохраненных объектов
            </div>
        `;
        return;
    }
    
    container.innerHTML = objects.map(obj => `
        <div class="list-group-item object-card p-3 mb-2" 
             data-id="${obj.id}"
             onclick="selectObjectById(${obj.id})">
            <div class="d-flex w-100 justify-content-between">
                <h5 class="mb-1">${obj.name}</h5>
                <small>${obj.type}</small>
            </div>
            <p class="mb-1">ID: ${obj.id}</p>
        </div>
    `).join('');
}

function selectObjectById(id) {
    const source = objectsLayer.getSource();
    const feature = source.getFeatureById(id);
    
    if (feature) {
        select.getFeatures().clear();
        select.getFeatures().push(feature);
        
        const extent = feature.getGeometry().getExtent();
        map.getView().fit(extent, {
            padding: [50, 50, 50, 50],
            duration: 500
        });
    }
}

window.addEventListener('load', () => {
    loadObjects();
});