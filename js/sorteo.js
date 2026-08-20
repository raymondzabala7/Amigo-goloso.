const MAX_INTENTOS = 8;

let participantesCache = {};

// ---------- Identidad ----------
function detectarIdentidad(){
  const miId = localStorage.getItem('ag_miId');
  const miNombre = localStorage.getItem('ag_miNombre');
  if(miId && miNombre){
    el('quienEres').textContent = `Entraste como ${miNombre}`;
    el('quienEres').style.display = 'block';
    el('identifyBox').style.display = 'none';
    return miId;
  }
  return null;
}

async function mostrarSelectorIdentidad(){
  try{
    const data = await getJSON('participantes');
    participantesCache = data || {};
  }catch(err){ /* usamos lo que haya en caché */ }

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
  el('quienEres').style.display = 'none';
  el('identifyBox').style.display = 'block';
}

el('btnConfirmarIdentidad').addEventListener('click', () => {
  const select = el('selectIdentidad');
  const id = select.value;
  if(!id || !participantesCache[id]){ toast('Selecciona tu nombre de la lista'); return; }
  localStorage.setItem('ag_miId', id);
  localStorage.setItem('ag_miNombre', participantesCache[id].nombre);
  el('identifyBox').style.display = 'none';
  el('quienEres').textContent = `Entraste como ${participantesCache[id].nombre}`;
  el('quienEres').style.display = 'block';
  toast(`¡Hola, ${participantesCache[id].nombre}!`);
});

el('btnCambiarIdentidad').addEventListener('click', () => {
  localStorage.removeItem('ag_miId');
  localStorage.removeItem('ag_miNombre');
  el('revealCard').style.display = 'none';
  el('btnCambiarIdentidad').style.display = 'none';
  el('btnAmigoSecreto').style.display = 'inline-block';
  mostrarSelectorIdentidad();
});

// ---------- Sacar amigo secreto (seguro ante choques entre dispositivos) ----------
el('btnAmigoSecreto').addEventListener('click', sacarAmigoSecreto);

async function sacarAmigoSecreto(){
  let miId = detectarIdentidad();

  try{
    const data = await getJSON('participantes');
    participantesCache = data || {};
  }catch(err){
    toast('No se pudo conectar. Revisa tu conexión e intenta de nuevo.');
    return;
  }

  if(!miId || !participantesCache[miId]){
    await mostrarSelectorIdentidad();
    toast('Primero identifícate para saber quién eres en el sorteo');
    return;
  }

  const total = Object.keys(participantesCache).length;
  if(total < MIN_PARTICIPANTES){
    toast(`Todavía no hay suficientes personas registradas (mínimo ${MIN_PARTICIPANTES}).`);
    return;
  }

  el('btnAmigoSecreto').disabled = true;
  try{
    // 1) Si ya tiene asignación guardada, mostrarla sin volver a sortear
    const actual = await getJSON('sorteo');
    if(actual && actual.asignaciones && actual.asignaciones[miId]){
      await mostrarResultado(actual.asignaciones[miId]);
      return;
    }

    // 2) Intentar reservar un amigo secreto de forma atómica (reintenta si hay choques)
    let intentos = 0;
    while(intentos < MAX_INTENTOS){
      intentos++;
      const { data, etag } = await getConETag('sorteo');
      let estado = data;

      if(estado && estado.asignaciones && estado.asignaciones[miId]){
        await mostrarResultado(estado.asignaciones[miId]);
        return;
      }

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
        await esperar(150 + Math.random() * 250);
        continue;
      }

      await mostrarResultado(asignaciones[miId]);
      return;
    }

    toast('Hubo mucho tráfico en el sorteo. Intenta de nuevo en unos segundos.');
  }catch(err){
    toast('No se pudo sacar tu amigo secreto. Intenta de nuevo.');
  }finally{
    el('btnAmigoSecreto').disabled = false;
  }
}

async function mostrarResultado(receiverId){
  let nombre = participantesCache[receiverId] ? participantesCache[receiverId].nombre : null;
  if(!nombre){
    const p = await getJSON(`participantes/${receiverId}`);
    nombre = p ? p.nombre : 'Alguien misterioso';
  }
  el('nombreRevelado').textContent = nombre;
  el('revealCard').style.display = 'block';
  el('btnAmigoSecreto').style.display = 'none';
  el('btnCambiarIdentidad').style.display = 'inline-block';
}

// ---------- Inicio ----------
(function init(){
  detectarIdentidad();
})();
