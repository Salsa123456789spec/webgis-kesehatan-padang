// Initialize Map
const map = L.map('map').setView([-0.947, 100.358], 13); // Centered around Padang

// Add Basemaps
const defaultMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
});

const satelliteMap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri'
});

const terrainMap = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Map data: &copy; OSM, SRTM | Map style: &copy; OpenTopoMap'
});

// Set default map
defaultMap.addTo(map);

// Add Layer Control
const baseMaps = {
    "Peta Default (OSM)": defaultMap,
    "Peta Satelit (Esri)": satelliteMap,
    "Peta Medan (Topo)": terrainMap
};
L.control.layers(baseMaps).addTo(map);



let facilities = [];
let userLocation = null;
let userMarker = null;
let routingControl = null;
let geoJsonLayer = null;
let currentNearestClinic = null;
let currentMinDistance = 0;
let currentRoutingProfile = 'driving';
let searchZoneCircle = null;
let nearestClinicsData = [];
let watchId = null;

// Custom icons
const clinicIcon = L.icon({
    iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

const userLocationIcon = L.icon({
    iconUrl: 'https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

// Function to get opening hours
function getJamOperasional(namaKlinik) {
    if (!namaKlinik) return "Senin - Sabtu: 08.00 - 20.00<br>Minggu: Tutup";
    const n = namaKlinik.toLowerCase();

    if (n.includes('laksmi anas') || n.includes('tyiara bunda') || n.includes('tiara bunda') || n.includes('mutiara medika') || n.includes('permata bunda')) {
        return "Buka 24 Jam Setiap Hari";
    }

    let jadwalSeninSabtu = "08.00 - 20.00";
    let jadwalMinggu = "Tutup";

    if (n.includes('peduli sehat')) {
        jadwalSeninSabtu = "08.00 - 20.00";
    } else if (n.includes('penyejuk')) {
        return "Senin - Jumat: 08.00 - 20.00<br>Sabtu: 07.00 - 19.00<br>Minggu: Tutup";
    } else if (n.includes('arafah')) {
        jadwalSeninSabtu = "09.00 - 19.00";
    } else if (n.includes('tulip persada')) {
        jadwalSeninSabtu = "09.00 - 20.00";
    } else if (n.includes('sehat garuda') || n.includes('permata ibu')) {
        jadwalSeninSabtu = "08.00 - 21.00";
    } else if (n.includes('fauziah medika')) {
        jadwalSeninSabtu = "08.30 - 20.00";
    } else if (n.includes('simpang anduring') || n.includes('simpang anduriang')) {
        jadwalSeninSabtu = "08.00 - 20.30";
        jadwalMinggu = "14.00 - 20.30";
    } else if (n.includes('pratama kota tua') || n.includes('patimura medika') || n.includes('kasih ibu') || n.includes('azimar anas') || n.includes('azimar annas')) {
        jadwalSeninSabtu = "09.00 - 21.00";
    } else if (n.includes('mitra ayu')) {
        jadwalSeninSabtu = "10.00 - 20.00";
    } else if (n.includes('media imani')) {
        jadwalSeninSabtu = "08.00 - 20.00";
        jadwalMinggu = "09.00 - 13.00";
    }

    return `Senin - Sabtu: ${jadwalSeninSabtu}<br>Minggu: ${jadwalMinggu}`;
}

// Fetch GeoJSON data from Node.js API
fetch('/api/klinik?_=' + new Date().getTime())
    .then(response => response.json())
    .then(data => {
        facilities = data.features;
        renderMarkers(facilities);
        
        // Update select dropdown secara dinamis
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.innerHTML = '<option value="">-- Pilih Klinik --</option>';
            facilities.forEach(f => {
                const option = document.createElement('option');
                option.value = f.properties.id;
                option.textContent = f.properties.nama_klinik;
                searchInput.appendChild(option);
            });
        }
    })
    .catch(error => console.error('Error loading GeoJSON:', error));

function renderMarkers(featuresData) {
    if (geoJsonLayer) {
        map.removeLayer(geoJsonLayer);
    }
    
    geoJsonLayer = L.geoJSON({ type: 'FeatureCollection', features: featuresData }, {
        pointToLayer: function (feature, latlng) {
            return L.marker(latlng, { icon: clinicIcon });
        },
        onEachFeature: function (feature, layer) {
            const jamOperasional = getJamOperasional(feature.properties.nama_klinik);
            layer.bindPopup(`
                <b>${feature.properties.nama_klinik}</b><br>
                ${feature.properties.alamat}<br>
                <div style="margin: 8px 0; font-size: 12px; color: #555;">
                    <b>Jam Operasional:</b><br>
                    ${jamOperasional}
                </div>
                <div style="display: flex; gap: 5px; margin-top: 8px;">
                    <button class="btn primary" style="flex: 1; padding: 5px; font-size: 12px;" 
                        onclick="routeToClinic(${feature.properties.id})">
                        🗺️ Rute
                    </button>
                    <button class="btn secondary" style="flex: 1; padding: 5px; font-size: 12px;" 
                        onclick="openReviewModal(${feature.properties.id}, '${feature.properties.nama_klinik.replace(/'/g, "\\'")}')">
                        ⭐ Ulasan
                    </button>
                </div>
            `);
        }
    }).addTo(map);
}

// Search Feature
const searchInput = document.getElementById('search-input');
const btnSearchClinic = document.getElementById('btn-search-clinic');

btnSearchClinic.addEventListener('click', () => {
    const selectedId = searchInput.value;
    
    if (!selectedId) {
        renderMarkers(facilities);
        map.setView([-0.947, 100.358], 13);
        if (routingControl) map.removeControl(routingControl);
        document.getElementById('info-panel').classList.add('hidden');
        currentNearestClinic = null;
        return;
    }

    const clinic = facilities.find(f => f.properties.id.toString() === selectedId);
    if (!clinic) return;
    
    // Tampilkan hanya klinik yang dipilih
    renderMarkers([clinic]);
    
    const coords = clinic.geometry.coordinates;
    map.setView([coords[1], coords[0]], 16);
    geoJsonLayer.eachLayer(layer => {
        if (layer.feature.properties.id === clinic.properties.id) {
            layer.openPopup();
        }
    });

    // Set as current clinic so route can be updated later
    currentNearestClinic = clinic;
    
    // Show route if user location is known
    if (userLocation) {
        currentMinDistance = calculateDistance(userLocation[0], userLocation[1], coords[1], coords[0]);
        showNearestRoute(clinic, currentMinDistance);
    } else {
        // Just show info panel without route
        document.getElementById('info-nama').textContent = clinic.properties.nama_klinik;
        document.getElementById('info-alamat').textContent = clinic.properties.alamat;
        document.getElementById('info-jarak').textContent = '-';
        document.getElementById('info-jam').innerHTML = getJamOperasional(clinic.properties.nama_klinik);
        document.getElementById('info-panel').classList.remove('hidden');
        document.getElementById('route-info').classList.add('hidden');
    }
});

// Haversine formula to calculate straight-line distance
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; 
}

// User Location handling
const btnLocate = document.getElementById('btn-locate');
const btnNearest = document.getElementById('btn-nearest');
const infoPanel = document.getElementById('info-panel');
const routeInfo = document.getElementById('route-info');
const btnUlasanNearest = document.getElementById('btn-ulasan-nearest');
const btnMulaiRute = document.getElementById('btn-mulai-rute');

btnLocate.addEventListener('click', () => {
    if (!navigator.geolocation) {
        alert('Geolocation tidak didukung oleh browser Anda.');
        return;
    }

    btnLocate.innerHTML = '<span class="icon">⏳</span> Mencari...';
    btnLocate.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            userLocation = [lat, lng];

            if (userMarker) {
                map.removeLayer(userMarker);
            }

            userMarker = L.marker([lat, lng], { icon: userLocationIcon }).addTo(map);
            userMarker.bindPopup('<b>Lokasi Anda</b>').openPopup();
            map.flyTo([lat, lng], 14);

            btnLocate.innerHTML = '<span class="icon">📍</span> Arahkan Lokasi';
            btnLocate.disabled = false;
            btnNearest.disabled = false; 

            // Jika sedang melihat sebuah klinik, perbarui rute & jaraknya
            if (currentNearestClinic) {
                const coords = currentNearestClinic.geometry.coordinates;
                currentMinDistance = calculateDistance(lat, lng, coords[1], coords[0]);
                showNearestRoute(currentNearestClinic, currentMinDistance);
            }
        },
        (error) => {
            console.error('Error getting location:', error);
            alert('Gagal mendapatkan lokasi Anda. Pastikan izin lokasi aktif.');
            btnLocate.innerHTML = '<span class="icon">📍</span> Lacak Lokasi Saya';
            btnLocate.disabled = false;
        },
        { enableHighAccuracy: true }
    );
});

// Find nearest facility
btnNearest.addEventListener('click', () => {
    if (!userLocation || facilities.length === 0) return;

    // Clear previous zone and route if any
    if (searchZoneCircle) {
        map.removeLayer(searchZoneCircle);
    }
    if (routingControl) {
        map.removeControl(routingControl);
    }
    document.getElementById('info-panel').classList.add('hidden');

    const facilitiesWithDist = facilities.map(facility => {
        const coords = facility.geometry.coordinates;
        const dist = calculateDistance(userLocation[0], userLocation[1], coords[1], coords[0]);
        return { facility, dist };
    });

    // Sort by distance
    facilitiesWithDist.sort((a, b) => a.dist - b.dist);

    // Get top 3 nearest clinics
    nearestClinicsData = facilitiesWithDist.slice(0, 3);

    if (nearestClinicsData.length > 0) {
        // Draw zone circle based on the furthest of the 3
        const maxDist = nearestClinicsData[nearestClinicsData.length - 1].dist;
        // Distance is in km, L.circle radius is in meters
        searchZoneCircle = L.circle([userLocation[0], userLocation[1]], {
            color: '#007bff',
            fillColor: '#007bff',
            fillOpacity: 0.1,
            radius: maxDist * 1000 + 100 // Add 100 meters padding
        }).addTo(map);

        // Fit map bounds to the circle
        map.fitBounds(searchZoneCircle.getBounds());

        // Display list
        renderNearestList();
        
        // Tampilkan hanya 3 marker klinik tersebut di peta
        const top3Features = nearestClinicsData.map(item => item.facility);
        renderMarkers(top3Features);
    }
});

function renderNearestList() {
    const listPanel = document.getElementById('nearest-list-panel');
    const listContent = document.getElementById('nearest-list-content');
    
    listContent.innerHTML = '';
    
    nearestClinicsData.forEach((item, index) => {
        const div = document.createElement('div');
        div.style.padding = '10px';
        div.style.border = '1px solid #ddd';
        div.style.borderRadius = '5px';
        div.style.cursor = 'pointer';
        div.style.backgroundColor = '#f9f9f9';
        
        const jamOperasional = getJamOperasional(item.facility.properties.nama_klinik);
        div.innerHTML = `
            <strong>${index + 1}. ${item.facility.properties.nama_klinik}</strong><br>
            <span style="font-size: 12px; color: #555;">Jarak: ${item.dist.toFixed(2)} km</span>
            <div style="font-size: 11px; color: #666; margin-top: 4px;">
                Jam Buka: ${jamOperasional.replace(/<br>/g, ', ')}
            </div>
        `;
        
        div.addEventListener('mouseover', () => div.style.backgroundColor = '#eef');
        div.addEventListener('mouseout', () => div.style.backgroundColor = '#f9f9f9');
        
        div.addEventListener('click', () => {
            currentNearestClinic = item.facility;
            currentMinDistance = item.dist;
            
            // Memastikan pin merah (marker) untuk klinik ini ditampilkan di peta
            renderMarkers([item.facility]);
            
            showNearestRoute(item.facility, item.dist);
            
            // Buka popup pin tersebut agar lebih jelas
            geoJsonLayer.eachLayer(layer => {
                if (layer.feature.properties.id === item.facility.properties.id) {
                    layer.openPopup();
                }
            });
            
            // Highlight selected
            Array.from(listContent.children).forEach(child => child.style.borderColor = '#ddd');
            div.style.borderColor = '#007bff';
            div.style.borderWidth = '2px';
        });
        
        listContent.appendChild(div);
    });
    
    listPanel.classList.remove('hidden');
}

btnUlasanNearest.addEventListener('click', () => {
    if (currentNearestClinic) {
        openReviewModal(currentNearestClinic.properties.id, currentNearestClinic.properties.nama_klinik);
    }
});

btnMulaiRute.addEventListener('click', () => {
    if (currentNearestClinic && userLocation) {
        if (!navigator.geolocation) {
            alert('Geolocation tidak didukung oleh browser Anda.');
            return;
        }
        
        // Show overlay
        document.getElementById('nav-overlay').classList.remove('hidden');
        
        // Hide sidebar on mobile (optional, but good for map view)
        if (window.innerWidth <= 768) {
            document.querySelector('.sidebar').style.display = 'none';
        }
        
        // Zoom closely
        map.setView(userLocation, 18);
        
        // Start watching position
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                userLocation = [lat, lng];

                // Update user marker
                if (userMarker) {
                    userMarker.setLatLng([lat, lng]);
                }

                // Update route waypoints
                if (routingControl) {
                    const coords = currentNearestClinic.geometry.coordinates;
                    routingControl.setWaypoints([
                        L.latLng(lat, lng),
                        L.latLng(coords[1], coords[0])
                    ]);
                }
                
                // Keep map centered on user
                map.panTo([lat, lng]);
            },
            (error) => {
                console.error('Error in watchPosition:', error);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
    }
});

document.getElementById('btn-stop-nav').addEventListener('click', () => {
    if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
    }
    
    document.getElementById('nav-overlay').classList.add('hidden');
    
    // Restore sidebar on mobile
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').style.display = 'block';
    }
    
    // Zoom out to show the whole route
    if (routingControl && currentNearestClinic && userLocation) {
        const bounds = L.latLngBounds([
            userLocation,
            [currentNearestClinic.geometry.coordinates[1], currentNearestClinic.geometry.coordinates[0]]
        ]);
        map.fitBounds(bounds, { padding: [50, 50] });
    }
});

document.querySelectorAll('.btn-mode').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-mode').forEach(b => {
            b.classList.remove('active');
            b.style.background = 'white';
            b.style.color = '#333';
            b.style.borderColor = '#ccc';
        });
        const targetBtn = e.target.closest('.btn-mode');
        targetBtn.classList.add('active');
        targetBtn.style.background = '#007bff';
        targetBtn.style.color = 'white';
        targetBtn.style.borderColor = '#007bff';
        currentRoutingProfile = targetBtn.getAttribute('data-profile');
        
        if (currentNearestClinic && currentMinDistance) {
            showNearestRoute(currentNearestClinic, currentMinDistance);
        }
    });
});

function showNearestRoute(clinic, straightLineDistance) {
    const coords = clinic.geometry.coordinates;
    const targetLat = coords[1];
    const targetLng = coords[0];

    document.getElementById('info-nama').textContent = clinic.properties.nama_klinik;
    document.getElementById('info-alamat').textContent = clinic.properties.alamat;
    document.getElementById('info-jarak').textContent = straightLineDistance.toFixed(2);
    document.getElementById('info-jam').innerHTML = getJamOperasional(clinic.properties.nama_klinik);
    infoPanel.classList.remove('hidden');
    routeInfo.classList.add('hidden');

    if (routingControl) map.removeControl(routingControl);

    let serviceUrl = 'https://routing.openstreetmap.de/routed-car/route/v1';
    if (currentRoutingProfile === 'motor') {
        serviceUrl = 'https://routing.openstreetmap.de/routed-bike/route/v1'; // Use bike routing to find shortcuts for motorcycles
    } else if (currentRoutingProfile === 'foot') {
        serviceUrl = 'https://routing.openstreetmap.de/routed-foot/route/v1';
    }

    routingControl = L.Routing.control({
        waypoints: [ L.latLng(userLocation[0], userLocation[1]), L.latLng(targetLat, targetLng) ],
        router: L.Routing.osrmv1({
            serviceUrl: serviceUrl,
            profile: 'driving'
        }),
        routeWhileDragging: false,
        addWaypoints: false,
        fitSelectedRoutes: true,
        showAlternatives: false,
        createMarker: function() { return null; } 
    }).addTo(map);

    routingControl.on('routesfound', function(e) {
        const summary = e.routes[0].summary;
        let timeInSeconds = summary.totalTime;
        
        // Motor uses the 'bike' route to get shortcuts, but OSRM calculates it with bicycle speed (~15km/h).
        // Motorcycles drive around 40km/h, so we multiply the bicycle time by 0.4 to get a realistic motorcycle ETA.
        if (currentRoutingProfile === 'motor') {
            timeInSeconds = timeInSeconds * 0.4;
        }

        document.getElementById('route-distance').textContent = `${(summary.totalDistance / 1000).toFixed(2)} km`;
        document.getElementById('route-time').textContent = `${Math.round(timeInSeconds / 60)} menit`;
        routeInfo.classList.remove('hidden');
    });
}

// Review Modal Logic
const modal = document.getElementById('review-modal');
const closeModalBtn = document.querySelector('.close-modal');
const stars = document.querySelectorAll('.star');
const reviewRatingInput = document.getElementById('review-rating');
const reviewForm = document.getElementById('review-form');
const reviewsContainer = document.getElementById('reviews-container');
let currentEditReviewId = null;

window.routeToClinic = function(id) {
    const clinic = facilities.find(f => f.properties.id === id);
    if (!clinic) return;

    if (!userLocation) {
        if (!navigator.geolocation) {
            alert('Geolocation tidak didukung oleh browser Anda.');
            return;
        }
        alert('Mengambil lokasi Anda saat ini untuk rute...');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                userLocation = [lat, lng];

                if (userMarker) {
                    map.removeLayer(userMarker);
                }

                userMarker = L.marker([lat, lng], { icon: userLocationIcon }).addTo(map);
                userMarker.bindPopup('<b>Lokasi Anda</b>').openPopup();

                btnLocate.innerHTML = '<span class="icon">📍</span> Perbarui Lokasi';
                btnLocate.disabled = false;
                btnNearest.disabled = false;

                executeRouteTo(clinic);
            },
            (error) => {
                console.error('Error getting location:', error);
                alert('Gagal mendapatkan lokasi Anda. Pastikan izin lokasi aktif di browser.');
            },
            { enableHighAccuracy: true }
        );
    } else {
        executeRouteTo(clinic);
    }
}

function executeRouteTo(clinic) {
    currentNearestClinic = clinic;
    const coords = clinic.geometry.coordinates;
    currentMinDistance = calculateDistance(userLocation[0], userLocation[1], coords[1], coords[0]);
    
    // Hide nearest list panel if it was open
    document.getElementById('nearest-list-panel').classList.add('hidden');
    
    // Clear search zone circle if any
    if (searchZoneCircle) {
        map.removeLayer(searchZoneCircle);
        searchZoneCircle = null;
    }
    
    showNearestRoute(clinic, currentMinDistance);
    
    // Fit map bounds
    const bounds = L.latLngBounds([
        userLocation,
        [coords[1], coords[0]]
    ]);
    map.fitBounds(bounds, { padding: [50, 50] });
    
    // Close the popup so the map is clear for routing
    map.closePopup();
}

window.openReviewModal = function(klinikId, klinikNama) {
    document.getElementById('modal-klinik-nama').textContent = klinikNama;
    document.getElementById('review-klinik-id').value = klinikId;
    
    // Reset Form & Edit State
    reviewForm.reset();
    updateStars(0);
    reviewRatingInput.value = '';
    currentEditReviewId = null;
    document.getElementById('review-nama').readOnly = false;
    reviewForm.querySelector('button[type="submit"]').textContent = 'Kirim Ulasan';
    
    // Fetch Reviews
    fetchReviews(klinikId);
    
    modal.classList.remove('hidden');
}

closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
window.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

// Star Rating Interaction
stars.forEach(star => {
    star.addEventListener('click', () => {
        const val = parseInt(star.getAttribute('data-value'));
        updateStars(val);
        reviewRatingInput.value = val;
    });
});

function updateStars(val) {
    stars.forEach(s => {
        if (parseInt(s.getAttribute('data-value')) <= val) s.classList.add('active');
        else s.classList.remove('active');
    });
}

function fetchReviews(klinikId) {
    reviewsContainer.innerHTML = '<p class="text-muted">Memuat ulasan...</p>';
    fetch('/api/ulasan/' + klinikId)
        .then(res => res.json())
        .then(data => {
            if (data.length === 0) {
                reviewsContainer.innerHTML = '<p class="text-muted">Belum ada ulasan untuk klinik ini.</p>';
                return;
            }
            const myReviews = JSON.parse(localStorage.getItem('myReviews')) || [];
            reviewsContainer.innerHTML = data.map(r => {
                const isMine = myReviews.includes(r.id);
                return `
                <div class="review-item" style="position: relative;">
                    ${isMine ? `
                    <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 5px;">
                        <button onclick="editReview(${r.id}, ${r.klinik_id}, ${r.rating}, '${(r.komentar || '').replace(/'/g, "\\'")}', '${r.nama.replace(/'/g, "\\'")}')" style="background: #ffc107; color: #000; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">Edit</button>
                        <button onclick="deleteReview(${r.id}, ${r.klinik_id})" style="background: #dc3545; color: #fff; border: none; padding: 3px 8px; border-radius: 3px; cursor: pointer; font-size: 11px;">Hapus</button>
                    </div>` : ''}
                    <div class="reviewer">${r.nama}</div>
                    <div class="rating">${'&#9733;'.repeat(r.rating)}${'&#9734;'.repeat(5 - r.rating)}</div>
                    ${r.komentar ? `<div class="comment">${r.komentar}</div>` : ''}
                    ${r.foto ? `<div class="photo" style="margin-top: 10px;"><img src="/uploads/${r.foto}" alt="Foto ulasan" style="max-width: 100%; border-radius: 4px;"></div>` : ''}
                    <div class="date">${new Date(r.tanggal).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                `;
            }).join('');
        })
        .catch(err => {
            console.error(err);
            reviewsContainer.innerHTML = '<p class="text-muted" style="color:red">Gagal memuat ulasan.</p>';
        });
}

window.editReview = function(id, klinikId, rating, komentar, nama) {
    currentEditReviewId = id;
    document.getElementById('review-nama').value = nama;
    document.getElementById('review-nama').readOnly = true; // Prevent changing name on edit
    document.getElementById('review-komentar').value = komentar;
    updateStars(rating);
    reviewRatingInput.value = rating;
    reviewForm.querySelector('button[type="submit"]').textContent = 'Update Ulasan';
    
    // Scroll to form
    reviewForm.scrollIntoView({ behavior: 'smooth' });
}

window.deleteReview = function(id, klinikId) {
    if (confirm('Apakah Anda yakin ingin menghapus ulasan ini?')) {
        fetch('/api/ulasan/' + id, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => {
                alert('Ulasan berhasil dihapus.');
                fetchReviews(klinikId);
            })
            .catch(err => {
                console.error(err);
                alert('Gagal menghapus ulasan.');
            });
    }
}

reviewForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const klinik_id = document.getElementById('review-klinik-id').value;
    const nama = document.getElementById('review-nama').value;
    const rating = reviewRatingInput.value;
    const komentar = document.getElementById('review-komentar').value;
    const fotoInput = document.getElementById('review-foto');

    if (!rating) { alert('Silakan pilih rating bintang terlebih dahulu.'); return; }

    const submitBtn = reviewForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Mengirim...';

    if (currentEditReviewId) {
        // Edit Mode
        fetch('/api/ulasan/' + currentEditReviewId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rating, komentar })
        })
        .then(res => res.json())
        .then(data => {
            alert('Ulasan berhasil diperbarui!');
            reviewForm.reset();
            updateStars(0);
            reviewRatingInput.value = '';
            currentEditReviewId = null;
            document.getElementById('review-nama').readOnly = false;
            fetchReviews(klinik_id);
        })
        .catch(err => {
            console.error(err);
            alert('Gagal memperbarui ulasan.');
        })
        .finally(() => {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Kirim Ulasan';
        });
    } else {
        // Create Mode
        const formData = new FormData();
        formData.append('klinik_id', klinik_id);
        formData.append('nama', nama);
        formData.append('rating', rating);
        formData.append('komentar', komentar);
        
        if (fotoInput.files.length > 0) {
            formData.append('foto', fotoInput.files[0]);
        }

        fetch('/api/ulasan', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            alert('Ulasan berhasil ditambahkan!');
            
            // Simpan ID ulasan ke Local Storage browser pengguna
            if (data.id) {
                const myReviews = JSON.parse(localStorage.getItem('myReviews')) || [];
                myReviews.push(data.id);
                localStorage.setItem('myReviews', JSON.stringify(myReviews));
            }

            reviewForm.reset();
            updateStars(0);
            fetchReviews(klinik_id); // Refresh list
        })
        .catch(err => {
            console.error(err);
            alert('Gagal mengirim ulasan.');
        })
        .finally(() => {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Kirim Ulasan';
        });
    }
});
