const canvas = document.getElementById('circuit-canvas');
const ctx = canvas.getContext('2d');
const workspaceContainer = document.getElementById('workspace-container');

function resizeCanvas() {
    canvas.width = workspaceContainer.clientWidth;
    canvas.height = workspaceContainer.clientHeight;
    drawCircuit();
}
window.addEventListener('resize', resizeCanvas);

let components = [];
let wires = [];
let currentTool = 'select'; // 'select', 'move', 'wire', or component type ('resistor', 'vsource', 'isource')
let placingType = null;
let selectedComponent = null;
let selectedWire = null;
let draggingComponent = null;
let dragOffset = { x: 0, y: 0 };
let wireStartPin = null;
let worldMouse = { x: 0, y: 0 };
let nextId = { resistor: 1, vsource: 1, isource: 1 };

let panX = 100;
let panY = 100;
let zoom = 1.0;
let isPanning = false;
let panStart = { x: 0, y: 0 };

function showMessage(title, text, type = 'info') {
    const box = document.getElementById('msg-box');
    const icon = document.getElementById('msg-icon');
    document.getElementById('msg-title').textContent = title;
    document.getElementById('msg-text').textContent = text;

    icon.className = type === 'error' ? 'fa-solid fa-circle-exclamation text-red-400 text-xl' :
        type === 'success' ? 'fa-solid fa-circle-check text-emerald-400 text-xl' :
            'fa-solid fa-circle-info text-blue-400 text-xl';

    box.classList.remove('hidden');
    setTimeout(() => { box.classList.add('hidden'); }, 4500);
}

function screenToWorld(screenX, screenY) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (screenX - rect.left - panX) / zoom,
        y: (screenY - rect.top - panY) / zoom
    };
}

// Tool Selection
document.querySelectorAll('.tool-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.tool-item').forEach(i => i.classList.remove('border-emerald-500', 'bg-slate-700'));
        item.classList.add('border-emerald-500', 'bg-slate-700');

        const tool = item.getAttribute('data-tool');
        const type = item.getAttribute('data-type');

        if (tool === 'select') {
            currentTool = 'select';
            placingType = null;
            wireStartPin = null;
            document.getElementById('placement-mode-badge').textContent = 'Modo: Seleccionar';
            canvas.style.cursor = 'default';
        } else if (tool === 'move') {
            currentTool = 'move';
            placingType = null;
            wireStartPin = null;
            document.getElementById('placement-mode-badge').textContent = 'Modo: Mover Lienzo';
            canvas.style.cursor = 'grab';
        } else if (tool === 'wire') {
            currentTool = 'wire';
            placingType = null;
            document.getElementById('placement-mode-badge').textContent = 'Modo: Cable Ortogonal';
            canvas.style.cursor = 'crosshair';
        } else if (type) {
            currentTool = 'place';
            placingType = type;
            wireStartPin = null;
            document.getElementById('placement-mode-badge').textContent = `Colocando: ${type.toUpperCase()}`;
            canvas.style.cursor = 'copy';
        }
    });
});

document.querySelectorAll('.tool-item[draggable="true"]').forEach(item => {
    item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', item.getAttribute('data-type'));
        placingType = null;
    });
});

workspaceContainer.addEventListener('dragover', (e) => { e.preventDefault(); });
workspaceContainer.addEventListener('drop', (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/plain');
    if (!type) return;
    const wPos = screenToWorld(e.clientX, e.clientY);
    addComponent(type, Math.round(wPos.x / 20) * 20, Math.round(wPos.y / 20) * 20);
});

function addComponent(type, x, y) {
    let comp = {
        id: type + '_' + Date.now(),
        type: type,
        x: x,
        y: y,
        rotation: 0,
        name: '',
        value: 100,
    };

    if (type === 'resistor') {
        comp.name = 'R' + (nextId.resistor++);
        comp.value = 1000;
        comp.unit = 'Ω';
    } else if (type === 'vsource') {
        comp.name = 'V' + (nextId.vsource++);
        comp.value = 12;
        comp.unit = 'V';
    } else if (type === 'isource') {
        comp.name = 'I' + (nextId.isource++);
        comp.value = 1;
        comp.unit = 'A';
    }

    components.push(comp);
    selectComponent(comp);
    drawCircuit();
}

function getComponentPins(comp) {
    let p1 = { x: -40, y: 0 };
    let p2 = { x: 40, y: 0 };
    let rad = (comp.rotation * Math.PI) / 180;
    let cos = Math.cos(rad);
    let sin = Math.sin(rad);

    return [
        { id: comp.id + '_pin0', x: comp.x + (p1.x * cos - p1.y * sin), y: comp.y + (p1.x * sin + p1.y * cos), compId: comp.id, pinIndex: 0 },
        { id: comp.id + '_pin1', x: comp.x + (p2.x * cos - p2.y * sin), y: comp.y + (p2.x * sin + p2.y * cos), compId: comp.id, pinIndex: 1 }
    ];
}

function drawOrthogonalPath(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    let midX = x1 + (x2 - x1) / 2;
    ctx.lineTo(midX, y1);
    ctx.lineTo(midX, y2);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

function drawCircuit() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoom, zoom);

    // Grid
    ctx.fillStyle = '#1e293b';
    const gridSize = 20;
    const startX = Math.floor(-panX / zoom / gridSize) * gridSize - gridSize * 2;
    const endX = startX + (canvas.width / zoom) + gridSize * 4;
    const startY = Math.floor(-panY / zoom / gridSize) * gridSize - gridSize * 2;
    const endY = startY + (canvas.height / zoom) + gridSize * 4;

    for (let x = startX; x < endX; x += gridSize) {
        for (let y = startY; y < endY; y += gridSize) {
            ctx.fillRect(x - 1, y - 1, 2 / zoom, 2 / zoom);
        }
    }

    // Wires
    wires.forEach(wire => {
        let pinA = findPinById(wire.pinAId);
        let pinB = findPinById(wire.pinBId);
        if (pinA && pinB) {
            let isSel = selectedWire && selectedWire.pinAId === wire.pinAId && selectedWire.pinBId === wire.pinBId;
            ctx.strokeStyle = isSel ? '#38bdf8' : '#34d399';
            ctx.lineWidth = (isSel ? 4 : 3) / zoom;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            drawOrthogonalPath(ctx, pinA.x, pinA.y, pinB.x, pinB.y);
        }
    });

    if (currentTool === 'wire' && wireStartPin) {
        ctx.strokeStyle = '#6ee7b7';
        ctx.lineWidth = 3 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        drawOrthogonalPath(ctx, wireStartPin.x, wireStartPin.y, worldMouse.x, worldMouse.y);
        ctx.setLineDash([]);
    }

    // Components
    components.forEach(comp => {
        ctx.save();
        ctx.translate(comp.x, comp.y);
        ctx.rotate((comp.rotation * Math.PI) / 180);

        let isSelected = selectedComponent && selectedComponent.id === comp.id;

        if (isSelected) {
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2 / zoom;
            ctx.setLineDash([6 / zoom, 3 / zoom]);
            ctx.strokeRect(-48, -28, 96, 56);
            ctx.setLineDash([]);
        }

        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = isSelected ? '#38bdf8' : '#64748b';
        ctx.lineWidth = 2 / zoom;
        ctx.beginPath();
        ctx.roundRect(-40, -20, 80, 40, 6);
        ctx.fill();
        ctx.stroke();

        ctx.save();
        if (comp.type === 'resistor') {
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2 / zoom;
            ctx.beginPath();
            ctx.moveTo(-35, 0); ctx.lineTo(-25, 0); ctx.lineTo(-20, -10);
            ctx.lineTo(-10, 10); ctx.lineTo(0, -10); ctx.lineTo(10, 10);
            ctx.lineTo(20, -10); ctx.lineTo(25, 0); ctx.lineTo(35, 0);
            ctx.stroke();

            ctx.fillStyle = '#fef08a';
            ctx.font = `${Math.max(10, 11 / zoom)}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(`${comp.name} (${comp.value}${comp.unit})`, 0, -26);

        } else if (comp.type === 'vsource') {
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 2 / zoom;
            ctx.beginPath();
            ctx.arc(0, 0, 15, 0, Math.PI * 2);
            ctx.fillStyle = '#0f172a';
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#60a5fa';
            ctx.font = `bold ${Math.max(9, 10 / zoom)}px Inter, sans-serif`;
            ctx.fillText('+', -6, -3);
            ctx.fillText('-', -5, 12);
            ctx.beginPath();
            ctx.moveTo(-35, 0); ctx.lineTo(-15, 0);
            ctx.moveTo(15, 0); ctx.lineTo(35, 0);
            ctx.stroke();

            ctx.fillStyle = '#bfdbfe';
            ctx.font = `${Math.max(10, 11 / zoom)}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(`${comp.name} (${comp.value}${comp.unit})`, 0, -22);

        } else if (comp.type === 'isource') {
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 2 / zoom;
            ctx.beginPath();
            ctx.arc(0, 0, 15, 0, Math.PI * 2);
            ctx.fillStyle = '#0f172a';
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-8, 0); ctx.lineTo(8, 0);
            ctx.lineTo(4, -4); ctx.moveTo(8, 0); ctx.lineTo(4, 4);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-35, 0); ctx.lineTo(-15, 0);
            ctx.moveTo(15, 0); ctx.lineTo(35, 0);
            ctx.stroke();

            ctx.fillStyle = '#e9d5ff';
            ctx.font = `${Math.max(10, 11 / zoom)}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(`${comp.name} (${comp.value}${comp.unit})`, 0, -22);
        }
        ctx.restore();
        ctx.restore();

        // Pins
        getComponentPins(comp).forEach(pin => {
            let isWireStart = wireStartPin && wireStartPin.id === pin.id;
            ctx.fillStyle = isWireStart ? '#34d399' : '#ef4444';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2 / zoom;
            ctx.beginPath();
            ctx.arc(pin.x, pin.y, (isWireStart ? 7 : 5) / zoom, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        });
    });

    if (placingType) {
        ctx.save();
        ctx.translate(worldMouse.x, worldMouse.y);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);
        ctx.beginPath();
        ctx.roundRect(-40, -20, 80, 40, 6);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    ctx.restore();
}

function findPinById(pinId) {
    for (let comp of components) {
        for (let pin of getComponentPins(comp)) {
            if (pin.id === pinId) return pin;
        }
    }
    return null;
}

function getPinAt(wx, wy) {
    for (let comp of components) {
        for (let pin of getComponentPins(comp)) {
            if (Math.hypot(pin.x - wx, pin.y - wy) < 14 / zoom) return pin;
        }
    }
    return null;
}

function getComponentAt(wx, wy) {
    for (let comp of components) {
        let dx = wx - comp.x;
        let dy = wy - comp.y;
        if (dx >= -45 && dx <= 45 && dy >= -25 && dy <= 25) return comp;
    }
    return null;
}

function getWireAt(wx, wy) {
    for (let wire of wires) {
        let pinA = findPinById(wire.pinAId);
        let pinB = findPinById(wire.pinBId);
        if (pinA && pinB) {
            let midX = (pinA.x + pinB.x) / 2;
            if ((Math.abs(wx - midX) < 8 / zoom && wy >= Math.min(pinA.y, pinB.y) - 5 && wy <= Math.max(pinA.y, pinB.y) + 5) ||
                (Math.abs(wy - pinA.y) < 8 / zoom && wx >= Math.min(pinA.x, midX) - 5 && wx <= Math.max(pinA.x, midX) + 5) ||
                (Math.abs(wy - pinB.y) < 8 / zoom && wx >= Math.min(midX, pinB.x) - 5 && wx <= Math.max(midX, pinB.x) + 5)) {
                return wire;
            }
        }
    }
    return null;
}

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || currentTool === 'move') { // Middle mouse or Move tool pan
        isPanning = true;
        panStart = { x: e.clientX - panX, y: e.clientY - panY };
        e.preventDefault();
        return;
    }

    const wPos = screenToWorld(e.clientX, e.clientY);
    worldMouse = wPos;

    if (e.button === 0) {
        if (currentTool === 'place' && placingType) {
            addComponent(placingType, Math.round(wPos.x / 20) * 20, Math.round(wPos.y / 20) * 20);
            return;
        }

        const clickedPin = getPinAt(wPos.x, wPos.y);

        if (currentTool === 'wire') {
            if (clickedPin) {
                if (!wireStartPin) {
                    wireStartPin = clickedPin;
                } else {
                    if (wireStartPin.id !== clickedPin.id) {
                        let exists = wires.some(w =>
                            (w.pinAId === wireStartPin.id && w.pinBId === clickedPin.id) ||
                            (w.pinAId === clickedPin.id && w.pinBId === wireStartPin.id)
                        );
                        if (!exists) {
                            wires.push({ pinAId: wireStartPin.id, pinBId: clickedPin.id });
                        }
                    }
                    wireStartPin = null;
                }
                drawCircuit();
            }
        } else if (currentTool === 'select') {
            const clickedComp = getComponentAt(wPos.x, wPos.y);
            const clickedWire = getWireAt(wPos.x, wPos.y);

            if (clickedComp) {
                selectComponent(clickedComp);
                draggingComponent = clickedComp;
                dragOffset.x = wPos.x - clickedComp.x;
                dragOffset.y = wPos.y - clickedComp.y;
            } else if (clickedWire) {
                selectWire(clickedWire);
            } else {
                selectComponent(null);
                selectWire(null);
            }
        }
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
        panX = e.clientX - panStart.x;
        panY = e.clientY - panStart.y;
        drawCircuit();
        return;
    }

    const wPos = screenToWorld(e.clientX, e.clientY);
    worldMouse = wPos;

    if (draggingComponent && currentTool === 'select') {
        draggingComponent.x = Math.round((wPos.x - dragOffset.x) / 20) * 20;
        draggingComponent.y = Math.round((wPos.y - dragOffset.y) / 20) * 20;
        drawCircuit();
    } else if (currentTool === 'wire' && wireStartPin) {
        drawCircuit();
    } else if (currentTool === 'place' && placingType) {
        drawCircuit();
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 1 || currentTool === 'move') isPanning = false;
    draggingComponent = null;
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let prevZoom = zoom;
    zoom = e.deltaY < 0 ? Math.min(zoom * 1.1, 3.5) : Math.max(zoom / 1.1, 0.3);

    panX = mouseX - (mouseX - panX) * (zoom / prevZoom);
    panY = mouseY - (mouseY - panY) * (zoom / prevZoom);

    drawCircuit();
}, { passive: false });

window.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') {
        if (selectedComponent) {
            selectedComponent.rotation = (selectedComponent.rotation + 90) % 360;
            drawCircuit();
        }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
            if (selectedComponent) {
                deleteComponent(selectedComponent.id);
                selectComponent(null);
                drawCircuit();
            } else if (selectedWire) {
                deleteWire(selectedWire);
                selectWire(null);
                drawCircuit();
            }
        }
    } else if (e.key === 'Escape') {
        placingType = null;
        wireStartPin = null;
        currentTool = 'select';
        document.querySelectorAll('.tool-item').forEach(i => i.classList.remove('border-emerald-500', 'bg-slate-700'));
        document.querySelector('.tool-item[data-tool="select"]').classList.add('border-emerald-500', 'bg-slate-700');
        document.getElementById('placement-mode-badge').textContent = 'Modo: Seleccionar';
        canvas.style.cursor = 'default';
        drawCircuit();
    }
});

function deleteComponent(compId) {
    components = components.filter(c => c.id !== compId);
    wires = wires.filter(w => {
        let pinA = findPinById(w.pinAId);
        let pinB = findPinById(w.pinBId);
        return pinA && pinB && pinA.compId !== compId && pinB.compId !== compId;
    });
}

function deleteWire(wire) {
    wires = wires.filter(w => !(w.pinAId === wire.pinAId && w.pinBId === wire.pinBId));
}

function selectComponent(comp) {
    selectedComponent = comp;
    selectedWire = null;
    updatePropertiesPanel();
    drawCircuit();
}

function selectWire(wire) {
    selectedWire = wire;
    selectedComponent = null;
    updatePropertiesPanel();
    drawCircuit();
}

function updatePropertiesPanel() {
    const panel = document.getElementById('properties-panel');
    if (selectedComponent) {
        panel.innerHTML = `
                    <div class="space-y-3">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-white">${selectedComponent.name}</span>
                            <button id="btn-del-comp" class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-950/50 rounded border border-red-900"><i class="fa-solid fa-trash mr-1"></i>Eliminar</button>
                        </div>
                        <div>
                            <label class="block text-xs text-slate-400 mb-1">Identificador</label>
                            <input type="text" id="prop-name" value="${selectedComponent.name}" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500">
                        </div>
                        <div>
                            <label class="block text-xs text-slate-400 mb-1">Valor (${selectedComponent.unit})</label>
                            <input type="number" step="any" id="prop-value" value="${selectedComponent.value}" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500">
                        </div>
                        <div class="pt-2">
                            <button id="btn-rotate" class="w-full bg-slate-700 hover:bg-slate-600 text-white py-1.5 rounded text-xs font-medium transition"><i class="fa-solid fa-rotate mr-1"></i> Rotar (90°)</button>
                        </div>
                    </div>
                `;
        document.getElementById('prop-name').addEventListener('input', (e) => {
            selectedComponent.name = e.target.value;
            drawCircuit();
        });
        document.getElementById('prop-value').addEventListener('input', (e) => {
            let val = parseFloat(e.target.value);
            if (!isNaN(val)) selectedComponent.value = val;
        });
        document.getElementById('btn-rotate').addEventListener('click', () => {
            selectedComponent.rotation = (selectedComponent.rotation + 90) % 360;
            drawCircuit();
        });
        document.getElementById('btn-del-comp').addEventListener('click', () => {
            deleteComponent(selectedComponent.id);
            selectComponent(null);
            drawCircuit();
        });
    } else if (selectedWire) {
        panel.innerHTML = `
                    <div class="space-y-3">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-white"><i class="fa-solid fa-route text-green-400 mr-1"></i> Cable Seleccionado</span>
                            <button id="btn-del-wire" class="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-950/50 rounded border border-red-900"><i class="fa-solid fa-trash mr-1"></i>Eliminar</button>
                        </div>
                        <p class="text-xs text-slate-400">Cable ortogonal conectado entre terminales.</p>
                    </div>
                `;
        document.getElementById('btn-del-wire').addEventListener('click', () => {
            deleteWire(selectedWire);
            selectWire(null);
            drawCircuit();
        });
    } else {
        panel.innerHTML = `<p class="text-xs text-slate-500 italic text-center mt-6">Selecciona un componente o cable en el lienzo para editar sus propiedades o eliminarlo.</p>`;
    }
}

document.getElementById('btn-clear').addEventListener('click', () => {
    components = [];
    wires = [];
    nextId = { resistor: 1, vsource: 1, isource: 1 };
    selectComponent(null);
    selectWire(null);
    drawCircuit();
    showMessage('Circuito reiniciado', 'Se han borrado todos los elementos.', 'info');
});

// Commercial Resistor Calculator Modal
document.getElementById('btn-commercial-modal').addEventListener('click', () => {
    document.getElementById('commercial-modal').classList.remove('hidden');
});
document.getElementById('close-comm-modal').addEventListener('click', () => {
    document.getElementById('commercial-modal').classList.add('hidden');
});
document.getElementById('btn-close-comm-modal').addEventListener('click', () => {
    document.getElementById('commercial-modal').classList.add('hidden');
});

document.getElementById('btn-calc-comm').addEventListener('click', () => {
    let target = parseFloat(document.getElementById('comm-target').value);
    let tolerance = parseInt(document.getElementById('comm-tolerance').value);

    if (isNaN(target) || target <= 0) {
        showMessage('Valor inválido', 'Ingrese un valor objetivo válido.', 'error');
        return;
    }

    let results = findCommercialResistors(target, tolerance);
    displayCommercialResults(results);
});

function findCommercialResistors(target, tolerance) {
    let seriesValues = tolerance === 10 ?
        [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2] :
        [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1, 9.3, 9.5, 9.76];

    let resistors = [];
    for (let exp = -1; exp <= 7; exp++) {
        for (let base of seriesValues) {
            let val = Number((base * Math.pow(10, exp)).toFixed(4));
            if (val >= 0.1 && val <= 10000000) resistors.push(val);
        }
    }

    let bestSingle = null, bestSeries = null, bestParallel = null;
    let minErrorSingle = Infinity, minErrorSeries = Infinity, minErrorParallel = Infinity;

    for (let r of resistors) {
        let err = Math.abs(r - target) / target;
        if (err < minErrorSingle) {
            minErrorSingle = err;
            bestSingle = { val: r, error: err * 100 };
        }
    }

    let relevant = resistors.filter(r => r >= target * 0.05 && r <= target * 20);
    for (let i = 0; i < relevant.length; i++) {
        let r1 = relevant[i];
        for (let j = i; j < relevant.length; j++) {
            let r2 = relevant[j];

            let rSer = r1 + r2;
            let errSer = Math.abs(rSer - target) / target;
            if (errSer < minErrorSeries) {
                minErrorSeries = errSer;
                bestSeries = { r1: r1, r2: r2, val: rSer, error: errSer * 100 };
            }

            let rPar = (r1 * r2) / (r1 + r2);
            let errPar = Math.abs(rPar - target) / target;
            if (errPar < minErrorParallel) {
                minErrorParallel = errPar;
                bestParallel = { r1: r1, r2: r2, val: rPar, error: errPar * 100 };
            }
        }
    }
    return { single: bestSingle, series: bestSeries, parallel: bestParallel };
}

function formatResistorValue(val) {
    if (val >= 1000000) return (val / 1000000).toFixed(2) + ' MΩ';
    if (val >= 1000) return (val / 1000).toFixed(2) + ' kΩ';
    return val.toFixed(2) + ' Ω';
}

function displayCommercialResults(res) {
    document.getElementById('comm-results').innerHTML = `
                <div class="space-y-4">
                    <div class="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center justify-between">
                        <div>
                            <span class="text-xs uppercase text-slate-400 font-bold block">Individual Más Próxima</span>
                            <span class="text-lg font-bold text-white font-mono">${formatResistorValue(res.single.val)}</span>
                        </div>
                        <div class="text-right">
                            <span class="text-xs text-slate-400 block">Error</span>
                            <span class="text-sm font-bold ${res.single.error <= 5 ? 'text-emerald-400' : 'text-yellow-400'}">${res.single.error.toFixed(2)}%</span>
                        </div>
                    </div>
                    <div class="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center justify-between">
                        <div>
                            <span class="text-xs uppercase text-slate-400 font-bold block">Serie ($R_1 + R_2$)</span>
                            <span class="text-lg font-bold text-white font-mono">${formatResistorValue(res.series.val)}</span>
                            <span class="text-xs text-slate-300 block mt-1">Componentes: <strong class="text-indigo-300">${formatResistorValue(res.series.r1)}</strong> + <strong class="text-indigo-300">${formatResistorValue(res.series.r2)}</strong></span>
                        </div>
                        <div class="text-right">
                            <span class="text-xs text-slate-400 block">Error</span>
                            <span class="text-sm font-bold ${res.series.error <= 1 ? 'text-emerald-400' : 'text-yellow-400'}">${res.series.error.toFixed(2)}%</span>
                        </div>
                    </div>
                    <div class="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center justify-between">
                        <div>
                            <span class="text-xs uppercase text-slate-400 font-bold block">Paralelo ($R_1 \parallel R_2$)</span>
                            <span class="text-lg font-bold text-white font-mono">${formatResistorValue(res.parallel.val)}</span>
                            <span class="text-xs text-slate-300 block mt-1">Componentes: <strong class="text-indigo-300">${formatResistorValue(res.parallel.r1)}</strong> || <strong class="text-indigo-300">${formatResistorValue(res.parallel.r2)}</strong></span>
                        </div>
                        <div class="text-right">
                            <span class="text-xs text-slate-400 block">Error</span>
                            <span class="text-sm font-bold ${res.parallel.error <= 1 ? 'text-emerald-400' : 'text-yellow-400'}">${res.parallel.error.toFixed(2)}%</span>
                        </div>
                    </div>
                </div>
            `;
}

// Kirchhoff Solver (MNA) with Strict Dangling Pin & Open Circuit Validation
document.getElementById('btn-solve').addEventListener('click', () => {
    try {
        solveCircuit();
    } catch (err) {
        console.error(err);
        showMessage('Error en el análisis', err.message || 'Verifique las conexiones del circuito.', 'error');
    }
});

function solveCircuit() {
    if (components.length === 0) {
        throw new Error('El circuito está vacío. Agregue componentes.');
    }

    let allPins = [];
    components.forEach(comp => { allPins.push(...getComponentPins(comp)); });

    // Strict validation: verify every pin has at least one wire connection
    for (let pin of allPins) {
        let connectedWires = wires.filter(w => w.pinAId === pin.id || w.pinBId === pin.id);
        if (connectedWires.length === 0) {
            let comp = components.find(c => c.id === pin.compId);
            let pinNum = pin.pinIndex === 0 ? 'izquierda/positiva' : 'derecha/negativa';
            throw new Error(`El componente "${comp ? comp.name : pin.compId}" tiene la terminal ${pinNum} desconectada (circuito abierto).`);
        }
    }

    let parent = {};
    allPins.forEach(p => parent[p.id] = p.id);
    function find(i) {
        if (parent[i] === i) return i;
        return parent[i] = find(parent[i]);
    }
    function union(i, j) {
        let rootI = find(i), rootJ = find(j);
        if (rootI !== rootJ) parent[rootI] = rootJ;
    }

    wires.forEach(w => union(w.pinAId, w.pinBId));

    let nodeMap = {};
    let nodeCount = 0;
    allPins.forEach(p => {
        let r = find(p.id);
        if (!(r in nodeMap)) nodeMap[r] = nodeCount++;
    });

    let vSources = components.filter(c => c.type === 'vsource');
    if (vSources.length === 0 && components.filter(c => c.type === 'isource').length === 0) {
        throw new Error('El circuito debe incluir al menos una fuente de voltaje o corriente.');
    }

    let groundRoot = vSources.length > 0 ? find(getComponentPins(vSources[0])[1].id) : find(allPins[0].id);

    let uniqueRoots = Object.keys(nodeMap);
    let nonRefRoots = uniqueRoots.filter(r => r !== groundRoot);
    let n = nonRefRoots.length;
    let m = vSources.length;
    let size = n + m;

    if (size === 0) throw new Error('Estructura de circuito insuficiente.');

    let rootToNonRefIndex = {};
    nonRefRoots.forEach((r, idx) => { rootToNonRefIndex[r] = idx; });

    function getNodeIdx(pinId) {
        let r = find(pinId);
        if (r === groundRoot) return -1;
        return rootToNonRefIndex[r] !== undefined ? rootToNonRefIndex[r] : -1;
    }

    let A = Array(size).fill(0).map(() => Array(size).fill(0));
    let Z = Array(size).fill(0);

    components.filter(c => c.type === 'resistor').forEach(res => {
        let pins = getComponentPins(res);
        let idxA = getNodeIdx(pins[0].id);
        let idxB = getNodeIdx(pins[1].id);
        let g = 1 / res.value;

        if (idxA !== -1) A[idxA][idxA] += g;
        if (idxB !== -1) A[idxB][idxB] += g;
        if (idxA !== -1 && idxB !== -1) {
            A[idxA][idxB] -= g;
            A[idxB][idxA] -= g;
        }
    });

    components.filter(c => c.type === 'isource').forEach(isrc => {
        let pins = getComponentPins(isrc);
        let idxA = getNodeIdx(pins[0].id);
        let idxB = getNodeIdx(pins[1].id);
        let val = isrc.value;

        if (idxA !== -1) Z[idxA] -= val;
        if (idxB !== -1) Z[idxB] += val;
    });

    vSources.forEach((vsrc, k) => {
        let pins = getComponentPins(vsrc);
        let idxA = getNodeIdx(pins[0].id);
        let idxB = getNodeIdx(pins[1].id);
        let row = n + k;

        if (idxA !== -1) { A[row][idxA] = 1; A[idxA][row] = 1; }
        if (idxB !== -1) { A[row][idxB] = -1; A[idxB][row] = -1; }
        Z[row] = vsrc.value;
    });

    let X = gaussianElimination(A, Z);

    let nodeVoltages = {};
    uniqueRoots.forEach(r => {
        nodeVoltages[r] = (r === groundRoot) ? 0 : X[rootToNonRefIndex[r]];
    });

    let vSourceCurrents = {};
    vSources.forEach((vsrc, k) => { vSourceCurrents[vsrc.id] = X[n + k]; });

    let resistorResults = components.filter(c => c.type === 'resistor').map(res => {
        let pins = getComponentPins(res);
        let vA = nodeVoltages[find(pins[0].id)];
        let vB = nodeVoltages[find(pins[1].id)];
        let vDrop = vA - vB;
        let current = vDrop / res.value;
        return { name: res.name, resistance: res.value, voltageDrop: Math.abs(vDrop), current: Math.abs(current), power: Math.abs(vDrop * current) };
    });

    let isourceResults = components.filter(c => c.type === 'isource').map(isrc => {
        let pins = getComponentPins(isrc);
        let vDrop = nodeVoltages[find(pins[0].id)] - nodeVoltages[find(pins[1].id)];
        return { name: isrc.name, current: isrc.value, voltageDrop: vDrop, power: vDrop * isrc.value };
    });

    let vsourceResults = vSources.map(vsrc => {
        let current = vSourceCurrents[vsrc.id];
        return { name: vsrc.name, voltage: vsrc.value, current: current, power: vsrc.value * current };
    });

    displayResultsModal({
        nodeVoltages: uniqueRoots.map((r, idx) => ({ name: `Nodo ${idx} (${r === groundRoot ? 'Referencia / GND' : 'Nodal'})`, voltage: nodeVoltages[r] })),
        resistors: resistorResults,
        isources: isourceResults,
        vsources: vsourceResults
    });
}

function gaussianElimination(A, B) {
    let n = B.length;
    for (let i = 0; i < n; i++) {
        let maxEl = Math.abs(A[i][i]), maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(A[k][i]) > maxEl) { maxEl = Math.abs(A[k][i]); maxRow = k; }
        }
        if (maxEl < 1e-12) throw new Error('El circuito está abierto, flotante o tiene dependencias lineales inválidas.');

        let tempA = A[i]; A[i] = A[maxRow]; A[maxRow] = tempA;
        let tempB = B[i]; B[i] = B[maxRow]; B[maxRow] = tempB;

        for (let k = i + 1; k < n; k++) {
            let c = -A[k][i] / A[i][i];
            for (let j = i; j < n; j++) { A[k][j] = (i === j) ? 0 : A[k][j] + c * A[i][j]; }
            B[k] += c * B[i];
        }
    }
    let x = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) sum += A[i][j] * x[j];
        x[i] = (B[i] - sum) / A[i][i];
    }
    return x;
}

function displayResultsModal(data) {
    document.getElementById('results-content').innerHTML = `
                <div class="space-y-6">
                    <div>
                        <h4 class="text-sm font-bold uppercase tracking-wider text-emerald-400 mb-3"><i class="fa-solid fa-network-wired mr-2"></i>Voltajes de Nodos (MNA)</h4>
                        <div class="bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-slate-700/50 text-xs text-slate-400"><tr><th class="p-3">Nodo</th><th class="p-3">Voltaje (V)</th></tr></thead>
                                <tbody class="divide-y divide-slate-700 text-sm">
                                    ${data.nodeVoltages.map(n => `<tr><td class="p-3 font-medium text-white">${n.name}</td><td class="p-3 text-emerald-400 font-mono">${n.voltage.toFixed(4)} V</td></tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div>
                        <h4 class="text-sm font-bold uppercase tracking-wider text-yellow-400 mb-3"><i class="fa-solid fa-bolt mr-2"></i>Corrientes y Potencia en Resistencias</h4>
                        <div class="bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-slate-700/50 text-xs text-slate-400"><tr><th class="p-3">Componente</th><th class="p-3">Resistencia</th><th class="p-3">Caída V</th><th class="p-3">Corriente</th><th class="p-3">Potencia</th></tr></thead>
                                <tbody class="divide-y divide-slate-700 text-sm">
                                    ${data.resistors.map(r => `<tr><td class="p-3 font-medium text-white">${r.name}</td><td class="p-3 font-mono">${r.resistance} Ω</td><td class="p-3 font-mono">${r.voltageDrop.toFixed(4)} V</td><td class="p-3 font-mono text-yellow-400">${(r.current * 1000).toFixed(2)} mA</td><td class="p-3 font-mono text-purple-400">${r.power.toFixed(4)} W</td></tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div>
                        <h4 class="text-sm font-bold uppercase tracking-wider text-blue-400 mb-3"><i class="fa-solid fa-battery-full mr-2"></i>Fuentes</h4>
                        <div class="bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
                            <table class="w-full text-left border-collapse">
                                <thead class="bg-slate-700/50 text-xs text-slate-400"><tr><th class="p-3">Fuente</th><th class="p-3">Valor</th><th class="p-3">Corriente Suministrada</th><th class="p-3">Potencia</th></tr></thead>
                                <tbody class="divide-y divide-slate-700 text-sm">
                                    ${data.vsources.map(v => `<tr><td class="p-3 font-medium text-white">${v.name}</td><td class="p-3 font-mono text-blue-400">${v.voltage} V</td><td class="p-3 font-mono">${(v.current * 1000).toFixed(2)} mA</td><td class="p-3 font-mono text-purple-400">${v.power.toFixed(4)} W</td></tr>`).join('')}
                                    ${data.isources.map(i => `<tr><td class="p-3 font-medium text-white">${i.name}</td><td class="p-3 font-mono text-purple-400">${i.current} A</td><td class="p-3 font-mono">${i.current * 1000} mA</td><td class="p-3 font-mono">${i.power.toFixed(4)} W</td></tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
    document.getElementById('results-modal').classList.remove('hidden');
}

document.getElementById('close-modal').addEventListener('click', () => { document.getElementById('results-modal').classList.add('hidden'); });
document.getElementById('btn-close-modal').addEventListener('click', () => { document.getElementById('results-modal').classList.add('hidden'); });

function loadDefaultCircuit() {
    components.push({ id: 'vsource_1', type: 'vsource', x: 200, y: 250, rotation: 90, name: 'V1', value: 12, unit: 'V' });
    components.push({ id: 'resistor_1', type: 'resistor', x: 450, y: 150, rotation: 0, name: 'R1', value: 10, unit: 'Ω' });
    components.push({ id: 'resistor_2', type: 'resistor', x: 450, y: 350, rotation: 0, name: 'R2', value: 330, unit: 'Ω' });

    nextId = { resistor: 3, vsource: 2, isource: 1 };

    let vPins = getComponentPins(components[0]);
    let r1Pins = getComponentPins(components[1]);
    let r2Pins = getComponentPins(components[2]);

    wires.push({ pinAId: vPins[0].id, pinBId: r1Pins[0].id });
    wires.push({ pinAId: r1Pins[1].id, pinBId: r2Pins[1].id });
    wires.push({ pinAId: r2Pins[0].id, pinBId: vPins[1].id });

    resizeCanvas();
}

window.onload = () => { loadDefaultCircuit(); };