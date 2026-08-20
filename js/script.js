const DB_URL = "https://amigo-goloso-default-rtdb.firebaseio.com";
const MIN_PARTICIPANTES = 3;
const MAX_INTENTOS = 8;

const el = (id) => document.getElementById(id);
const toastEl = el('toast');
let toastTimer = null;
function toast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}
function esperar(ms){ return new Promise(r => setTimeout(r, ms)); }

// ---------- Helpers de red ----------
async function getJSON(path){
  const res = await fetch(`${DB_URL}/${path}.json`);
  if(!res.ok) throw new Error('No se pudo conectar con la base de datos');
  return res.json();
}
async function postJSON(path, data){
  const res = await fetch(`${DB_URL}/${path}.json`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  });
  if(!res.ok) throw new Error('No se pudo guardar en la base de datos');
  return res.json();
}

// Lectura con ETag (para escritura condicional / evitar choques entre dispositivos)
async function getConETag(path){
  const res = await fetch(`${DB_URL}/${path}.json`, {
    headers: { 'X-Firebase-ETag': 'true' }
  });
  if(!res.ok) throw new Error('No se pudo conectar con la base de datos');
  const etag = res.headers.get('ETag');
  const data = await res.json();
  return { data, etag };
}

// Escritura que solo se aplica si nadie más modificó el dato desde que lo leímos
async function putConETag(path, data, etag){
  const res = await fetch(`${DB_URL}/${path}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'if-match': etag || '' },
    body: JSON.stringify(data)
  });
  if(res.status === 412){ return { conflicto: true }; }
  if(!res.ok) throw new Error('No se pudo guardar en la base de datos');
  const body = await res.json();
  return { conflicto: false, body };
}

let participantesCache = {};
let sorteoCache = null; // { iniciado, pool: [...], asignaciones: {giverId: receiverId} }

// ---------- Registro ----------
el('btnRegistrar').addEventListener('click', registrar);
el('inputNombre').addEventListener('keydown', (e) => { if(e.key === 'Enter') registrar(); });

async function registrar(){
  if(sorteoCache && sorteoCache.iniciado){
    toast('El sorteo ya comenzó, no se pueden registrar más personas.');
    return;
  }
  const nombre = el('inputNombre').value.trim();
  if(!nombre){ toast('Escribe tu nombre primero'); return; }
  el('btnRegistrar').disabled = true;
  try{
    const resp = await postJSON('participantes', {nombre, ts: Date.now()});
    const id = resp.name;
    localStorage.setItem('ag_miId', id);
    localStorage.setItem('ag_miNombre', nombre);
    el('inputNombre').value = '';
    toast(`¡Listo, ${nombre}! Ya estás en el sorteo 🎉`);
    await cargarParticipantes();
  }catch(err){
    toast('Ups, no se pudo registrar. Intenta de nuevo.');
  }finally{
    el('btnRegistrar').disabled = false;
  }
}

// ---------- Lista de participantes ----------
async function cargarParticipantes(){
  try{
    const data = await getJSON('participantes');
    participantesCache = data || {};
    renderParticipantes();
    renderEstadoControl();
  }catch(err){
    // silencioso en polling
  }
}

function renderParticipantes(){
  const ids = Object.keys(participantesCache);
  el('countBadge').textContent = ids.length;
  const cont = el('listaParticipantes');
  if(ids.length === 0){
    cont.innerHTML = '<span class="empty">Todavía no hay nadie registrado. ¡Sé el primero!</span>';
    return;
  }
  ids.sort((a,b) => (participantesCache[a].ts||0) - (participantesCache[b].ts||0));
  cont.innerHTML = ids.map(id => {
    const nombre = escapeHtml(participantesCache[id].nombre || '(sin nombre)');
    return `<span class="chip"><span class="dot"></span>${nombre}</span>`;
  }).join('');
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ---------- Estado del sorteo (candado de registro + botón habilitado) ----------
async function cargarEstadoSorteo(){
  try{
    const data = await getJSON('sorteo');
    sorteoCache = data || null;
    renderEstadoControl();
  }catch(err){
    // silencioso en polling
  }
}

function renderEstadoControl(){
  const total = Object.keys(participantesCache).length;
  const iniciado = !!(sorteoCache && sorteoCache.iniciado);

  // Candado de registro
  el('lockNote').style.display = iniciado ? 'block' : 'none';
  el('inputNombre').disabled = iniciado;
  el('btnRegistrar').disabled = iniciado;

  // Botón de sorteo individual
  const btn = el('btnAmigoSecreto');
  if(total < MIN_PARTICIPANTES && !iniciado){
    btn.disabled = true;
    el('descSorteo').textContent = `Se necesitan al menos ${MIN_PARTICIPANTES} personas registradas (van ${total}).`;
  } else {
    btn.disabled = false;
    el('descSorteo').textContent = iniciado
      ? 'El sorteo ya está en marcha. Identifícate y saca tu amigo secreto.'
      : 'Identifícate y presiona el botón para sacar tu amigo secreto.';
  }
}

// ---------- Identidad ----------
function mostrarSelectorIdentidad(){
  const select = el('selectIdentidad');
  const ids = Object.keys(participantesCache);
  if(ids.length === 0){
    select.innerHTML = '<option>No hay participantes aún</option>';
  } else {
    ids.sort((a,b) => (participantesCache[a].ts||0) - (participantesCache[b].ts||0));
    select.innerHTML = ids.map(id =>
      `<option value="${id}">${escapeHtml(participantesCache[id].nombre)}</option>`
    ).join('');
  }
  el('identifyBox').style.display = 'block';
}

el('btnConfirmarIdentidad').addEventListener('click', () => {
  const select = el('selectIdentidad');
  const id = select.value;
  if(!id || !participantesCache[id]){ toast('Selecciona tu nombre de la lista'); return; }
  localStorage.setItem('ag_miId', id);
  localStorage.setItem('ag_miNombre', participantesCache[id].nombre);
  el('identifyBox').style.display = 'none';
  toast(`¡Hola, ${participantesCache[id].nombre}!`);
});

el('btnCambiarIdentidad').addEventListener('click', () => {
  localStorage.removeItem('ag_miId');
  localStorage.removeItem('ag_miNombre');
  el('revealCard').style.display = 'none';
  el('btnCambiarIdentidad').style.display = 'none';
  mostrarSelectorIdentidad();
});

// ---------- Sacar amigo secreto (sorteo individual, seguro ante choques) ----------
el('btnAmigoSecreto').addEventListener('click', sacarAmigoSecreto);

async function sacarAmigoSecreto(){
  let miId = localStorage.getItem('ag_miId');

  // Asegurar que tenemos la lista de participantes fresca antes de identificar
  await cargarParticipantes();

  if(!miId || !participantesCache[miId]){
    mostrarSelectorIdentidad();
    toast('Primero identifícate en la lista');
    return;
  }

  const total = Object.keys(participantesCache).length;
  if(total < MIN_PARTICIPANTES){
    toast(`Se necesitan al menos ${MIN_PARTICIPANTES} personas registradas.`);
    return;
  }

  el('btnAmigoSecreto').disabled = true;
  try{
    // 1) Si ya tiene asignación guardada, mostrarla sin volver a sortear
    const actual = await getJSON('sorteo');
    if(actual && actual.asignaciones && actual.asignaciones[miId]){
      await mostrarResultado(miId, actual.asignaciones[miId]);
      sorteoCache = actual;
      renderEstadoControl();
      return;
    }

    // 2) Intentar reservar un amigo secreto de forma atómica (reintenta si hay choques)
    let intentos = 0;
    while(intentos < MAX_INTENTOS){
      intentos++;
      const { data, etag } = await getConETag('sorteo');
      let estado = data;

      // Ya alguien más lo asignó mientras tanto
      if(estado && estado.asignaciones && estado.asignaciones[miId]){
        await mostrarResultado(miId, estado.asignaciones[miId]);
        sorteoCache = estado;
        renderEstadoControl();
        return;
      }

      // Inicializar el sorteo si es el primer clic de todos
      if(!estado || !estado.iniciado){
        const idsActuales = Object.keys(await getJSON('participantes') || {});
        estado = {
          iniciado: true,
          pool: mezclar(idsActuales),
          asignaciones: {}
        };
      }

      const pool = estado.pool.slice();
      const asignaciones = { ...(estado.asignaciones || {}) };
      let candidatos = pool.filter(id => id !== miId);

      if(candidatos.length === 0){
        // Caso límite: solo queda uno mismo en el pool.
        // Se intercambia con una asignación ya hecha para no dejar a nadie sin pareja.
        const givers = Object.keys(asignaciones);
        if(givers.length === 0){
          toast('No hay suficientes personas para completar el sorteo todavía.');
          return;
        }
        const giverAleatorio = givers[Math.floor(Math.random() * givers.length)];
        const recibidorPrevio = asignaciones[giverAleatorio];
        asignaciones[giverAleatorio] = miId;
        asignaciones[miId] = recibidorPrevio;
        estado.pool = pool.filter(id => id !== miId);
      } else {
        const elegido = candidatos[Math.floor(Math.random() * candidatos.length)];
        asignaciones[miId] = elegido;
        const idx = pool.indexOf(elegido);
        pool.splice(idx, 1);
        estado.pool = pool;
      }

      estado.asignaciones = asignaciones;
      estado.fecha = Date.now();

      const resultado = await putConETag('sorteo', estado, etag);
      if(resultado.conflicto){
        // Otra persona escribió al mismo tiempo: esperar un poco y reintentar
        await esperar(150 + Math.random() * 250);
        continue;
      }

      sorteoCache = estado;
      renderEstadoControl();
      await mostrarResultado(miId, asignaciones[miId]);
      return;
    }

    toast('Hubo mucho tráfico en el sorteo. Intenta de nuevo en unos segundos.');
  }catch(err){
    toast('No se pudo sacar tu amigo secreto. Intenta de nuevo.');
  }finally{
    el('btnAmigoSecreto').disabled = false;
  }
}

function mezclar(arr){
  const copia = [...arr];
  for(let i = copia.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

async function mostrarResultado(miId, receiverId){
  let nombre = participantesCache[receiverId] ? participantesCache[receiverId].nombre : null;
  if(!nombre){
    const p = await getJSON(`participantes/${receiverId}`);
    nombre = p ? p.nombre : 'Alguien misterioso';
  }
  el('nombreRevelado').textContent = nombre;
  el('revealCard').style.display = 'block';
  el('btnCambiarIdentidad').style.display = 'inline-block';
}

// ---------- Inicio y actualización periódica ----------
async function refrescarTodo(){
  await cargarParticipantes();
  await cargarEstadoSorteo();
}

refrescarTodo();
setInterval(refrescarTodo, 4000);
