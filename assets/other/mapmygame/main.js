var animals = {
	"elephant": {
		"color": "grey",
		"popup": "Elephant"
	},
	"lion": {
		"color": "orange",
		"popup": "Lion"
	}
}

function dot(lat, long, color, popup) {
	var marker = L.circleMarker([lat, long], {
		"radius": 10,
		"stroke": false,
		"fillOpacity": 1,
		"color": color
	}).bindPopup(popup);
	marker.on('mouseover', function (e) {
		this.openPopup();
	});
	marker.on('mouseout', function (e) {
		this.closePopup();
	});
	return marker;
}

function addCurrentLocation(map) {
	if (navigator.geolocation) {
		navigator.geolocation.getCurrentPosition(function (location) {

			var marker = L.circle([location.coords.latitude, location.coords.longitude], {
				"radius": location.coords.accuracy,
				"color": "blue"
			}).bindPopup("Your location");
			marker.on('mouseover', function (e) {
				this.openPopup();
			});
			marker.on('mouseout', function (e) {
				this.closePopup();
			});

			marker.addTo(map);

			//map.panTo(marker._latlng)
		});
	}
}

function loadTiles() {
	return {
		"Outdoor map": L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
			attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
			maxZoom: 18,
			id: 'mapbox.outdoors'
		}),
		"Street map": L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
			attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
			maxZoom: 18,
			id: 'mapbox.streets'
		}),
		"Dark map": L.tileLayer('http://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
			attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
			maxZoom: 18
		})
	};
}

function loadMSData() {
	return fetch("classified.json").then(x => x.json()).then(data => {
		return data.map(element => {
			element.popup = element.classification.description.captions[0].text
			element.class = element.popup
			return element
		})
	})
}

function loadData() {
	var dataP = loadOurData()


	return dataP.then(data => {
		var grouped = data.reduce(function (r, a) {
			r[a.class] = r[a.class] || [];
			r[a.class].push(a);
			return r;
		}, Object.create(null));
		console.log("Grouped", grouped)
		var result = Object.keys(grouped).map(group => {
			var groupColor = getRandomColor()
			grouped[group] = L.layerGroup(grouped[group].map(key => {
				return dot(key.long, key.lat, groupColor, `${key.popup}<br><img class="popupimage" src="${key.url}"/>`)
			}))
		})
		return grouped;
	})
}

function loadOurData() {

	return fetch("kruger.json").then(x => x.json()).then(data => {
		return data.filter(element => element.prob > 0.6).map(element => {
			element.class = element.class.replace(/_/g, " ")
			element.url = element.photo_url
			element.popup = `${element.class} (${(element.prob * 100).toFixed(0)}%)`
			return element
		})
	})
}

//generateMSData().then(x => document.write(JSON.stringify(x)))


Promise.all([loadData(), loadTiles()]).then(result => {

	var data = result[0];

	console.log("Animals:", data.length)
	console.log("Data:", data)

	var tiles = result[1];

	var mymap = L.map('mapid', {
		zoom: 8,
		preferCanvas: true,
		center: [-23.898160, 31.642785],
		layers: [Object.values(tiles)[0]]//.concat(Object.values(data))
	});

	L.control.layers(tiles, data, {
		"sortLayers": true
	}).addTo(mymap);

	document.getElementById("hideall").onclick = () => {
		document.getElementById("overlay").style.display = "block"
		setTimeout(() => {

			var number = 0;
			Object.values(data).forEach(layer => {
				//number++;
				//console.log("Hiding layer", number, layer)
				mymap.addLayer(layer);
				//mymap.removeLayer(layer);
			})

			document.getElementById("overlay").style.display = "none"
		})
	}


	addCurrentLocation(mymap);
})

function getRandomColor() {
	var letters = '0123456789ABCDEF';
	var color = '#';
	for (var i = 0; i < 6; i++) {
		color += letters[Math.floor(Math.random() * 16)];
	}
	return color;
}
function generateMSData() {

	return fetch("kruger.json").then(x => x.json()).then(x => x.map(y => {
			return {
				"lat": y.lat,
				"long": y.long,
				"url": y.photo_url,
				"title": y.title
			}
		}
	)).then(x => {

		var allPromises = x.map(y => {
			return classify(y.url).then(classified => {
				var copy = Object.assign({}, y);
				copy.classification = classified;
				return copy;
			})
		})

		return Promise.all(allPromises);
	})
}

function classify(url) {
	return fetch("https://westcentralus.api.cognitive.microsoft.com/vision/v1.0/analyze?visualFeatures=Description,Tags&subscription-key=9431b1821a8244dfbeebbe31f00ef10b", {
		"method": "POST",
		"body": JSON.stringify({"url": url}),
		"headers": {
			'Accept': 'application/json',
			'Content-Type': 'application/json'
		}
	}).then(x => x.json())//.then(x => x.tags.filter(y => y.hint === "animal").map(y => y.name))
}