/**
 * BLE communication module for ENAV
 * This file should handle all the BLE communication with the ESP32
 */

let bleDevice;
let bleServer;
let bleServiceUuid = "0000ffe0-0000-1000-8000-00805f9b34fb";
let txCharacteristicUuid = "0000ffe1-0000-1000-8000-00805f9b34fb";
let rxCharacteristicUuid = "0000ffe2-0000-1000-8000-00805f9b34fb";
let txCharacteristic;
let rxCharacteristic;

let map, marker;
let isFirstPOIUpdate = true; // Track if this is the first POI update

// Initialize the map
function initializeMap() {
    map = L.map('map').setView([0, 0], 2); // Default view at [0, 0]
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    marker = L.marker([0, 0], { draggable: true }).addTo(map);
    marker.bindPopup("Drag or click on the map to set POI").openPopup();

    // Update text boxes when the marker is dragged
    marker.on('dragend', () => {
        const latLng = marker.getLatLng();
        document.getElementById('poiLat').value = latLng.lat.toFixed(6);
        document.getElementById('poiLon').value = latLng.lng.toFixed(6);
    });

    // Move the marker when the map is clicked
    map.on('click', (event) => {
        const { lat, lng } = event.latlng;
        marker.setLatLng([lat, lng]);
        document.getElementById('poiLat').value = lat.toFixed(6);
        document.getElementById('poiLon').value = lng.toFixed(6);
    });
}

// Update the connection status icon
function updateConnectionStatus(connected) {
    const connectionStatus = document.getElementById('connectionStatus');
    if (connected) {
        connectionStatus.src = 'connected.png'; // Icon for connected state
        connectionStatus.alt = 'Connected';
    } else {
        connectionStatus.src = 'disconnected.png'; // Icon for disconnected state
        connectionStatus.alt = 'Disconnected';
    }
}

// Connect to the BLE device
async function connectToBLE() {
    try {
        console.log('Requesting BLE device...');
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'ENAV_BLE' }],
            optionalServices: [bleServiceUuid]
        });
        
        console.log('Connecting to GATT server...');
        bleServer = await bleDevice.gatt.connect();
        
        console.log('Getting service...');
        const service = await bleServer.getPrimaryService(bleServiceUuid);
        
        console.log('Getting characteristics...');
        txCharacteristic = await service.getCharacteristic(txCharacteristicUuid);
        rxCharacteristic = await service.getCharacteristic(rxCharacteristicUuid);
        
        // Enable notifications for receiving data
        await rxCharacteristic.startNotifications();
        rxCharacteristic.addEventListener('characteristicvaluechanged', handleBleData);
        
        console.log('Connected to BLE device!');
        document.getElementById('connectionStatus').src = "connected.png";
        
        // Fetch initial data from the device
        setTimeout(() => {
            fetchDataFromDevice();
        }, 1000); // Delay to ensure device is ready
        
        return true;
    } catch (error) {
        console.error('BLE connection error:', error);
        alert('Failed to connect to BLE device: ' + error);
        return false;
    }
}

// Send a command to the ESP32
async function sendCommandToESP32(command) {
    if (!txCharacteristic) {
        console.log('No txCharacteristic available. Attempting to connect...');
        const connected = await connectToBLE();
        if (!connected) {
            console.error('Failed to connect to BLE device');
            return false;
        }
    }
    
    console.log('Sending command:', command);
    
    try {
        const encoder = new TextEncoder();
        await txCharacteristic.writeValue(encoder.encode(command));
        console.log('Command sent successfully');
        return true;
    } catch (error) {
        console.error('Error sending command:', error);
        alert('Failed to send command: ' + error);
        return false;
    }
}

// Handle data received from the ESP32
function handleBleData(event) {
    const decoder = new TextDecoder();
    const data = decoder.decode(event.target.value);
    console.log('Received data:', data);
    
    // Parse the data string
    try {
        const parts = data.split('|');
        
        // Extract home coordinates
        const homeMatch = parts[0].match(/Home Lat: ([-\d.]+), Lon: ([-\d.]+)/);
        if (homeMatch) {
            const homeLat = homeMatch[1];
            const homeLon = homeMatch[2];
            
            // Update the UI
            document.getElementById('savedHomeLat').value = homeLat;
            document.getElementById('savedHomeLon').value = homeLon;
        }
        
        // Extract POI coordinates
        const poiMatch = parts[1].match(/POI Lat: ([-\d.]+), Lon: ([-\d.]+), Enabled: (\d)/);
        if (poiMatch) {
            const poiLat = parseFloat(poiMatch[1]);
            const poiLon = parseFloat(poiMatch[2]);
            const poiEnabled = poiMatch[3] === '1';
            
            // Update the UI
            document.getElementById('savedPoiLat').value = poiLat.toFixed(6);
            document.getElementById('savedPoiLon').value = poiLon.toFixed(6);
            document.getElementById('savedPoiEnabled').checked = poiEnabled;
            
            // Update map marker if this is the first POI update
            if (isFirstPOIUpdate && map && marker && !isNaN(poiLat) && !isNaN(poiLon)) {
                marker.setLatLng([poiLat, poiLon]);
                map.setView([poiLat, poiLon], 13);
                isFirstPOIUpdate = false;
            }
        }
        
        // Extract fuel information
        const fuelMatch = parts[2].match(/Fuel: ([\d.]+), Burn Rate: ([\d.]+)/);
        if (fuelMatch) {
            const fuelLevel = parseFloat(fuelMatch[1]).toFixed(1);
            const burnRate = parseFloat(fuelMatch[2]).toFixed(1);
            
            console.log(`Updating fuel UI: Level=${fuelLevel}, Rate=${burnRate}`);
            
            // Update the UI
            document.getElementById('fuelLevel').value = fuelLevel;
            document.getElementById('fuelBurnRate').value = burnRate;
        }
        
    } catch (error) {
        console.error('Error parsing BLE data:', error);
    }
}

// Fetch data from the device
async function fetchDataFromDevice() {
    try {
        // A generic GET_DATA command might not be implemented on the ESP32
        // Instead, we'll just wait for the periodic updates
        console.log('Requesting initial data from device...');
        // Send a dummy command to trigger a response
        await sendCommandToESP32('GET_DATA');
    } catch (error) {
        console.error('Error fetching data from device:', error);
    }
}

// Initialize the map and set up event listeners - CLEAN UP DUPLICATE HANDLERS
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    
    document.getElementById('connectButton').addEventListener('click', async () => {
        await connectToBLE();
    });
    
    document.getElementById('updatePOIButton').addEventListener('click', async () => {
        const lat = parseFloat(document.getElementById('poiLat').value);
        const lon = parseFloat(document.getElementById('poiLon').value);
        const enabled = document.getElementById('poiEnabled').checked ? 1 : 0;
        
        if (!isNaN(lat) && !isNaN(lon)) {
            console.log(`Sending POI update: Lat=${lat}, Lon=${lon}, Enabled=${enabled}`);
            const command = `${lat}:${lon}:${enabled}`;
            const success = await sendCommandToESP32(command);
            
            if (success) {
                alert('POI updated successfully!');
            }
        } else {
            alert('Please enter valid latitude and longitude');
        }
    });
    
    document.getElementById('updateFuelButton').addEventListener('click', async () => {
        const fuelLevel = parseFloat(document.getElementById('newFuelLevel').value);
        const burnRate = parseFloat(document.getElementById('newBurnRate').value);
        
        if (!isNaN(fuelLevel) && !isNaN(burnRate) && fuelLevel > 0 && burnRate > 0) {
            console.log(`Sending fuel update: Level=${fuelLevel}L, Rate=${burnRate}L/h`);
            const command = `FUEL:${fuelLevel}:${burnRate}`;
            const success = await sendCommandToESP32(command);
            
            if (success) {
                console.log("Fuel data sent successfully via BLE");
            }
        } else {
            alert('Please enter valid numbers for both fuel level and burn rate');
        }
    });
});
