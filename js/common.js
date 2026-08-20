// ---------- Configuración ----------
const DB_URL = "https://amigo-goloso-default-rtdb.firebaseio.com";
const MIN_PARTICIPANTES = 3;

// ---------- Helpers de UI ----------
const el = (id) => document.getElementById(id);

function toast(msg){
  const toastEl = el('toast');
  if(!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

function esperar(ms){ return new Promise(r => setTimeout(r, ms)); }

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function mezclar(arr){
  const copia = [...arr];
  for(let i = copia.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// ---------- Helpers de red (Firebase REST) ----------
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
