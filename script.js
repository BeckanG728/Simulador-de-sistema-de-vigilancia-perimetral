const mapCanvas = document.getElementById('mapCanvas');
        const mapCtx = mapCanvas.getContext('2d');
        const video = document.getElementById('video');
        const faceCanvas = document.getElementById('faceCanvas');
        const faceCtx = faceCanvas.getContext('2d');
        const placeholder = document.getElementById('placeholder');

        let faceMesh = null;
        let currentLandmarks = null;
        let cameraRunning = false;
        let scanMode = false;
        let manualScanMode = false;
        let autoScanActive = false;
        let faceDB = [];
        let intruders = [];
        let alerts = [];
        let home = { x: 0, y: 0 };
        let perimeterRadius = 150;
        let lastScanTime = 0;
        let scanCooldown = 2000; // 2 segundos entre escaneos

        // Inicializar mapa
        function initMap() {
            mapCanvas.width = mapCanvas.offsetWidth;
            mapCanvas.height = mapCanvas.offsetHeight;
            home.x = mapCanvas.width / 2;
            home.y = mapCanvas.height / 2;
        }

        // Dibujar mapa
        function drawMap() {
            mapCtx.fillStyle = '#0f1729';
            mapCtx.fillRect(0, 0, mapCanvas.width, mapCanvas.height);

            // Perímetro
            mapCtx.strokeStyle = '#4CAF50';
            mapCtx.lineWidth = 2;
            mapCtx.setLineDash([10, 5]);
            mapCtx.beginPath();
            mapCtx.arc(home.x, home.y, perimeterRadius, 0, Math.PI * 2);
            mapCtx.stroke();
            mapCtx.setLineDash([]);

            // Casa
            mapCtx.fillStyle = '#2196F3';
            mapCtx.fillRect(home.x - 20, home.y - 20, 40, 40);
            mapCtx.fillStyle = '#fff';
            mapCtx.font = '12px Arial';
            mapCtx.textAlign = 'center';
            mapCtx.fillText('HOGAR', home.x, home.y + 35);

            // Cámaras (4)
            [0, 90, 180, 270].forEach(angle => {
                const rad = angle * Math.PI / 180;
                const x = home.x + Math.cos(rad) * (perimeterRadius + 20);
                const y = home.y + Math.sin(rad) * (perimeterRadius + 20);
                mapCtx.fillStyle = scanMode ? '#4CAF50' : '#2196F3';
                mapCtx.beginPath();
                mapCtx.arc(x, y, 6, 0, Math.PI * 2);
                mapCtx.fill();
            });

            // Sensores (8)
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const x = home.x + Math.cos(angle) * perimeterRadius;
                const y = home.y + Math.sin(angle) * perimeterRadius;
                mapCtx.fillStyle = '#FF9800';
                mapCtx.beginPath();
                mapCtx.arc(x, y, 4, 0, Math.PI * 2);
                mapCtx.fill();
            }

            // Intrusos
            intruders.forEach(intruder => {
                const dx = home.x - intruder.x;
                const dy = home.y - intruder.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // Color según estado y posición
                if (intruder.authorized) {
                    mapCtx.fillStyle = '#4CAF50';
                } else if (dist <= perimeterRadius) {
                    mapCtx.fillStyle = '#f44336';
                } else {
                    mapCtx.fillStyle = '#FF9800';
                }
                
                mapCtx.beginPath();
                mapCtx.arc(intruder.x, intruder.y, 10, 0, Math.PI * 2);
                mapCtx.fill();
                
                // Mostrar nombre si está autorizado
                if (intruder.authorized) {
                    mapCtx.fillStyle = '#fff';
                    mapCtx.font = 'bold 10px Arial';
                    mapCtx.fillText(intruder.name, intruder.x, intruder.y - 15);
                }
                
                // Mostrar estado de escaneo
                if (intruder.needsScan && dist <= perimeterRadius) {
                    mapCtx.strokeStyle = '#FFD700';
                    mapCtx.lineWidth = 2;
                    mapCtx.beginPath();
                    mapCtx.arc(intruder.x, intruder.y, 15, 0, Math.PI * 2);
                    mapCtx.stroke();
                }
            });
        }

        // Verificar intrusos en perímetro
        function checkPerimeter() {
            let intrudersInZone = 0;
            let needsScan = false;

            intruders.forEach(intruder => {
                const dx = home.x - intruder.x;
                const dy = home.y - intruder.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Detectar entrada al perímetro
                if (dist <= perimeterRadius) {
                    intrudersInZone++;
                    
                    if (!intruder.authorized) {
                        if (!intruder.insidePerimeter) {
                            intruder.insidePerimeter = true;
                            intruder.needsScan = true;
                            intruder.perimeterAlertSent = true;
                            addAlert({
                                time: new Date().toLocaleTimeString(),
                                msg: '⚠ Individuo detectado dentro del perímetro',
                                ok: false,
                                type: 'warning'
                            });
                        }
                        needsScan = true;
                    }
                } else {
                    intruder.insidePerimeter = false;
                    intruder.perimeterAlertSent = false;
                }
            });

            // Actualizar indicador de zona
            const indicator = document.getElementById('zoneIndicator');
            const intrudersCount = document.getElementById('intrudersInZone');
            
            if (indicator && intrudersCount) {
                intrudersCount.textContent = intrudersInZone;

                if (intrudersInZone > 0 && needsScan) {
                    indicator.className = 'zone-indicator alert';
                    indicator.innerHTML = `Perímetro: <b>ALERTA</b> | Intrusos en zona: <b>${intrudersInZone}</b>`;
                } else {
                    indicator.className = 'zone-indicator safe';
                    indicator.innerHTML = `Perímetro: <b>SEGURO</b> | Intrusos en zona: <b>${intrudersInZone}</b>`;
                }
            }

            // Activar escaneo automático si hay cámara activa y personas no autorizadas dentro
            if (cameraRunning && needsScan && !manualScanMode) {
                if (!autoScanActive) {
                    autoScanActive = true;
                    scanMode = true;
                    updateScanStatus();
                }
            } else if (autoScanActive && !needsScan && !manualScanMode) {
                autoScanActive = false;
                scanMode = false;
                updateScanStatus();
            }
        }

        // Actualizar estado de escaneo en UI
        function updateScanStatus() {
            const status = document.getElementById('scanStatus');
            if (!cameraRunning) {
                status.className = 'scan-status inactive';
                status.innerHTML = '⏸ Sistema en Espera';
            } else if (manualScanMode) {
                status.className = 'scan-status manual';
                status.innerHTML = '🔍 Escaneo Manual Activo';
            } else if (autoScanActive) {
                status.className = 'scan-status active';
                status.innerHTML = '🚨 Escaneo Automático - Intruso Detectado';
            } else {
                status.className = 'scan-status inactive';
                status.innerHTML = '✓ Cámara Activa - Monitoreando';
            }
        }

        // Actualizar simulación
        function updateSim() {
            intruders.forEach(intruder => {
                const dx = home.x - intruder.x;
                const dy = home.y - intruder.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > 5) {
                    intruder.x += (dx / dist) * 0.8;
                    intruder.y += (dy / dist) * 0.8;
                }
            });

            checkPerimeter();
            drawMap();
            requestAnimationFrame(updateSim);
        }

        // Agregar intruso
        function addIntruder() {
            const angle = Math.random() * Math.PI * 2;
            const distance = perimeterRadius + 150;
            intruders.push({
                x: home.x + Math.cos(angle) * distance,
                y: home.y + Math.sin(angle) * distance,
                authorized: false,
                insidePerimeter: false,
                needsScan: false,
                perimeterAlertSent: false,
                unauthorizedAlertSent: false,
                identifiedAlertSent: false,
                id: Date.now()
            });
        }

        function clearAll() {
            intruders = [];
            autoScanActive = false;
            scanMode = manualScanMode;
            updateScanStatus();
            drawMap();
        }

        // Agregar alerta
        function addAlert(alertData) {
            alerts.unshift(alertData);
            updateAlerts();
            const alertCountEl = document.getElementById('alertCount');
            if (alertCountEl) {
                alertCountEl.textContent = alerts.filter(a => !a.ok).length;
            }
        }

        function updateAlerts() {
            const log = document.getElementById('alertLog');
            if (log) {
                log.innerHTML = alerts.slice(0, 10).map(a => 
                    `<div class="alert-item ${a.ok ? 'ok' : a.type === 'warning' ? 'warning' : ''}">[${a.time}] ${a.msg}</div>`
                ).join('');
            }
        }

        // Face Recognition
        function extractFeatures(landmarks) {
            if (!landmarks) return null;
            const keyPoints = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 
                             33, 133, 159, 145, 362, 263, 386, 374, 
                             1, 4, 5, 195, 61, 291, 0, 17, 269];
            const features = [];
            keyPoints.forEach(idx => {
                if (landmarks[idx]) {
                    features.push(landmarks[idx].x, landmarks[idx].y, landmarks[idx].z || 0);
                }
            });
            const nose = landmarks[1];
            return features.map((v, i) => v - (i % 3 === 0 ? nose.x : i % 3 === 1 ? nose.y : nose.z || 0));
        }

        function calcSimilarity(f1, f2) {
            if (!f1 || !f2 || f1.length !== f2.length) return 0;
            let sum = 0;
            for (let i = 0; i < f1.length; i++) sum += Math.pow(f1[i] - f2[i], 2);
            return Math.max(0, Math.min(100, 100 - Math.sqrt(sum) * 200));
        }

        function findMatch(features) {
            if (!features || faceDB.length === 0) return null;
            let best = null;
            let bestSim = 0;
            faceDB.forEach(p => {
                const sim = calcSimilarity(features, p.features);
                if (sim > bestSim) {
                    bestSim = sim;
                    best = p;
                }
            });
            return bestSim > 70 ? { person: best, sim: bestSim } : null;
        }

        function captureFace() {
            if (!currentLandmarks) {
                alert('No se detectó rostro');
                return;
            }
            const name = prompt('Nombre:');
            if (!name) return;
            
            const features = extractFeatures(currentLandmarks);
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = faceCanvas.width;
            tempCanvas.height = faceCanvas.height;
            tempCanvas.getContext('2d').drawImage(faceCanvas, 0, 0);
            
            faceDB.push({
                id: Date.now(),
                name: name,
                features: features,
                img: tempCanvas.toDataURL('image/jpeg', 0.5)
            });
            updateDB();
            addAlert({
                time: new Date().toLocaleTimeString(),
                msg: `✓ ${name} registrado en base de datos`,
                ok: true
            });
        }

        function deleteFace(id) {
            if (confirm('¿Eliminar?')) {
                faceDB = faceDB.filter(p => p.id !== id);
                updateDB();
            }
        }

        function updateDB() {
            const container = document.getElementById('faceDB');
            const dbCount = document.getElementById('dbCount');
            if (dbCount) {
                dbCount.textContent = faceDB.length;
            }
            if (container) {
                container.innerHTML = faceDB.map(p => `
                    <div class="face-item">
                        <img src="${p.img}" class="face-thumb">
                        <div class="face-info">${p.name}</div>
                        <button onclick="deleteFace(${p.id})">X</button>
                    </div>
                `).join('');
            }
        }

        function initFaceMesh() {
            faceMesh = new FaceMesh({
                locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
            });
            faceMesh.setOptions({
                maxNumFaces: 1,
                minDetectionConfidence: 0.7,
                minTrackingConfidence: 0.7
            });
            faceMesh.onResults(onResults);
        }

        function onResults(results) {
            faceCanvas.width = results.image.width;
            faceCanvas.height = results.image.height;
            faceCtx.drawImage(results.image, 0, 0);

            if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
                currentLandmarks = results.multiFaceLandmarks[0];

                // Solo escanear si está en modo escaneo (manual o automático)
                if (scanMode) {
                    const now = Date.now();
                    if (now - lastScanTime > scanCooldown) {
                        lastScanTime = now;
                        
                        const features = extractFeatures(currentLandmarks);
                        const match = findMatch(features);

                        if (match) {
                            faceCtx.fillStyle = 'rgba(76, 175, 80, 0.8)';
                            faceCtx.fillRect(0, 0, faceCanvas.width, 50);
                            faceCtx.fillStyle = '#fff';
                            faceCtx.font = 'bold 20px Arial';
                            faceCtx.fillText(`✓ ${match.person.name} (${Math.round(match.sim)}%)`, 10, 30);

                            // Autorizar intrusos dentro del perímetro
                            intruders.forEach(i => {
                                if (!i.authorized && i.insidePerimeter && !i.identifiedAlertSent) {
                                    i.authorized = true;
                                    i.name = match.person.name;
                                    i.needsScan = false;
                                    i.identifiedAlertSent = true;
                                    addAlert({
                                        time: new Date().toLocaleTimeString(),
                                        msg: `✓ Acceso autorizado: ${match.person.name}`,
                                        ok: true
                                    });
                                }
                            });
                        } else {
                            faceCtx.fillStyle = 'rgba(244, 67, 54, 0.8)';
                            faceCtx.fillRect(0, 0, faceCanvas.width, 50);
                            faceCtx.fillStyle = '#fff';
                            faceCtx.font = 'bold 20px Arial';
                            faceCtx.fillText('⚠ NO AUTORIZADO', 10, 30);
                            
                            // Solo enviar alerta de no autorizado una vez por intruso
                            if (autoScanActive) {
                                intruders.forEach(i => {
                                    if (!i.authorized && i.insidePerimeter && !i.unauthorizedAlertSent) {
                                        i.unauthorizedAlertSent = true;
                                        addAlert({
                                            time: new Date().toLocaleTimeString(),
                                            msg: '🚨 ALERTA: Persona no autorizada detectada',
                                            ok: false
                                        });
                                    }
                                });
                            }
                        }
                    }
                }
            } else {
                currentLandmarks = null;
            }
        }

        async function toggleCamera() {
            if (!cameraRunning) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ 
                        video: { 
                            width: { ideal: 640 }, 
                            height: { ideal: 480 },
                            facingMode: 'user'
                        } 
                    });
                    video.srcObject = stream;
                    
                    await new Promise((resolve) => {
                        video.onloadedmetadata = resolve;
                    });
                    
                    await video.play();
                    
                    faceCanvas.width = video.videoWidth;
                    faceCanvas.height = video.videoHeight;
                    
                    placeholder.style.display = 'none';
                    faceCanvas.classList.add('active');
                    
                    cameraRunning = true;
                    
                    const processFrame = async () => {
                        if (cameraRunning && faceMesh && video.readyState === 4) {
                            await faceMesh.send({ image: video });
                        }
                        if (cameraRunning) {
                            requestAnimationFrame(processFrame);
                        }
                    };
                    processFrame();
                    
                    document.getElementById('cameraBtn').textContent = 'Detener Cámara';
                    document.getElementById('captureBtn').disabled = false;
                    document.getElementById('scanBtn').disabled = false;
                    updateScanStatus();
                } catch (err) {
                    console.error('Error cámara:', err);
                    alert('Error al acceder a la cámara: ' + err.message);
                }
            } else {
                cameraRunning = false;
                scanMode = false;
                manualScanMode = false;
                autoScanActive = false;
                
                if (video.srcObject) {
                    video.srcObject.getTracks().forEach(t => t.stop());
                    video.srcObject = null;
                }
                
                faceCtx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
                
                faceCanvas.classList.remove('active');
                placeholder.style.display = 'flex';
                
                document.getElementById('cameraBtn').textContent = 'Iniciar Cámara';
                document.getElementById('captureBtn').disabled = true;
                document.getElementById('scanBtn').disabled = true;
                document.getElementById('scanBtn').textContent = 'Escaneo Manual';
                updateScanStatus();
            }
        }

        function toggleManualScan() {
            if (faceDB.length === 0) {
                alert('Registra personas primero');
                return;
            }
            manualScanMode = !manualScanMode;
            scanMode = manualScanMode || autoScanActive;
            document.getElementById('scanBtn').textContent = manualScanMode ? 'Detener Manual' : 'Escaneo Manual';
            updateScanStatus();
        }

        // Funciones globales
        window.deleteFace = deleteFace;
        window.addIntruder = addIntruder;
        window.clearAll = clearAll;
        window.toggleCamera = toggleCamera;
        window.captureFace = captureFace;
        window.toggleManualScan = toggleManualScan;

        window.onload = () => {
            initMap();
            drawMap();
            updateSim();
            initFaceMesh();
            
            faceCanvas.width = 640;
            faceCanvas.height = 480;
            
            faceCanvas.classList.remove('active');
            placeholder.style.display = 'flex';
            updateScanStatus();
        };