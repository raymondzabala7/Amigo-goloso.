let participantesCache = {};
let sorteoCache = null;

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
    toast(`¡Listo, ${nombre}! Ya estás en el sorteo 🎉`);
    await refrescarTodo();
    mostrarEstadoRegistrado();
  }catch(err){
    toast('Ups, no se pudo registrar. Intenta de nuevo.');
  }finally{
    el('btnRegistrar').disabled = false;
  }
}

function mostrarEstadoRegistrado(){
  const miId = localStorage.getItem('ag_miId');
  const miNombre = localStorage.getItem('ag_miNombre');
  if(!miId || !participantesCache[miId]) return;

  el('cardRegistroForm').style.display = 'none';
  el('cardYaRegistrado').style.display = 'block';
  el('nombreConfirmado').textContent = miNombre || participantesCache[miId].nombre;
}

function actualizarContador(){
  const total = Object.keys(participantesCache).length;
  el('contadorTexto').textContent = total === 1
    ? 'Hay 1 persona registrada'
    : `Hay ${total} personas registradas`;

  const faltan = MIN_PARTICIPANTES - total;
  el('contadorMin').textContent = faltan > 0
    ? `Faltan al menos ${faltan} más para poder iniciar el sorteo.`
    : '¡Ya se puede iniciar el sorteo cuando quieran!';
}

function actualizarCandado(){
  const iniciado = !!(sorteoCache && sorteoCache.iniciado);
  el('lockNote').style.display = iniciado ? 'block' : 'none';
  if(iniciado){
    el('inputNombre').disabled = true;
    el('btnRegistrar').disabled = true;
  }
}

async function refrescarTodo(){
  try{
    const [participantes, sorteo] = await Promise.all([
      getJSON('participantes'),
      getJSON('sorteo')
    ]);
    participantesCache = participantes || {};
    sorteoCache = sorteo || null;
    actualizarContador();
    actualizarCandado();

    const miId = localStorage.getItem('ag_miId');
    if(miId && participantesCache[miId]){
      mostrarEstadoRegistrado();
    }
  }catch(err){
    // silencioso en polling
  }
}

refrescarTodo();
setInterval(refrescarTodo, 4000);
