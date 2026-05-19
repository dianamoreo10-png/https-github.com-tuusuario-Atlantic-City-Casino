const DB = {
  getClientes() { return JSON.parse(localStorage.getItem('ac_clientes') || '[]'); },
  saveClientes(arr) { localStorage.setItem('ac_clientes', JSON.stringify(arr)); },
  getCliente(dni) { return this.getClientes().find(c => c.dni === dni) || null; },
  addCliente(cliente) {
    const lista = this.getClientes();
    if (lista.find(c => c.dni === cliente.dni)) throw new Error('El DNI ya está registrado.');
    if (lista.find(c => c.correo === cliente.correo)) throw new Error('El correo ya está registrado.');
    lista.push({ ...cliente, saldo: 100.0, segmento: cliente.segmento || 'estandar' });
    this.saveClientes(lista);
  },
  updateCliente(dni, cambios) {
    const lista = this.getClientes();
    const idx = lista.findIndex(c => c.dni === dni);
    if (idx === -1) throw new Error('Cliente no encontrado.');
    lista[idx] = { ...lista[idx], ...cambios };
    this.saveClientes(lista);
    return lista[idx];
  },
  deleteCliente(dni) { this.saveClientes(this.getClientes().filter(c => c.dni !== dni)); },

  getQuejas() { return JSON.parse(localStorage.getItem('ac_quejas') || '[]'); },
  saveQuejas(arr) { localStorage.setItem('ac_quejas', JSON.stringify(arr)); },
  addQueja(queja) {
    const lista = this.getQuejas();
    const id = (lista.length ? Math.max(...lista.map(q => q.id)) : 0) + 1;
    lista.unshift({ ...queja, id, status: 'Pendiente' });
    this.saveQuejas(lista);
    return id;
  },
  deleteQueja(id) { this.saveQuejas(this.getQuejas().filter(q => q.id !== id)); },

  getRecargas() { return JSON.parse(localStorage.getItem('ac_recargas') || '[]'); },
  saveRecargas(arr) { localStorage.setItem('ac_recargas', JSON.stringify(arr)); },
  addRecarga(recarga) {
    const lista = this.getRecargas();
    const id = (lista.length ? Math.max(...lista.map(r => r.id)) : 0) + 1;
    lista.unshift({ ...recarga, id, status: 'Pendiente' });
    this.saveRecargas(lista);
    return id;
  },
  procesarRecarga(id, status) {
    const lista = this.getRecargas();
    const idx = lista.findIndex(r => r.id === id);
    if (idx === -1) throw new Error('Recarga no encontrada.');
    if (lista[idx].status !== 'Pendiente') throw new Error('Solicitud ya procesada.');
    lista[idx].status = status;
    this.saveRecargas(lista);
    if (status === 'Aprobado') {
      const clientes = this.getClientes();
      const cidx = clientes.findIndex(c => c.dni === lista[idx].dni);
      if (cidx !== -1) {
        clientes[cidx].saldo = (clientes[cidx].saldo || 0) + lista[idx].monto;
        this.saveClientes(clientes);
      }
    }
  },

  getHistorialJuegos(dni) { return JSON.parse(localStorage.getItem('ac_juegos_' + dni) || '[]'); },
  addJugada(dni, jugada) {
    const h = this.getHistorialJuegos(dni);
    h.unshift({ ...jugada, fecha: new Date().toLocaleString('es-PE') });
    localStorage.setItem('ac_juegos_' + dni, JSON.stringify(h.slice(0, 100)));
  },

  exportar() {
    const data = { clientes: this.getClientes(), quejas: this.getQuejas(), recargas: this.getRecargas(), exportado: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'atlantic-city-backup-' + new Date().toISOString().slice(0,10) + '.json'; a.click();
    URL.revokeObjectURL(url);
  },
  importar(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target.result);
          if (!data.clientes) throw new Error('Archivo invalido: falta "clientes".');
          this.saveClientes(data.clientes);
          if (data.quejas) this.saveQuejas(data.quejas);
          if (data.recargas) this.saveRecargas(data.recargas);
          resolve('Importado: ' + data.clientes.length + ' clientes, ' + (data.quejas||[]).length + ' quejas.');
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsText(file);
    });
  }
};

let clienteEnEdicion = null;
let clientesCache = [];
let promoActual = '';

document.addEventListener('DOMContentLoaded', function () {

  // LOGIN
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const usuario = document.getElementById('usuario').value.trim();
      const clave = document.getElementById('clave').value.trim();
      const loginError = document.getElementById('loginError');
      if (loginError) loginError.style.display = 'none';

      if (usuario === 'admin' && clave === '1234expo') {
        sessionStorage.setItem('adminLogged', 'true');
        window.location.href = 'admin.html';
        return;
      }

      const clientes = DB.getClientes();
      const cliente = clientes.find(c => (c.correo === usuario || c.dni === usuario) && c.contrasena === clave);
      if (cliente) {
        sessionStorage.setItem('clienteLogged', JSON.stringify(cliente));
        window.location.href = 'paginaprincipalcliente.html';
      } else {
        if (loginError) { loginError.style.display = 'block'; loginError.textContent = 'Usuario o contrasena incorrectos.'; }
      }
    });
  }

  // REGISTRO
  const registroForm = document.getElementById('registroForm');
  if (registroForm) {
    registroForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const dniEl = document.getElementById('dni');
      const nombreEl = document.getElementById('nombre');
      const edadEl = document.getElementById('edad');
      const telefonoEl = document.getElementById('telefono');
      const correoEl = document.getElementById('correo');
      const contrasenaEl = document.getElementById('contrasena');
      const regError = document.getElementById('regError');
      const regOk = document.getElementById('regOk');

      limpiarEstilos();
      if (regError) regError.style.display = 'none';
      if (regOk) regOk.style.display = 'none';

      let valido = true, mensajeError = '';

      if (!/^\d{8}$/.test(dniEl.value.trim())) {
        marcarError(dniEl); valido = false; mensajeError = 'El DNI debe tener exactamente 8 digitos numericos.';
      } else if (nombreEl.value.trim().length < 3) {
        marcarError(nombreEl); valido = false; mensajeError = 'El nombre debe tener al menos 3 caracteres.';
      } else if (parseInt(edadEl.value) < 18 || isNaN(parseInt(edadEl.value))) {
        marcarError(edadEl); valido = false; mensajeError = 'Debes ser mayor de 18 anos.';
      } else if (!correoEl.value.trim().includes('@')) {
        marcarError(correoEl); valido = false; mensajeError = 'Ingresa un correo electronico valido.';
      } else if (contrasenaEl.value.length < 6) {
        marcarError(contrasenaEl); valido = false; mensajeError = 'La contrasena debe tener al menos 6 caracteres.';
      }

      if (!valido) {
        if (regError) { regError.style.display = 'block'; regError.textContent = mensajeError; }
        return;
      }

      try {
        DB.addCliente({
          dni: dniEl.value.trim(), nombre: nombreEl.value.trim(),
          edad: parseInt(edadEl.value), telefono: telefonoEl.value.trim(),
          correo: correoEl.value.trim(), contrasena: contrasenaEl.value, segmento: 'estandar'
        });
        if (regOk) { regOk.style.display = 'block'; regOk.textContent = 'Registro exitoso! Redirigiendo al login...'; }
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
      } catch (err) {
        if (regError) { regError.style.display = 'block'; regError.textContent = err.message; }
      }
    });
  }

  // QUEJA
  const formQueja = document.getElementById('formQueja');
  if (formQueja) {
    const data = sessionStorage.getItem('clienteLogged');
    if (!data) { window.location.href = 'login.html'; return; }
    const cliente = JSON.parse(data);
    const nombreInput = document.getElementById('nombre');
    if (nombreInput) nombreInput.value = cliente.nombre;

    formQueja.addEventListener('submit', function (e) {
      e.preventDefault();
      const tipo = document.getElementById('tipo').value;
      const descripcion = document.getElementById('descripcion').value.trim();
      const mensajeExito = document.getElementById('mensajeExito');
      if (!tipo) { alert('Selecciona el tipo de queja.'); return; }
      if (!descripcion) { alert('Escribe la descripcion de tu queja.'); return; }
      DB.addQueja({ nombre: cliente.nombre, tipo, descripcion, fecha: new Date().toLocaleString('es-PE') });
      if (mensajeExito) { mensajeExito.style.display = 'block'; setTimeout(() => { window.location.href = 'paginaprincipalcliente.html'; }, 2000); }
    });
  }

  // ADMIN
  const tablaBody = document.getElementById('tablaBody');
  if (tablaBody) {
    if (sessionStorage.getItem('adminLogged') !== 'true') { window.location.href = 'login.html'; return; }
    actualizarVistaAdmin();
  }

  // CLIENTE
  const userDisplayName = document.getElementById('userDisplayName');
  if (userDisplayName) {
    const data = sessionStorage.getItem('clienteLogged');
    if (!data) { window.location.href = 'login.html'; return; }
    let c = JSON.parse(data);
    const dbCliente = DB.getCliente(c.dni);
    if (dbCliente) { c = dbCliente; sessionStorage.setItem('clienteLogged', JSON.stringify(c)); }

    const firstName = c.nombre.split(' ')[0];
    userDisplayName.textContent = firstName;
    if (document.getElementById('userFullName')) document.getElementById('userFullName').textContent = c.nombre;
    if (document.getElementById('welcomeMsg')) document.getElementById('welcomeMsg').textContent = firstName;
    if (document.getElementById('perfilNombre')) document.getElementById('perfilNombre').value = c.nombre;
    if (document.getElementById('perfilCorreo')) document.getElementById('perfilCorreo').value = c.correo;
    if (document.getElementById('perfilEdad')) document.getElementById('perfilEdad').value = c.edad;
    if (document.getElementById('perfilSegmento')) document.getElementById('perfilSegmento').value = c.segmento || 'estandar';
    if (document.getElementById('saldoActual')) document.getElementById('saldoActual').textContent = 'S/ ' + Number(c.saldo||0).toFixed(2);

    mostrarDetallePerfil(c);
    document.getElementById('userTrigger')?.addEventListener('click', e => { e.stopPropagation(); document.getElementById('userMenu')?.classList.toggle('open'); });
    cargarHistorialRecargas(c.dni);
    cargarResumenJuegos(c.dni);
  }

  window.volver = function () {
    window.location.href = sessionStorage.getItem('clienteLogged') ? 'paginaprincipalcliente.html' : 'index.html';
  };

  window.registrarJuego = function (tipo, apuesta, ganancia, resultado) {
    const data = sessionStorage.getItem('clienteLogged');
    if (!data) return;
    const cliente = JSON.parse(data);
    const dbCliente = DB.getCliente(cliente.dni);
    if (dbCliente) {
      const nuevoSaldo = Math.max(0, dbCliente.saldo - apuesta + ganancia);
      const actualizado = DB.updateCliente(cliente.dni, { saldo: nuevoSaldo });
      sessionStorage.setItem('clienteLogged', JSON.stringify(actualizado));
      if (document.getElementById('saldoActual')) document.getElementById('saldoActual').textContent = 'S/ ' + Number(nuevoSaldo).toFixed(2);
    }
    DB.addJugada(cliente.dni, { tipo, apuesta, ganancia, resultado });
    cargarResumenJuegos(cliente.dni);
  };
});

// ============================================================
//  ADMIN
// ============================================================
function actualizarVistaAdmin() {
  const clientes = DB.getClientes();
  const quejas = DB.getQuejas();
  clientesCache = clientes;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('contador', clientes.length + ' cliente' + (clientes.length === 1 ? '' : 's') + ' registrados');
  set('kpiClientes', clientes.length);
  set('kpiFrecuentes', clientes.filter(c => c.segmento === 'vip').length);
  set('contadorQuejas', quejas.length + ' Incidencia' + (quejas.length === 1 ? '' : 's'));

  const tablaBody = document.getElementById('tablaBody');
  if (tablaBody) {
    tablaBody.innerHTML = clientes.map((c, i) => '<tr><td>#' + (i+1) + '</td><td><span class="game-badge" style="position:static;border-color:' + (c.segmento==='vip'?'var(--gold)':'#555') + '">' + c.segmento.toUpperCase() + '</span></td><td>' + c.dni + '</td><td style="font-weight:700">' + c.nombre + '</td><td>' + c.edad + '</td><td>' + c.correo + '</td><td><button class="btn-nav-register" onclick="abrirModalEdicion(\'' + c.dni + '\')">Editar</button> <button class="btn-nav-register" style="border-color:var(--danger);color:var(--danger)" onclick="eliminarCliente(\'' + c.dni + '\')">Eliminar</button></td></tr>').join('') || '<tr><td colspan="7" style="text-align:center;color:#888">No hay clientes.</td></tr>';
  }

  const tablaQuejasBody = document.getElementById('tablaQuejasBody');
  if (tablaQuejasBody) {
    tablaQuejasBody.innerHTML = quejas.map(q => '<tr><td style="font-size:11px">' + q.fecha + '</td><td>' + q.nombre + '</td><td style="color:var(--gold)">' + q.tipo + '</td><td>' + q.descripcion + '</td><td><button class="btn-nav-register" onclick="eliminarQueja(' + q.id + ')">Archivar</button></td></tr>').join('') || '<tr><td colspan="5" style="text-align:center;color:#888">Sin incidencias.</td></tr>';
  }

  if (typeof Chart !== 'undefined') renderizarGraficos(clientes, quejas);
  cargarRecargasAdmin();
}

function eliminarCliente(dni) {
  if (!confirm('Eliminar cliente ' + dni + '? Esta accion no se puede deshacer.')) return;
  DB.deleteCliente(dni); actualizarVistaAdmin();
}
function eliminarQueja(id) { DB.deleteQueja(id); actualizarVistaAdmin(); }

function cargarRecargasAdmin() {
  const recargas = DB.getRecargas();
  const el = document.getElementById('contadorRecargas');
  if (el) el.textContent = recargas.length + ' solicitud' + (recargas.length===1?'':'es');
  const tbody = document.getElementById('tablaRecargasBody');
  if (!tbody) return;
  tbody.innerHTML = recargas.map(r => {
    const bots = r.status === 'Pendiente'
      ? '<button class="btn-nav-register" style="margin-right:4px;" onclick="procesarRecarga(' + r.id + ',\'Aprobado\')">Aprobar</button><button class="btn-nav-register" style="border-color:var(--danger);color:var(--danger);" onclick="procesarRecarga(' + r.id + ',\'Rechazado\')">Rechazar</button>'
      : '<span style="color:var(--text-muted)">Procesado</span>';
    return '<tr><td>' + r.id + '</td><td>' + r.dni + '</td><td>S/ ' + Number(r.monto).toFixed(2) + '</td><td>' + r.fecha + '</td><td>' + r.descripcion + '</td><td style="color:' + (r.status==='Aprobado'?'#4caf50':r.status==='Rechazado'?'#e05555':'#f0c040') + '">' + r.status + '</td><td>' + (r.foto ? '<a href="' + r.foto + '" target="_blank" style="color:var(--gold)">Ver</a>' : '-') + '</td><td>' + bots + '</td></tr>';
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:#888">No hay solicitudes.</td></tr>';
}

function procesarRecarga(id, status) {
  try { DB.procesarRecarga(id, status); cargarRecargasAdmin(); actualizarVistaAdmin(); alert('Solicitud #' + id + ' ' + status.toLowerCase() + ' correctamente.'); }
  catch (err) { alert('No se pudo procesar: ' + err.message); }
}

function aplicarFiltroClientes() {
  const filtro = (document.getElementById('busquedaClientes')?.value || '').toLowerCase();
  const fil = clientesCache.filter(c => c.dni.includes(filtro) || c.nombre.toLowerCase().includes(filtro) || c.correo.toLowerCase().includes(filtro) || c.segmento.toLowerCase().includes(filtro));
  const tablaBody = document.getElementById('tablaBody');
  if (!tablaBody) return;
  tablaBody.innerHTML = fil.map((c, i) => '<tr><td>#' + (i+1) + '</td><td><span class="game-badge" style="position:static;border-color:' + (c.segmento==='vip'?'var(--gold)':'#555') + '">' + c.segmento.toUpperCase() + '</span></td><td>' + c.dni + '</td><td style="font-weight:700">' + c.nombre + '</td><td>' + c.edad + '</td><td>' + c.correo + '</td><td><button class="btn-nav-register" onclick="abrirModalEdicion(\'' + c.dni + '\')">Editar</button> <button class="btn-nav-register" style="border-color:var(--danger);color:var(--danger)" onclick="eliminarCliente(\'' + c.dni + '\')">Eliminar</button></td></tr>').join('') || '<tr><td colspan="7" style="text-align:center;color:#888">Sin coincidencias.</td></tr>';
}

function abrirModalEdicion(dni) {
  const cliente = clientesCache.find(c => c.dni === dni);
  if (!cliente) return;
  clienteEnEdicion = cliente.dni;
  document.getElementById('editNombre').value = cliente.nombre;
  document.getElementById('editEdad').value = cliente.edad;
  document.getElementById('editEmail').value = cliente.correo;
  document.getElementById('editSegmento').value = cliente.segmento || 'estandar';
  const modal = document.getElementById('modalEditar');
  if (modal) modal.classList.add('active');
}

function guardarCambios() {
  if (!clienteEnEdicion) return;
  const nombre = document.getElementById('editNombre').value.trim();
  const edad = parseInt(document.getElementById('editEdad').value, 10);
  const correo = document.getElementById('editEmail').value.trim();
  const segmento = document.getElementById('editSegmento').value;
  if (!nombre || !correo || isNaN(edad) || edad < 18) { alert('Completa todos los campos correctamente.'); return; }
  try { DB.updateCliente(clienteEnEdicion, { nombre, edad, correo, segmento }); cerrarModal('modalEditar'); actualizarVistaAdmin(); alert('Cliente actualizado.'); }
  catch (err) { alert('Error: ' + err.message); }
}

function exportarDatos() { DB.exportar(); }
function importarDatos() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = async function () {
    if (!this.files[0]) return;
    try { const msg = await DB.importar(this.files[0]); alert('OK: ' + msg); actualizarVistaAdmin(); }
    catch (err) { alert('Error: ' + err.message); }
  };
  input.click();
}

// MARKETING
function abrirModalMarketing(promo) {
  promoActual = promo;
  const titulo = document.getElementById('mktPromoTitulo');
  if (titulo) titulo.textContent = 'Enviar: ' + promo;
  const modal = document.getElementById('modalMarketing');
  if (modal) modal.classList.add('active');
  renderizarListaMkt(clientesCache);
}

function renderizarListaMkt(clientes) {
  const lista = document.getElementById('mktListaClientes');
  if (!lista) return;
  lista.innerHTML = clientes.map(c => '<label style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid #333;cursor:pointer;"><input type="checkbox" class="mkt-check" value="' + c.dni + '" checked style="width:auto;margin:0;"><span style="color:white;font-size:13px;">' + c.nombre + ' <span style="color:#888;font-size:11px;">(' + c.dni + ')</span></span><span style="margin-left:auto;font-size:10px;color:' + (c.segmento==='vip'?'var(--gold)':'#666') + '">' + c.segmento.toUpperCase() + '</span></label>').join('') || '<p style="color:#888;padding:10px">No hay clientes.</p>';
}

function filtrarMkt() {
  const q = (document.getElementById('mktSearch')?.value || '').toLowerCase();
  renderizarListaMkt(clientesCache.filter(c => c.nombre.toLowerCase().includes(q) || c.dni.includes(q)));
}

function toggleTodosMkt(sel) { document.querySelectorAll('.mkt-check').forEach(cb => cb.checked = sel); }

function confirmarEnvioMkt() {
  const sel = [...document.querySelectorAll('.mkt-check:checked')].map(cb => cb.value);
  if (!sel.length) { alert('Selecciona al menos un cliente.'); return; }
  const promos = JSON.parse(localStorage.getItem('ac_promos') || '[]');
  sel.forEach(dni => promos.push({ dni, promo: promoActual, fecha: new Date().toLocaleString('es-PE'), leida: false }));
  localStorage.setItem('ac_promos', JSON.stringify(promos));
  cerrarModal();
  alert('Promocion "' + promoActual + '" enviada a ' + sel.length + ' cliente' + (sel.length===1?'':'s') + '.');
}

// GRAFICOS
let chartQuejas = null, chartEdad = null;
function renderizarGraficos(clientes, quejas) {
  const cols = ['#d4af37','#f0c040','#2196f3','#4caf50','#e05555','#9c27b0','#ff9800','#00bcd4','#ff5722','#795548'];
  const ctxQ = document.getElementById('chartQuejas');
  if (ctxQ) {
    const tipos = {};
    quejas.forEach(q => { tipos[q.tipo] = (tipos[q.tipo]||0) + 1; });
    if (chartQuejas) chartQuejas.destroy();
    chartQuejas = new Chart(ctxQ, { type:'doughnut', data:{ labels: Object.keys(tipos).length ? Object.keys(tipos) : ['Sin quejas'], datasets:[{ data: Object.values(tipos).length ? Object.values(tipos) : [1], backgroundColor: cols }] }, options:{ plugins:{ legend:{ labels:{ color:'white', font:{ size:10 } } } } } });
  }
  const ctxE = document.getElementById('chartEdad');
  if (ctxE) {
    const r = {'18-25':0,'26-35':0,'36-50':0,'51+':0};
    clientes.forEach(c => { const e = parseInt(c.edad); if(e<=25)r['18-25']++; else if(e<=35)r['26-35']++; else if(e<=50)r['36-50']++; else r['51+']++; });
    if (chartEdad) chartEdad.destroy();
    chartEdad = new Chart(ctxE, { type:'bar', data:{ labels:Object.keys(r), datasets:[{ label:'Clientes', data:Object.values(r), backgroundColor:'#d4af37' }] }, options:{ plugins:{legend:{display:false}}, scales:{ x:{ticks:{color:'white'},grid:{color:'#333'}}, y:{ticks:{color:'white',stepSize:1},grid:{color:'#333'}} } } });
  }
}

// CLIENTE FUNCIONES
function cargarResumenJuegos(dni) {
  const h = DB.getHistorialJuegos(dni);
  const g = h.filter(r => r.ganancia > r.apuesta).length;
  const p = h.filter(r => r.ganancia <= r.apuesta).length;
  const b = h.reduce((s,r) => s + (r.ganancia - r.apuesta), 0);
  const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  set('partidasGanadas', g); set('partidasPerdidas', p); set('beneficioNeto', 'S/ ' + b.toFixed(2));
  const det = document.getElementById('detalleJuegos');
  if (!det) return;
  det.innerHTML = h.length ? '<table style="width:100%;border-collapse:collapse;color:white;"><thead><tr><th style="padding:6px;text-align:left">Fecha</th><th style="padding:6px">Juego</th><th style="padding:6px">Apuesta</th><th style="padding:6px">Ganancia</th><th style="padding:6px">Resultado</th></tr></thead><tbody>' + h.slice(0,20).map(i => '<tr><td style="padding:6px;font-size:12px">' + i.fecha + '</td><td style="padding:6px;font-size:12px">' + i.tipo + '</td><td style="padding:6px;font-size:12px">S/ ' + Number(i.apuesta).toFixed(2) + '</td><td style="padding:6px;font-size:12px">S/ ' + Number(i.ganancia).toFixed(2) + '</td><td style="padding:6px;font-size:12px">' + i.resultado + '</td></tr>').join('') + '</tbody></table>' : '<p style="color:var(--text-muted)">No se han registrado jugadas aun.</p>';
}

function cargarHistorialRecargas(dni) {
  const s = DB.getRecargas().filter(r => r.dni === dni);
  const cont = document.getElementById('historialRecargas');
  if (!cont) return;
  cont.innerHTML = s.length ? '<h3 style="margin-top:1rem;color:var(--gold)">Mis solicitudes</h3><table style="width:100%;border-collapse:collapse;color:white"><thead><tr><th style="padding:6px;text-align:left">Fecha</th><th style="padding:6px;text-align:left">Monto</th><th style="padding:6px;text-align:left">Estado</th><th style="padding:6px;text-align:left">Comprobante</th></tr></thead><tbody>' + s.map(r => '<tr><td style="padding:6px">' + r.fecha + '</td><td style="padding:6px">S/ ' + Number(r.monto).toFixed(2) + '</td><td style="padding:6px;color:' + (r.status==='Aprobado'?'#4caf50':r.status==='Rechazado'?'#e05555':'#f0c040') + '">' + r.status + '</td><td style="padding:6px">' + (r.foto ? '<a href="' + r.foto + '" target="_blank" style="color:var(--gold)">Ver imagen</a>' : '-') + '</td></tr>').join('') + '</tbody></table>' : '<p style="color:var(--text-muted)">No tienes solicitudes de recarga.</p>';
}

window.solicitarRecarga = function () {
  const data = sessionStorage.getItem('clienteLogged');
  if (!data) { window.location.href = 'login.html'; return; }
  const cliente = JSON.parse(data);
  const monto = parseFloat(document.getElementById('recargaMonto')?.value);
  const descripcion = document.getElementById('recargaDescripcion')?.value.trim();
  const file = document.getElementById('recargaFoto')?.files[0];
  const msg = document.getElementById('recargaMsg');
  if (!monto || monto < 10 || !descripcion) { if(msg){msg.style.color='var(--danger)';msg.textContent='Completa monto (minimo S/10) y descripcion.';} return; }
  const guardar = foto => {
    DB.addRecarga({ dni: cliente.dni, monto, descripcion, foto: foto||'', fecha: new Date().toLocaleString('es-PE') });
    if(msg){msg.style.color='var(--success)';msg.textContent='Solicitud enviada. Espera aprobacion del admin.';}
    if(document.getElementById('recargaMonto')) document.getElementById('recargaMonto').value='';
    if(document.getElementById('recargaDescripcion')) document.getElementById('recargaDescripcion').value='';
    if(document.getElementById('recargaFoto')) document.getElementById('recargaFoto').value='';
    cargarHistorialRecargas(cliente.dni);
  };
  if (file) { const r = new FileReader(); r.onload = e => guardar(e.target.result); r.readAsDataURL(file); }
  else guardar('');
};

function mostrarDetallePerfil(cliente) {
  if (!cliente || !cliente.dni) return;
  const h = DB.getHistorialJuegos(cliente.dni);
  const recargas = DB.getRecargas().filter(r => r.dni === cliente.dni);
  const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
  set('detalleDNI', cliente.dni);
  set('detalleSegmento', cliente.segmento || 'estandar');
  set('detalleSaldo', 'S/ ' + Number(cliente.saldo||0).toFixed(2));
  set('detalleJugadasTotales', h.length);
  set('detalleGanadas', h.filter(r => r.ganancia > r.apuesta).length);
  set('detallePerdidas', h.filter(r => r.ganancia <= r.apuesta).length);
  set('detalleRecargasAprobadas', recargas.filter(r => r.status==='Aprobado').length);
  set('detalleRecargasPendientes', recargas.filter(r => r.status==='Pendiente').length);
  set('saldoActual', 'S/ ' + Number(cliente.saldo||0).toFixed(2));
}

window.guardarPerfilCliente = function () {
  const data = sessionStorage.getItem('clienteLogged');
  if (!data) { window.location.href = 'login.html'; return; }
  const cliente = JSON.parse(data);
  const nombre = document.getElementById('perfilNombre')?.value.trim();
  const correo = document.getElementById('perfilCorreo')?.value.trim();
  const edad = parseInt(document.getElementById('perfilEdad')?.value, 10);
  const segmento = document.getElementById('perfilSegmento')?.value || 'estandar';
  const msg = document.getElementById('perfilMsg');
  if (!nombre || !correo || isNaN(edad) || edad < 18) { if(msg){msg.style.color='var(--danger)';msg.textContent='Revisa los datos.';} return; }
  try {
    const act = DB.updateCliente(cliente.dni, { nombre, edad, correo, segmento });
    sessionStorage.setItem('clienteLogged', JSON.stringify(act));
    if(msg){msg.style.color='var(--success)';msg.textContent='Perfil actualizado correctamente.';}
    if(document.getElementById('userFullName')) document.getElementById('userFullName').textContent = nombre;
    if(document.getElementById('welcomeMsg')) document.getElementById('welcomeMsg').textContent = nombre.split(' ')[0];
    mostrarDetallePerfil(act);
  } catch(err) { if(msg){msg.style.color='var(--danger)';msg.textContent='Error: '+err.message;} }
};

function cerrarSesion() { sessionStorage.clear(); window.location.href = 'login.html'; }
function cerrarSesionCliente() { sessionStorage.removeItem('clienteLogged'); window.location.href = 'index.html'; }
function irAQuejas() { window.location.href = 'queja.html'; }

function cerrarModal(id) {
  if (!id) { document.querySelectorAll('.modal-overlay.active,.modal-marketing-overlay.active').forEach(el => el.classList.remove('active')); const f=document.getElementById('gameFrame'); if(f)f.src=''; return; }
  const el = document.getElementById(id); if(el) el.classList.remove('active');
  if (id==='modalJuego') { const f=document.getElementById('gameFrame'); if(f)f.src=''; }
}

function mostrarPromocion(nombre) {
  const descs = { 'Descuento del 10%':'Obtén un 10% de descuento en tus próximas apuestas. Valido 24h.', 'Bono del 10%':'Bono del 10% en tu proxima recarga. Valido 24h.', 'Free Spins':'20 giros gratis en tragamonedas. Recarga minima S/50.', 'Free ticket':'Por ganancias mayores a S/100, ticket gratis con 50% del monto ganado.', 'VIP Ticket':'Acceso exclusivo a torneos VIP.' };
  const ne = document.getElementById('modalPromoNombre'), de = document.getElementById('modalPromoDescription');
  if(ne) ne.textContent = nombre; if(de) de.textContent = descs[nombre]||'Promocion especial.';
  const m = document.getElementById('modalPromo'); if(m) m.classList.add('active');
}

function togglePassword() {
  const input = document.getElementById('clave'), btn = document.getElementById('btnToggle');
  if (!input) return;
  if (input.type==='password') { input.type='text'; if(btn)btn.classList.remove('hidden'); }
  else { input.type='password'; if(btn)btn.classList.add('hidden'); }
}

function marcarError(input) { if(!input)return; input.style.borderColor='var(--danger)'; input.style.boxShadow='0 0 10px rgba(255,77,77,0.2)'; }
function limpiarEstilos() { document.querySelectorAll('input,textarea').forEach(el => { el.style.borderColor=''; el.style.boxShadow=''; }); }

// ============================================================
//  SISTEMA DE LANZAMIENTO DE JUEGOS (NUEVA PESTAÑA)
// ============================================================

window.abrirJuego = function(nombre) {
    const listaJuegos = [
        { nombre: 'Ruleta', url: 'ruleta.html' }, 
        { nombre: 'Blackjack', url: 'blackjack.html' },
        { nombre: 'Tragamonedas', url: 'tragamonedas.html' }, 
        { nombre: 'Poker Texas', url: 'poker.html' },
        { nombre: 'Baccarat', url: 'baccarat.html' }, 
        { nombre: 'Craps - Dados', url: 'craps.html' },
        { nombre: 'Craps', url: 'craps.html' }
    ];

    const promociones = ['Descuento del 10%', 'Free Spins', 'Free ticket', 'Bono del 10%', 'VIP Ticket'];

    // 1. Verificar si es una promoción
    if (promociones.includes(nombre)) {
        alert(`¡Promoción '${nombre}' reclamada y activada en tu cuenta!`);
        return;
    }

    // 2. Buscar el juego en la lista
    const game = listaJuegos.find(g => g.nombre === nombre);
    
    if (game) {
        // ESTO FUERZA A QUE SE ABRA EN UNA NUEVA PESTAÑA SIEMPRE
        window.open(game.url, '_blank');
    } else {
        console.error("Juego no encontrado:", nombre);
        alert("El juego que intentas abrir no está disponible en este momento.");
    }
};