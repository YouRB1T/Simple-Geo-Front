let drawLayer = new ol.layer.Vector({
            source: new ol.source.Vector()
        });

        let objectsLayer = new ol.layer.Vector({
            source: new ol.source.Vector(),
            style: new ol.style.Style({
                fill: new ol.style.Fill({
                    color: 'rgba(0, 123, 255, 0.2)'
                }),
                stroke: new ol.style.Stroke({
                    color: '#007bff',
                    width: 2
                })
            })
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
            layers: [objectsLayer],
            style: new ol.style.Style({
                fill: new ol.style.Fill({
                    color: 'rgba(255, 0, 0, 0.3)'
                }),
                stroke: new ol.style.Stroke({
                    color: '#ff0000',
                    width: 3
                })
            })
        });
        map.addInteraction(select);

        select.on('select', (e) => {
            console.log('Select event triggered:', e);
            if (e.selected.length > 0) {
                selectedFeature = e.selected[0];
                document.getElementById('delete-btn').disabled = false;
                highlightObjectInList(selectedFeature.getId());
                console.log('Selected feature:', selectedFeature.getId());
            } else {
                selectedFeature = null;
                document.getElementById('delete-btn').disabled = true;
                removeHighlightFromList();
                console.log('No feature selected');
            }
        });

        map.on('click', function(evt) {
            console.log('Map clicked at:', evt.coordinate);
            
            const feature = map.forEachFeatureAtPixel(evt.pixel, function(feature, layer) {
                if (layer === objectsLayer) {
                    return feature;
                }
            });

            if (feature) {
                console.log('Feature found:', feature.getId());
                select.getFeatures().clear();
                select.getFeatures().push(feature);
                
                selectedFeature = feature;
                document.getElementById('delete-btn').disabled = false;
                highlightObjectInList(feature.getId());
            } else {
                console.log('No feature at click point');
                select.getFeatures().clear();
                selectedFeature = null;
                document.getElementById('delete-btn').disabled = true;
                removeHighlightFromList();
            }
        });

        function saveGeometry() {
            const features = drawLayer.getSource().getFeatures();
            if (features.length === 0) {
                alert('Нарисуйте объект на карте!');
                return;
            }

            const objectName = prompt('Введите имя объекта:', 'Новый объект');
            if (!objectName) return;

            const geojson = new ol.format.GeoJSON();
            const featureObject = geojson.writeFeatureObject(features[0]);
            const payload = {
                name: objectName,
                type: features[0].getGeometry().getType().toLowerCase(),
                geometryGeoJson: JSON.stringify(featureObject.geometry)
            };

            console.log('>>> payload to send:', payload);
            console.log('>>> JSON body:', JSON.stringify(payload));

            fetch('http://localhost:8080/api/geo/object/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            .then(response => {
                if (!response.ok) throw new Error('Ошибка сохранения');
                return response.json();
            })
            .then(data => {
                console.log('Объект сохранен:', data);
                drawLayer.getSource().clear();
                loadObjects();
                alert('Объект успешно сохранен!');
            })
            .catch(error => {
                console.error('Ошибка сохранения:', error);
                alert(`Ошибка сохранения: ${error.message}`);
            });
        }

        function deleteObject() {
            if (!selectedFeature) {
                alert('Выберите объект для удаления!');
                return;
            }

            if (!confirm('Вы уверены, что хотите удалить этот объект?')) return;

            const featureId = selectedFeature.getId();
            
            fetch('http://localhost:8080/api/geo/object/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: featureId })
            })
            .then(response => {
                if (!response.ok) throw new Error('Ошибка удаления');
                return response.json();
            })
            .then(data => {
                console.log('Объект удален:', data);
                objectsLayer.getSource().removeFeature(selectedFeature);
                selectedFeature = null;
                document.getElementById('delete-btn').disabled = true;
                removeHighlightFromList();
                loadObjects();
                alert('Объект успешно удален!');
            })
            .catch(error => {
                console.error('Ошибка удаления:', error);
                alert(`Ошибка удаления: ${error.message}`);
            });
        }

        function loadObjects() {
            console.log('Loading objects...');
            fetch('http://localhost:8080/api/geo/objects')
            .then(res => {
                if (!res.ok) throw new Error('Ошибка загрузки объектов');
                return res.json();
            })
            .then(data => {
                console.log('Loaded objects:', data);
                renderObjectsList(data);
                
                const geojson = new ol.format.GeoJSON();
                const source = objectsLayer.getSource();
                source.clear();
                
                data.forEach(obj => {
                    try {
                        const geometry = JSON.parse(obj.geometryGeoJson);
                        console.log('Processing object:', obj.id, geometry);
                        
                        const feature = geojson.readFeature({
                            type: 'Feature',
                            geometry: geometry
                        });
                        
                        feature.setId(obj.id);
                        feature.set('name', obj.name);
                        feature.set('type', obj.type);
                        feature.set('originalData', obj);
                        
                        source.addFeature(feature);
                        console.log('Added feature with ID:', feature.getId());
                    } catch (e) {
                        console.error('Ошибка создания объекта:', obj.id, e);
                    }
                });
                
                console.log('Total features in source:', source.getFeatures().length);
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
                     data-id="${obj.id}">
                    <div class="d-flex w-100 justify-content-between">
                        <h5 class="mb-1">${obj.name}</h5>
                        <small class="badge bg-secondary">${obj.type}</small>
                    </div>
                    <p class="mb-1 text-muted">ID: ${obj.id}</p>
                </div>
            `).join('');
            
            container.querySelectorAll('.object-card').forEach(card => {
                card.addEventListener('click', function() {
                    const id = this.getAttribute('data-id');
                    console.log('Card clicked, ID:', id);
                    selectObjectById(id);
                });
            });
        }

        function selectObjectById(id) {
            console.log('Selecting object by ID:', id, typeof id);
            const source = objectsLayer.getSource();

            let feature = source.getFeatureById(id);
            if (!feature && typeof id === 'string') {
                const numId = parseInt(id);
                if (!isNaN(numId)) {
                    feature = source.getFeatureById(numId);
                }
            }
            if (!feature && typeof id === 'number') {
                feature = source.getFeatureById(id.toString());
            }
            
            if (feature) {
                console.log('Found feature:', feature.getId());
                select.getFeatures().clear();
                select.getFeatures().push(feature);
                
                const extent = feature.getGeometry().getExtent();
                map.getView().fit(extent, {
                    padding: [50, 50, 50, 50],
                    duration: 500,
                    maxZoom: 15
                });

                selectedFeature = feature;
                document.getElementById('delete-btn').disabled = false;
                highlightObjectInList(id);
                
                console.log('Object selected successfully');
            } else {
                console.error('Feature not found with ID:', id);
                console.log('Available features:', source.getFeatures().map(f => ({id: f.getId(), type: typeof f.getId()})));
            }
        }

        function highlightObjectInList(id) {
            removeHighlightFromList();

            const element = document.querySelector(`[data-id="${id}"]`);
            if (element) {
                element.classList.add('selected');
            }
        }

        function removeHighlightFromList() {
            const selectedElements = document.querySelectorAll('.object-card.selected');
            selectedElements.forEach(el => el.classList.remove('selected'));
        }

        function clearSelection() {
            select.getFeatures().clear();
            selectedFeature = null;
            document.getElementById('delete-btn').disabled = true;
            removeHighlightFromList();
        }

        draw.on('drawend', function(event) {
            setTimeout(() => {
            }, 100);
        });

        window.addEventListener('load', () => {
            loadObjects();
        });