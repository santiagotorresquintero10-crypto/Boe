/* BOE SISTEMA — script.js — v2026.05 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, getDoc, getDocs, where, deleteField }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBZsx9UGOGijy5WYdDzWIZcpt355gRTe-Y",
  authDomain: "boe-sistema.firebaseapp.com",
  projectId: "boe-sistema",
  storageBucket: "boe-sistema.firebasestorage.app",
  messagingSenderId: "958130308875",
  appId: "1:958130308875:web:1f69636f0e292ad763040e"
};
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ── DEFAULTS ── */
const DEFAULT_CHECKLIST = [
  {label:'RUT recibido',done:false},{label:'Cámara de comercio',done:false},
  {label:'Certificación bancaria',done:false},{label:'Documento de identidad',done:false},
  {label:'Contrato firmado',done:false},{label:'Tarjeta profesional',done:false},
  {label:'Soportes de atención recibidos',done:false},{label:'Informe de servicios generado',done:false},
  {label:'Factura generada',done:false},{label:'Factura enviada al doctor',done:false},
  {label:'Factura aprobada por doctor',done:false},{label:'Factura radicada a entidad',done:false},
  {label:'Número de radicado obtenido',done:false},{label:'Soporte de radicación guardado',done:false},
  {label:'Glosas revisadas y respondidas',done:false},{label:'Pago confirmado / verificado',done:false},
  {label:'Informe final entregado al doctor',done:false},{label:'Proceso archivado y cerrado',done:false},
];
const COLORS = ['#1757a8','#1a6b3c','#b07d0e','#c0392b','#6c3483','#117a8b','#784212','#1a5276'];

/* ── STATE ── */
let currentUser=null, currentProfile=null;
let doctors=[], formatos=[], tareas=[], teamMembers=[], groups=[];
let draggedId=null, currentChannel='general', currentChannelIsGroup=false;
let chatUnsub=null;
let editingDoctorId=null, editingFormatoId=null, editingTareaId=null, editingGroupId=null;
let mentionMatches=[], mentionIndex=-1;
let localChecklist=[];

/* ── UTILS ── */
const genUid = () => Date.now().toString(36)+Math.random().toString(36).slice(2);
const initials = n => (n||'?').split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
const avatarColor = name => { let h=0; for(let c of (name||'')) h=(h<<5)-h+c.charCodeAt(0); return COLORS[Math.abs(h)%COLORS.length]; };
const fmtDate = s => s ? new Date(s+'T12:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const fmtMonth = s => { if(!s)return'—'; const[y,m]=s.split('-'); return ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][parseInt(m)-1]+' '+y; };
const escHtml = t => (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const statusClass = s => s==='Pendiente'?'pending':s==='En revisión'?'review':'done';
function timeAgo(ts) {
  if (!ts) return '';
  const ms  = ts?.toMillis ? ts.toMillis() : (ts?.seconds ? ts.seconds*1000 : new Date(ts).getTime());
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60)   return 'ahora';
  if (sec < 3600) return Math.floor(sec/60)+'m';
  if (sec < 86400)return Math.floor(sec/3600)+'h';
  return new Date(ms).toLocaleDateString('es-CO',{day:'2-digit',month:'short'});
}

function toast(msg,type=''){
  const el=document.getElementById('toast');
  el.textContent=msg; el.className='toast show'+(type?' '+type:'');
  clearTimeout(el._t); el._t=setTimeout(()=>el.className='toast',3200);
}
function showLoading(v){ document.getElementById('appLoading').classList.toggle('hidden',!v); }
function renderMentions(text){ return escHtml(text).replace(/@(\w+)/g,'<span class="mention">@$1</span>'); }

/* ── LOGIN ── */
window.switchTab = tab => {
  document.getElementById('formLogin').style.display    = tab==='login'?'flex':'none';
  document.getElementById('formRegister').style.display = tab==='register'?'flex':'none';
  document.getElementById('tabLogin').classList.toggle('active',tab==='login');
  document.getElementById('tabReg').classList.toggle('active',tab==='register');
};
window.togglePass = (id,btn) => {
  const inp=document.getElementById(id), show=inp.type==='password';
  inp.type=show?'text':'password';
  btn.innerHTML=show?'<i class="fa-solid fa-eye-slash"></i>':'<i class="fa-solid fa-eye"></i>';
};
window.showForgotPassword = () => {
  document.getElementById('formLogin').style.display = 'none';
  document.getElementById('formForgot').style.display = 'block';
  document.getElementById('forgotError').textContent = '';
  document.getElementById('forgotSuccess').style.display = 'none';
};
window.showLoginForm = () => {
  document.getElementById('formForgot').style.display = 'none';
  document.getElementById('formLogin').style.display = 'block';
};
window.doForgotPassword = async () => {
  const email = document.getElementById('fEmail').value.trim();
  const errEl = document.getElementById('forgotError');
  const sucEl = document.getElementById('forgotSuccess');
  errEl.textContent = ''; sucEl.style.display = 'none';
  if (!email) { errEl.textContent = 'Ingresa tu correo electrónico.'; return; }
  try {
    await sendPasswordResetEmail(auth, email);
    sucEl.textContent = `✅ Enlace enviado a ${email}. Revisa tu bandeja de entrada y spam.`;
    sucEl.style.display = 'block';
  } catch(e) {
    errEl.textContent = e.code === 'auth/user-not-found'
      ? 'No existe una cuenta con ese correo.'
      : 'Error: ' + e.message;
  }
};

window.doLogin = async () => {
  const email=document.getElementById('lEmail').value.trim();
  const pass=document.getElementById('lPass').value;
  const err=document.getElementById('loginError');
  const btn=document.getElementById('btnLogin');
  err.textContent='';
  if(!email||!pass){err.textContent='Completa todos los campos.';return;}
  btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Entrando…';
  try{ await signInWithEmailAndPassword(auth,email,pass); }
  catch(e){ err.textContent=friendlyErr(e.code); btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-right-to-bracket"></i> Entrar al sistema'; }
};
window.doRegister = async () => {
  const nombre=document.getElementById('rNombre').value.trim();
  const apellido=document.getElementById('rApellido').value.trim();
  const rol=document.getElementById('rRol').value;
  const email=document.getElementById('rEmail').value.trim();
  const pass=document.getElementById('rPass').value;
  const err=document.getElementById('registerError');
  const btn=document.getElementById('btnRegister');
  err.textContent='';
  if(!nombre||!apellido||!email||!pass){err.textContent='Completa todos los campos.';return;}
  if(pass.length<6){err.textContent='La contraseña debe tener al menos 6 caracteres.';return;}
  btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Creando…';
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,pass);
    const full=nombre+' '+apellido;
    await setDoc(doc(db,'users',cred.user.uid),{uid:cred.user.uid,nombre,apellido,nombreCompleto:full,rol,email,color:avatarColor(full),createdAt:serverTimestamp()});
  }catch(e){ err.textContent=friendlyErr(e.code); btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-user-plus"></i> Crear cuenta'; }
};
const friendlyErr = code => ({'auth/user-not-found':'Usuario no encontrado.','auth/wrong-password':'Contraseña incorrecta.','auth/email-already-in-use':'Correo ya registrado.','auth/invalid-email':'Correo no válido.','auth/weak-password':'Contraseña muy débil.','auth/invalid-credential':'Correo o contraseña incorrectos.'}[code]||'Error: '+code);
window.doLogout = async () => {
  if(!confirm('¿Cerrar sesión?')) return;
  _authSessionUid = null;        // invalidar cualquier consulta en curso
  limpiarEstadoSesion();          // limpiar permisos, rol, menú de esta sesión
  await signOut(auth);
};

/* ── AUTH STATE ── */
let _authSessionUid = null;   // UID de la sesión que se está cargando (control anti-carrera)

onAuthStateChanged(auth, async user => {
  showLoading(true);
  if(user){
    // ── Marcar esta sesión con el UID actual (para descartar consultas viejas) ──
    _authSessionUid = user.uid;
    const miUid = user.uid;

    // ── Limpiar por completo el estado de la sesión anterior ANTES de cargar la nueva ──
    limpiarEstadoSesion();

    try {
      currentUser=user;
      const snap=await getDoc(doc(db,'users',user.uid));
      // Si mientras cargaba cambió el usuario, abortar (condición de carrera)
      if (_authSessionUid !== miUid) return;
      currentProfile=snap.exists()?snap.data():{nombreCompleto:user.email,rol:'Usuario',color:'#1757a8'};

      try { await cargarPermisosUsuario(user, miUid); }
      catch(ePerm){ console.warn('No se pudieron cargar permisos, se otorga acceso completo:', ePerm); esAdmin=false; permisosUsuario=null; }

      // Verificar de nuevo tras la carga asíncrona de permisos
      if (_authSessionUid !== miUid) return;
      bootApp();
    } catch(err) {
      console.error('Error al iniciar la app:', err);
      if (_authSessionUid !== miUid) return;
      try { permisosUsuario=null; bootApp(); } catch(e2){ console.error('Fallo crítico en bootApp:', e2); }
      showLoading(false);
    }
  } else {
    _authSessionUid = null;
    limpiarEstadoSesion();
    currentUser=null; currentProfile=null;
    document.getElementById('loginScreen').style.display='flex';
    document.getElementById('appRoot').style.display='none';
    showLoading(false);
  }
});

/* Limpia TODO el estado temporal de la sesión (no toca datos ni permisos en la BD) */
function limpiarEstadoSesion(){
  currentUser = null;
  currentProfile = null;
  esAdmin = false;
  permisosUsuario = null;
  menuGrupos = [];
  _menuGruposCargado = false;  // ← los grupos deben recargarse desde la BD en la nueva sesión
  _grupoEstadoCargado = false;
  _cliGrupoCargado = false;   // ← forzar recarga de grupos de menú/clientes en la nueva sesión
  // Restaurar el menú a su estado base (todos los ítems visibles, sin filtros heredados)
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(el=>{ el.style.display=''; });
  document.querySelectorAll('.sidebar-nav .nav-group-label').forEach(el=>{ el.style.display=''; });
  const cont = document.getElementById('menuGruposContainer');
  if (cont) cont.innerHTML='';
  const div = document.getElementById('menuGruposDivider');
  if (div) div.style.display='none';
  const adminItem = document.getElementById('navUsuariosPermisos');
  if (adminItem) adminItem.style.display='none';
}

/* ══════════ SISTEMA DE PERMISOS POR USUARIO ══════════ */
const ADMIN_EMAILS = ['santiagotorresquintero10@gmail.com','yajaira.quinteroj@gmail.com'];
let esAdmin = false;
let permisosUsuario = null;   // null = admin (todo) | array de claves de vista permitidas

/* Todas las vistas gestionables (clave interna → etiqueta) */
const VISTAS_PERMISOS = {
  dashboard:'Dashboard', doctores:'Clientes', kanban:'Tablero Kanban',
  calendario:'Calendario', tareas:'Tareas', chat:'Chat del equipo',
  equipo:'Equipo',
  reportes:'Reportes', egresos:'UROEXPERTOS', panamericana:'Reportes Panamericana', clinicavida:'Reportes Clínica Vida', turnos:'Cuadro de Turnos',
  uroexpertos2:'Nueva Vista (Uroexpertos 2)', turnos2:'Nueva Vista Turnos',
};

async function cargarPermisosUsuario(user, miUid){
  const email = (user.email||'').toLowerCase();
  const admin = ADMIN_EMAILS.includes(email);
  if (admin) {
    // Verificar que sigue siendo la sesión actual antes de aplicar
    if (miUid && _authSessionUid !== miUid) return;
    esAdmin = true; permisosUsuario = null; return;
  }
  let vistas = null;
  try {
    const snap = await getDoc(doc(db,'permisos',user.uid));
    if (snap.exists() && Array.isArray(snap.data().vistas)) {
      vistas = snap.data().vistas;
    } else {
      vistas = null;  // sin registro → acceso completo (retrocompatible)
    }
  } catch(e){ vistas = null; }
  // ── Anti-condición-de-carrera: solo aplicar si sigue siendo el usuario actual ──
  if (miUid && _authSessionUid !== miUid) return;
  esAdmin = false;
  permisosUsuario = vistas;
}

/* ¿El usuario actual puede ver esta vista? */
function puedeVer(view){
  if (esAdmin || permisosUsuario === null) return true;
  // 'usuarios' (gestión de permisos) solo admins
  if (view === 'usuarios') return esAdmin;
  return permisosUsuario.includes(view);
}

/* Oculta del menú las vistas no permitidas y muestra/oculta el ítem admin */
function aplicarPermisosMenu(){
  // Ítem de "Usuarios y permisos": solo admins
  const adminItem = document.getElementById('navUsuariosPermisos');
  if (adminItem) adminItem.style.display = esAdmin ? '' : 'none';

  // ── ADMIN o usuario sin restricción: RESTAURAR todo visible ──
  // Deshace cualquier ocultamiento por permisos que hubiera quedado de una sesión anterior.
  // (sincronizarModulosFijos se encarga aparte de ocultar los fijos que están en grupos)
  if (esAdmin || permisosUsuario === null) {
    document.querySelectorAll('.sidebar-nav .nav-item, .sidebar-nav .menu-grupo').forEach(el=>{
      // No tocar los ítems fijos que están dentro de un grupo (los gestiona sincronizarModulosFijos)
      if (el.classList.contains('nav-item') && !el.classList.contains('nav-item-grupo')){
        const oc = el.getAttribute('onclick')||'';
        const m = oc.match(/navigate\('([^']+)'/);
        if (m){
          const clave = m[1];
          const enGrupo = menuGrupos.some(g=>(g.modulos||[]).includes(clave));
          if (enGrupo) return; // lo maneja sincronizarModulosFijos
        }
      }
      if (el.id === 'navUsuariosPermisos') return; // solo admins, ya gestionado arriba
      el.style.display = '';
    });
    // Restaurar etiquetas de sección
    document.querySelectorAll('.sidebar-nav .nav-group-label').forEach(l=>{ l.style.display=''; });
    // Re-sincronizar los fijos que están en grupos (para no duplicar)
    if (typeof sincronizarModulosFijos==='function') sincronizarModulosFijos();
    return;
  }

  // ── Usuario restringido ──
  // 1. Ocultar cada nav-item (fijo o de grupo) cuya vista no esté permitida
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item=>{
    const oc = item.getAttribute('onclick')||'';
    const m = oc.match(/navigate(?:VistaDerivada)?\('([^']+)'/);
    if (!m) return;
    const view = m[1];
    if (view==='usuarios') return;  // lo maneja adminItem arriba
    if (!puedeVer(view)) item.style.display='none';
  });

  // 2. Ocultar GRUPOS personalizados sin ninguna vista autorizada visible
  document.querySelectorAll('.sidebar-nav .menu-grupo').forEach(grupo=>{
    const items = grupo.querySelectorAll('.nav-item-grupo');
    let algunoVisible = false;
    items.forEach(it=>{ if (it.style.display!=='none') algunoVisible=true; });
    grupo.style.display = algunoVisible ? '' : 'none';
  });
  const divisor = document.getElementById('menuGruposDivider');
  if (divisor){
    const gruposVisibles = [...document.querySelectorAll('.sidebar-nav .menu-grupo')]
      .some(g=>g.style.display!=='none');
    divisor.style.display = gruposVisibles ? 'block' : 'none';
  }

  // 3. Ocultar etiquetas de sección (Principal/Gestión/Análisis) sin ítems visibles.
  //    Las etiquetas reales usan la clase .nav-group-label (no .nav-section).
  const nav = document.querySelector('.sidebar-nav');
  if (nav){
    const hijos = [...nav.children];
    const esEtiqueta = (el) => el.classList?.contains('nav-group-label')
      || (el.tagName==='DIV' && el.querySelector?.('.nav-group-label'));
    hijos.forEach((el,i)=>{
      if (!esEtiqueta(el)) return;
      // La sección "Principal" (div con botón +) nunca se oculta
      if (el.tagName==='DIV' && el.querySelector?.('.nav-group-label')) return;
      let hayVisible=false;
      for (let j=i+1;j<hijos.length;j++){
        const sib=hijos[j];
        if (esEtiqueta(sib)) break;
        if (sib.classList?.contains('nav-item') && sib.style.display!=='none'){ hayVisible=true; break; }
      }
      el.style.display = hayVisible ? '' : 'none';
    });
  }
}

/* Primera vista permitida (para redirigir tras login) */
function primeraVistaPermitida(){
  if (esAdmin || permisosUsuario === null) return 'dashboard';
  const orden = Object.keys(VISTAS_PERMISOS);
  for (const v of orden) if (permisosUsuario.includes(v)) return v;
  return null;
}

/* ── VISTA "USUARIOS Y PERMISOS" (solo admins) ── */
let upUsuarioSel = null;   // usuario seleccionado {uid, email, nombre}
let upPermisosCache = {};  // uid -> array de vistas (cargado bajo demanda)

async function upInitVista(){
  if (!esAdmin) { toast('Acceso restringido.','error'); navigate(primeraVistaPermitida()||'dashboard'); return; }
  upRenderUsuarios();
}

function upRenderUsuarios(){
  const cont = document.getElementById('upUsersList');
  if (!cont) return;
  const usuarios = teamMembers.slice().sort((a,b)=>(a.nombreCompleto||'').localeCompare(b.nombreCompleto||'','es',{sensitivity:'base'}));
  if (!usuarios.length){ cont.innerHTML='<div style="padding:14px;color:var(--gray-3);font-size:13px">No hay usuarios registrados.</div>'; return; }
  cont.innerHTML = usuarios.map(u=>{
    const admin = ADMIN_EMAILS.includes((u.email||'').toLowerCase());
    const sel = upUsuarioSel && upUsuarioSel.uid===u.uid ? 'sel' : '';
    return `<div class="up-user-item ${sel}" onclick="upSeleccionarUsuario('${u.uid}')">
      <div class="up-user-av" style="background:${u.color||'#1757a8'}">${initials(u.nombreCompleto||u.email||'?')}</div>
      <div class="up-user-info">
        <div class="up-user-nombre">${escHtml(u.nombreCompleto||'(sin nombre)')}</div>
        <div class="up-user-email">${escHtml(u.email||'')}</div>
      </div>
      ${admin?'<span class="up-user-adminbadge">Admin</span>':''}
    </div>`;
  }).join('');
}

window.upSeleccionarUsuario = async (uid) => {
  const u = teamMembers.find(x=>x.uid===uid);
  if (!u) return;
  upUsuarioSel = { uid:u.uid, email:u.email, nombre:u.nombreCompleto };
  upRenderUsuarios();

  const esAdminU = ADMIN_EMAILS.includes((u.email||'').toLowerCase());
  document.getElementById('upPermsEmpty').style.display='none';
  document.getElementById('upPermsPanel').style.display='block';
  document.getElementById('upPermsNombre').textContent = u.nombreCompleto||'(sin nombre)';
  document.getElementById('upPermsEmail').textContent = u.email||'';
  const badge = document.getElementById('upPermsBadge');

  // Cargar permisos actuales del usuario
  let vistas;
  if (esAdminU) {
    vistas = Object.keys(VISTAS_PERMISOS);  // admin: todo
    badge.textContent='Administrador'; badge.className='up-badge admin';
  } else {
    try {
      const snap = await getDoc(doc(db,'permisos',uid));
      vistas = (snap.exists() && Array.isArray(snap.data().vistas)) ? snap.data().vistas : Object.keys(VISTAS_PERMISOS);
    } catch(e){ vistas = Object.keys(VISTAS_PERMISOS); }
    badge.textContent='Usuario'; badge.className='up-badge';
  }
  upPermisosCache[uid] = vistas;

  const list = document.getElementById('upPermsList');
  list.innerHTML = Object.entries(VISTAS_PERMISOS).map(([clave,label])=>{
    const checked = vistas.includes(clave) ? 'checked' : '';
    return `<label class="up-perm-item">
      <input type="checkbox" class="up-perm-check" value="${clave}" ${checked} ${esAdminU?'disabled':''}/>
      <span>${escHtml(label)}</span>
    </label>`;
  }).join('');

  // Deshabilitar guardado para admins (no se pueden restringir)
  const acts = document.querySelector('.up-perms-actions');
  if (acts) acts.style.display = esAdminU ? 'none' : 'flex';
};

window.upTogglesTodos = (val) => {
  document.querySelectorAll('.up-perm-check:not(:disabled)').forEach(c=>c.checked=val);
};

window.upGuardarPermisos = async () => {
  if (!upUsuarioSel) { toast('Selecciona un usuario.','error'); return; }
  if (ADMIN_EMAILS.includes((upUsuarioSel.email||'').toLowerCase())) {
    toast('Los administradores tienen acceso completo (no editable).','info'); return;
  }
  const vistas = [...document.querySelectorAll('.up-perm-check:checked')].map(c=>c.value);
  try {
    await setDoc(doc(db,'permisos',upUsuarioSel.uid), {
      uid: upUsuarioSel.uid,
      email: upUsuarioSel.email||'',
      vistas,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser?.email||'',
    });
    upPermisosCache[upUsuarioSel.uid] = vistas;
    toast(`Permisos guardados para ${upUsuarioSel.nombre||upUsuarioSel.email} (${vistas.length} vista${vistas.length!==1?'s':''}).`,'success');
  } catch(e){ toast('Error al guardar: '+e.message,'error'); }
};

/* ── BOOT ── */
function bootApp(){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('appRoot').style.display='block';
  document.getElementById('sidebarName').textContent=currentProfile.nombreCompleto;
  document.getElementById('sidebarRole').textContent=currentProfile.rol||'Usuario';
  const av=document.getElementById('sidebarAvatar');
  av.textContent=initials(currentProfile.nombreCompleto);
  av.style.background=currentProfile.color||'#1757a8';
  document.getElementById('btnNewGroup').addEventListener('click',()=>openGroupModal());
  startClock(); subscribeAll();
  selectChannel('general',document.querySelector('.chat-channel'));
  // Notificaciones
  requestBrowserNotifPermission();
  subscribeNotifs();
  subscribeEgresos();
  subscribeTurnos();
  setTimeout(notifProcesosPorVencer, 3000);
  // Verificar actualización mensual automática
  setTimeout(verificarActualizacionMensual, 4000);
  showLoading(false);
}

/* ── SUBSCRIPTIONS ── */
let _cliGrupoCargado = false;
function subscribeAll(){
  // Cargar estado de grupos de clientes una sola vez
  if (!_cliGrupoCargado) {
    _cliGrupoCargado = true;
    getDoc(doc(db,'uiPrefs','clienteGrupos')).then(s=>{
      if (s.exists()) { const c=s.data()?.colapsados||{}; Object.keys(c).forEach(k=>clienteGrupoColapsado[k]=true); filterDoctors(); }
    }).catch(()=>{});
    cargarMenuGrupos();
    cargarNombreUro2();
    cargarNombreTurnos2();
  }
  onSnapshot(query(collection(db,'doctors'),orderBy('createdAt','desc')),snap=>{
    doctors=snap.docs.map(d=>({id:d.id,...d.data()}));
    filterDoctors(); renderKanban(); renderDashboard(); updateNavBadges(); updateSelects();
    // Reenviar doctors al iframe — mensaje separado solo para doctors
    const frame = document.getElementById('repFrame');
    if (frame?.contentWindow) {
      frame.contentWindow.postMessage({
        type: 'DOCTORS_UPDATE',
        doctors: doctors.map(d=>({id:d.id, nombre:d.nombre, especialidad:d.especialidad}))
      }, '*');
    }
  });
  onSnapshot(query(collection(db,'formatos'),orderBy('createdAt','desc')),snap=>{
    formatos=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderKanban(); renderDashboard(); updateNavBadges();
    updateNavBadgeCalendario();
    if(document.getElementById('view-calendario')?.classList.contains('active')) renderCalendario();
  });
  onSnapshot(query(collection(db,'tareas'),orderBy('createdAt','desc')),snap=>{
    tareas=snap.docs.map(d=>({id:d.id,...d.data()}));
    applyTareaFilters(); renderDashboard(); updateNavBadges();
    updateNavBadgeCalendario();
    if(document.getElementById('view-calendario')?.classList.contains('active')) renderCalendario();
  });
  onSnapshot(collection(db,'users'),snap=>{
    teamMembers=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderEquipo(); renderDashboard(); updateSelects(); updateKanbanSelects();
  });
  onSnapshot(query(collection(db,'groups'),orderBy('createdAt','desc')),snap=>{
    groups=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderGroupsList();
  });
  subscribeFacturas();
  // ── Aplicar permisos: filtrar menú y redirigir a primera vista permitida ──
  aplicarPermisosMenu();
  if (!esAdmin && permisosUsuario !== null) {
    const destino = primeraVistaPermitida();
    if (destino) navigate(destino);
    else {
      // Sin ninguna vista autorizada: no dejar visible el Dashboard por defecto
      document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      toast('No tienes vistas asignadas. Contacta al administrador.','error');
    }
  }
}
window.navigate = (view,el) => {
  // Vista inexistente (p. ej. módulos eliminados: alertas, resumen) → ir a la primera permitida
  if (!document.getElementById('view-'+view)) {
    const destino = primeraVistaPermitida();
    if (destino && destino!==view && document.getElementById('view-'+destino)) return navigate(destino);
    return;
  }
  // ── Protección por permisos: bloquear vistas no autorizadas ──
  if (!puedeVer(view)) {
    toast('No tienes permiso para acceder a esta vista.','error');
    const destino = primeraVistaPermitida();
    if (destino && destino!==view) return navigate(destino);
    return;
  }
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('view-'+view)?.classList.add('active');
  const sideItem=document.querySelector(`.nav-item[onclick*="'${view}'"]`);
  if(sideItem) sideItem.classList.add('active');
  const labels={dashboard:'Dashboard',doctores:'Clientes',kanban:'Tablero Kanban',tareas:'Tareas',chat:'Chat del equipo',equipo:'Equipo',calendario:'Calendario',reportes:'Reportes',usuarios:'Usuarios y permisos',egresos:'UROEXPERTOS',panamericana:'Reportes Panamericana',clinicavida:'Reportes Clínica Vida',turnos:'Cuadro de Turnos',uroexpertos2:'Nueva Vista',turnos2:'Nueva Vista Turnos'};
  document.getElementById('breadcrumb').textContent=labels[view]||view;
  if(window.innerWidth<=768){ document.getElementById('sidebar').classList.remove('mobile-open'); document.getElementById('sidebarOverlay').classList.remove('open'); }
  if(view==='tareas') applyTareaFilters();
  if(view==='kanban') renderKanban();
  if(view==='dashboard') renderDashboard();
  if(view==='calendario') renderCalendario();
  if(view==='egresos') initEgresos();
  if(view==='uroexpertos2') { cl_subscribeEgresos(); cl_initEgresos(); }
  if(view==='turnos') initTurnos();
  if(view==='turnos2') { ct_subscribeTurnos(); ct_initTurnos(); }
  if(view==='reportes') reenviarDatosReportes();
  if(view==='usuarios') upInitVista();
  if(view==='panamericana') panInit();
  if(view==='clinicavida') cvInit();
};

/* ═══════════════════════════════════════════════════════════════
   GRUPOS DE MENÚ PERSONALIZADOS (Fase 1 — organización visual)
   Los módulos NO se copian: cada grupo referencia módulos existentes
   por su clave de vista. Se guardan en Firestore (uiPrefs/menuGrupos).
═══════════════════════════════════════════════════════════════ */

/* Catálogo de módulos disponibles (clave de vista → etiqueta + ícono) */
const MODULOS_CATALOGO = {
  dashboard:  { label:'Dashboard',           icon:'fa-gauge-high' },
  doctores:   { label:'Clientes',            icon:'fa-briefcase' },
  kanban:     { label:'Tablero Kanban',      icon:'fa-table-columns' },
  calendario: { label:'Calendario',          icon:'fa-calendar-days' },
  tareas:     { label:'Tareas',              icon:'fa-list-check' },
  chat:       { label:'Chat del equipo',     icon:'fa-comments' },
  equipo:     { label:'Equipo',              icon:'fa-users' },
  egresos:    { label:'UROEXPERTOS',         icon:'fa-file-invoice-dollar' },
  panamericana: { label:'Reportes Panamericana', icon:'fa-file-pdf' },
  clinicavida:  { label:'Reportes Clínica Vida', icon:'fa-file-medical' },
  uroexpertos2: { label:'Nueva Vista',        icon:'fa-file-invoice-dollar' },
  turnos2:      { label:'Nueva Vista Turnos',  icon:'fa-calendar-days' },
  turnos:     { label:'Cuadro de Turnos',    icon:'fa-calendar-days' },
  reportes:   { label:'Reportes',            icon:'fa-chart-bar' },
};

/* ── Nombre personalizable de UROEXPERTOS 2 ── */
let uro2Nombre = 'Nueva Vista';
async function cargarNombreUro2(){
  try {
    const snap = await getDoc(doc(db,'uiPrefs','uroexpertos2'));
    if (snap.exists() && snap.data()?.nombre) {
      uro2Nombre = snap.data().nombre;
      aplicarNombreUro2();
    }
  } catch(e){}
}
function aplicarNombreUro2(){
  const menu = document.getElementById('uro2MenuLabel');
  if (menu) menu.textContent = uro2Nombre;
  const tit = document.getElementById('uro2Titulo');
  if (tit) tit.textContent = uro2Nombre;
  if (MODULOS_CATALOGO.uroexpertos2) MODULOS_CATALOGO.uroexpertos2.label = uro2Nombre;
}
window.editarNombreUro2 = () => {
  const nombre = prompt('Nuevo nombre para esta vista:', uro2Nombre);
  if (nombre === null) return;
  const nom = nombre.trim();
  if (!nom) { toast('Nombre vacío.','error'); return; }
  uro2Nombre = nom;
  aplicarNombreUro2();
  setDoc(doc(db,'uiPrefs','uroexpertos2'), { nombre:nom, updatedAt: serverTimestamp() }).catch(()=>{});
  if (typeof renderMenuGrupos==='function') renderMenuGrupos();
  toast('Nombre actualizado.','success');
};

/* ── Nombre personalizable de CUADRO DE TURNOS 2 ── */
let turnos2Nombre = 'Nueva Vista Turnos';
async function cargarNombreTurnos2(){
  try {
    const snap = await getDoc(doc(db,'uiPrefs','turnos2'));
    if (snap.exists() && snap.data()?.nombre) {
      turnos2Nombre = snap.data().nombre;
      aplicarNombreTurnos2();
    }
  } catch(e){}
}
function aplicarNombreTurnos2(){
  const menu = document.getElementById('turnos2MenuLabel');
  if (menu) menu.textContent = turnos2Nombre;
  const tit = document.getElementById('turnos2Titulo');
  if (tit) tit.textContent = turnos2Nombre;
  if (MODULOS_CATALOGO.turnos2) MODULOS_CATALOGO.turnos2.label = turnos2Nombre;
}
window.editarNombreTurnos2 = () => {
  const nombre = prompt('Nuevo nombre para esta vista:', turnos2Nombre);
  if (nombre === null) return;
  const nom = nombre.trim();
  if (!nom) { toast('Nombre vacío.','error'); return; }
  turnos2Nombre = nom;
  aplicarNombreTurnos2();
  setDoc(doc(db,'uiPrefs','turnos2'), { nombre:nom, updatedAt: serverTimestamp() }).catch(()=>{});
  if (typeof renderMenuGrupos==='function') renderMenuGrupos();
  toast('Nombre actualizado.','success');
};

let menuGrupos = [];          // [{ id, nombre, modulos:[claves], colapsado }]
const menuGruposColapsado = {};



/* Cargar grupos guardados */
async function cargarMenuGrupos(){
  let ok = false;
  try {
    const snap = await getDoc(doc(db,'uiPrefs','menuGrupos'));
    menuGrupos = snap.exists() ? (snap.data()?.grupos || []) : [];
    ok = true;   // lectura exitosa (aunque venga vacía, es el estado real)
  } catch(e){ menuGrupos = []; console.warn('Error al cargar grupos de menú:', e); }
  _menuGruposCargado = ok;   // solo permitir guardar tras una lectura exitosa
  // Corregir duplicados heredados del funcionamiento anterior (cada módulo en un solo grupo)
  if (ok && dedupMenuGrupos()) guardarMenuGrupos();
  renderMenuGrupos();
}

/* Deja cada módulo en UN solo grupo (el primero donde aparezca) y elimina grupos vacíos.
   Devuelve true si hubo cambios. */
function dedupMenuGrupos(){
  const vistos = new Set();
  let cambio = false;
  menuGrupos.forEach(g => {
    const limpio = [];
    (g.modulos||[]).forEach(m => {
      if (!MODULOS_CATALOGO[m]) { cambio = true; return; }  // módulo eliminado de la app → quitar
      if (vistos.has(m)) { cambio = true; return; }  // ya está en otro grupo → quitar duplicado
      vistos.add(m);
      limpio.push(m);
    });
    if (limpio.length !== (g.modulos||[]).length) cambio = true;
    g.modulos = limpio;
  });
  const antes = menuGrupos.length;
  menuGrupos = menuGrupos.filter(g => (g.modulos||[]).length > 0);
  if (menuGrupos.length !== antes) cambio = true;
  return cambio;
}

/* Persistir grupos */
let _menuGruposCargado = false;   // true una vez que se cargaron desde la BD en esta sesión
function guardarMenuGrupos(){
  // Salvaguarda: no sobrescribir con un array vacío si aún no se cargaron los grupos
  // (evita borrar los grupos guardados por una escritura prematura tras limpiar la sesión)
  if (!_menuGruposCargado && menuGrupos.length === 0) {
    console.warn('guardarMenuGrupos omitido: grupos aún no cargados (evita borrado accidental).');
    return;
  }
  setDoc(doc(db,'uiPrefs','menuGrupos'), { grupos: menuGrupos, updatedAt: serverTimestamp() })
    .catch(e=>console.warn('No se pudo guardar grupos de menú:', e));
}

/* Render de los grupos-carpeta en el menú */
function renderMenuGrupos(){
  const cont = document.getElementById('menuGruposContainer');
  const div  = document.getElementById('menuGruposDivider');
  if (!cont) return;
  if (!menuGrupos.length){ cont.innerHTML=''; if(div) div.style.display='none'; sincronizarModulosFijos(); return; }
  if (div) div.style.display='block';

  cont.innerHTML = menuGrupos.map((g, gi)=>{
    const colap = menuGruposColapsado[g.id];
    const items = (g.modulos||[]).map((clave, mi)=>{
      const mod = MODULOS_CATALOGO[clave];
      if (!mod) return '';
      return `<a class="nav-item nav-item-grupo" draggable="true"
        data-grupo="${g.id}" data-modulo="${clave}" data-mi="${mi}"
        ondragstart="menuModDragStart(event)" ondragover="menuModDragOver(event)" ondrop="menuModDrop(event)" ondragend="menuModDragEnd(event)"
        onclick="navigate('${clave}',this)">
        <i class="fa-solid ${mod.icon}"></i><span>${escHtml(mod.label)}</span></a>`;
    }).join('');
    return `<div class="menu-grupo ${colap?'colapsado':''}" data-gid="${g.id}">
      <div class="menu-grupo-head" draggable="true"
        data-gi="${gi}" data-gid="${g.id}"
        ondragstart="menuGrupoDragStart(event)" ondragover="menuGrupoDragOver(event)" ondrop="menuGrupoDrop(event)" ondragend="menuGrupoDragEnd(event)">
        <span onclick="toggleMenuGrupo('${g.id}')" style="display:flex;align-items:center;gap:8px;flex:1;cursor:pointer">
          <i class="fa-solid fa-chevron-down menu-grupo-chevron"></i>
          <i class="fa-solid fa-folder menu-grupo-folder"></i>
          <span class="menu-grupo-nombre">${escHtml(g.nombre)}</span>
        </span>
        <button onclick="event.stopPropagation();openMenuGrupoModal('${g.id}')" title="Editar" class="menu-grupo-btn"><i class="fa-solid fa-pen"></i></button>
        <button onclick="event.stopPropagation();replicarMenuGrupo('${g.id}')" title="Replicar grupo" class="menu-grupo-btn"><i class="fa-solid fa-copy"></i></button>
        <button onclick="event.stopPropagation();eliminarMenuGrupo('${g.id}')" title="Eliminar" class="menu-grupo-btn del"><i class="fa-solid fa-trash"></i></button>
      </div>
      <div class="menu-grupo-items">${items}</div>
    </div>`;
  }).join('');

  sincronizarModulosFijos();
  // Reaplicar permisos: los grupos recién renderizados deben respetar las vistas autorizadas
  if (typeof aplicarPermisosMenu==='function' && !esAdmin && permisosUsuario!==null) aplicarPermisosMenu();
}

/* Oculta del menú fijo los módulos que ya están dentro de algún grupo
   (evita que aparezcan duplicados: una vez en el grupo y otra abajo). */
function sincronizarModulosFijos(){
  // Claves de todos los módulos que están dentro de algún grupo
  const enGrupos = new Set();
  menuGrupos.forEach(g => (g.modulos||[]).forEach(m => enGrupos.add(m)));

  // Recorrer los ítems fijos del menú (los que llaman navigate('clave',this))
  Object.keys(MODULOS_CATALOGO).forEach(clave => {
    const item = document.querySelector(`.sidebar-nav > .nav-item[onclick*="'${clave}'"]`);
    if (item) item.style.display = enGrupos.has(clave) ? 'none' : '';
  });

  // Ocultar etiquetas de sección (Principal/Gestión/Análisis) que quedaron sin ítems visibles
  sincronizarEtiquetasSeccion();
}

/* Oculta una etiqueta de sección si todos sus ítems están ocultos */
function sincronizarEtiquetasSeccion(){
  const nav = document.querySelector('.sidebar-nav');
  if (!nav) return;
  const hijos = [...nav.children];
  const esEtiqueta = (el) => el.classList.contains('nav-group-label')
    || (el.tagName === 'DIV' && el.querySelector('.nav-group-label'));

  hijos.forEach((el, i) => {
    if (!esEtiqueta(el)) return;
    // La sección "Principal" (div con botón +) nunca se oculta: tiene el botón de crear grupo
    if (el.tagName === 'DIV' && el.querySelector('.nav-group-label')) return;
    // ¿Hay algún nav-item visible entre esta etiqueta y la siguiente?
    let hayVisible = false;
    for (let j=i+1; j<hijos.length; j++){
      const sib = hijos[j];
      if (esEtiqueta(sib)) break;
      if (sib.classList.contains('nav-item') && sib.style.display !== 'none'){ hayVisible = true; break; }
    }
    el.style.display = hayVisible ? '' : 'none';
  });
}

window.toggleMenuGrupo = (gid) => {
  menuGruposColapsado[gid] = !menuGruposColapsado[gid];
  const el = document.querySelector(`.menu-grupo[data-gid="${gid}"]`);
  if (el) el.classList.toggle('colapsado', menuGruposColapsado[gid]);
};

/* ── Modal crear/editar grupo ── */
let _editMenuGrupoId = null;
window.openMenuGrupoModal = (gid=null) => {
  _editMenuGrupoId = gid;
  const g = gid ? menuGrupos.find(x=>x.id===gid) : null;
  document.getElementById('menuGrupoTitle').textContent = g ? 'Editar grupo' : 'Nuevo grupo de menú';
  document.getElementById('menuGrupoNombre').value = g?.nombre || '';
  // Render de checkboxes de módulos, en orden si edita
  const seleccionados = g?.modulos || [];
  const orden = [...seleccionados.filter(k=>MODULOS_CATALOGO[k]), ...Object.keys(MODULOS_CATALOGO).filter(k=>!seleccionados.includes(k))];
  document.getElementById('menuGrupoModulos').innerHTML = orden.map(clave=>{
    const mod = MODULOS_CATALOGO[clave];
    const chk = seleccionados.includes(clave) ? 'checked' : '';
    return `<label class="menu-mod-check">
      <input type="checkbox" value="${clave}" ${chk}/>
      <i class="fa-solid ${mod.icon}"></i> ${escHtml(mod.label)}
    </label>`;
  }).join('');
  document.getElementById('menuGrupoModal').classList.add('open');
};
window.closeMenuGrupoModal = () => { document.getElementById('menuGrupoModal').classList.remove('open'); _editMenuGrupoId=null; };

window.guardarMenuGrupo = () => {
  const nombre = document.getElementById('menuGrupoNombre').value.trim();
  if (!nombre) { toast('Ponle un nombre al grupo.','error'); return; }
  const modulos = [...document.querySelectorAll('#menuGrupoModulos input:checked')].map(c=>c.value);
  if (!modulos.length) { toast('Selecciona al menos un módulo.','error'); return; }

  const destinoId = _editMenuGrupoId || ('mg'+Date.now().toString(36));

  // ── LÓGICA DE MOVER (no copiar): quitar estos módulos de CUALQUIER otro grupo ──
  // Cada módulo debe existir en un solo grupo. Al asignarlo aquí, se remueve de los demás.
  menuGrupos.forEach(g => {
    if (g.id === destinoId) return;
    g.modulos = (g.modulos||[]).filter(m => !modulos.includes(m));
  });

  if (_editMenuGrupoId){
    const g = menuGrupos.find(x=>x.id===_editMenuGrupoId);
    if (g){ g.nombre = nombre; g.modulos = modulos; }
  } else {
    menuGrupos.push({ id:destinoId, nombre, modulos });
  }

  // Limpiar grupos que quedaron vacíos tras el movimiento
  menuGrupos = menuGrupos.filter(g => (g.modulos||[]).length > 0 || g.id === destinoId);

  guardarMenuGrupos();
  renderMenuGrupos();
  closeMenuGrupoModal();
  toast('Grupo guardado.','success');
};

window.eliminarMenuGrupo = (gid) => {
  if (!confirm('¿Eliminar este grupo del menú? Los módulos NO se eliminan, solo la carpeta.')) return;
  menuGrupos = menuGrupos.filter(g=>g.id!==gid);
  guardarMenuGrupos();
  renderMenuGrupos();
  toast('Grupo eliminado.','success');
};

/* Replicar un grupo del menú (solo estructura visual; los datos NO se tocan) */
window.replicarMenuGrupo = (gid) => {
  const g = menuGrupos.find(x=>x.id===gid);
  if (!g) return;
  const nombre = prompt('Nombre de la nueva sesión (grupo):', g.nombre + ' (copia)');
  if (nombre === null) return;
  const nom = nombre.trim();
  if (!nom) { toast('Nombre vacío.','error'); return; }
  menuGrupos.push({ id:'mg'+Date.now().toString(36), nombre:nom, modulos:[...g.modulos] });
  guardarMenuGrupos();
  renderMenuGrupos();
  toast(`Grupo "${nom}" creado con la misma estructura.`,'success');
};

/* ── Drag & drop de MÓDULOS dentro de un grupo ── */
let _dragMod = null;
window.menuModDragStart = (e) => { _dragMod = { grupo:e.target.dataset.grupo, mi:+e.target.dataset.mi }; e.target.classList.add('dragging'); e.stopPropagation(); };
window.menuModDragOver  = (e) => { e.preventDefault(); };
window.menuModDrop = (e) => {
  e.preventDefault(); e.stopPropagation();
  const destino = e.target.closest('.nav-item-grupo');
  if (!destino || !_dragMod) return;
  const g = menuGrupos.find(x=>x.id===_dragMod.grupo);
  if (!g || destino.dataset.grupo !== _dragMod.grupo) return;  // solo dentro del mismo grupo
  const from = _dragMod.mi, to = +destino.dataset.mi;
  if (from===to) return;
  const [m] = g.modulos.splice(from,1);
  g.modulos.splice(to,0,m);
  guardarMenuGrupos();
  renderMenuGrupos();
};
window.menuModDragEnd = (e) => { e.target.classList.remove('dragging'); _dragMod=null; };

/* ── Drag & drop de GRUPOS (reordenar sesiones) ── */
let _dragGrupo = null;
window.menuGrupoDragStart = (e) => { _dragGrupo = +e.currentTarget.dataset.gi; e.currentTarget.classList.add('dragging'); };
window.menuGrupoDragOver  = (e) => { e.preventDefault(); };
window.menuGrupoDrop = (e) => {
  e.preventDefault();
  const destino = e.currentTarget;
  // Reordenar grupos
  const to = +destino.dataset.gi;
  if (_dragGrupo===null || _dragGrupo===to) return;
  const [g] = menuGrupos.splice(_dragGrupo,1);
  menuGrupos.splice(to,0,g);
  guardarMenuGrupos();
  renderMenuGrupos();
};
window.menuGrupoDragEnd = (e) => { e.currentTarget.classList.remove('dragging'); _dragGrupo=null; };


/* Reenviar datos al iframe de Reportes cada vez que se entra a la vista
   (el iframe puede haber enviado IFRAME_READY antes de que los datos
    estuvieran disponibles, perdiéndose el primer envío) */
async function reenviarDatosReportes() {
  const frame = document.getElementById('repFrame');
  if (!frame?.contentWindow) return;
  try {
    const [factSnap, docSnap] = await Promise.all([
      getDocs(collection(db,'facturas')),
      getDocs(collection(db,'doctors')),
    ]);
    const facturas = factSnap.docs
      .map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    const docsList = docSnap.docs.map(d=>({id:d.id,...d.data()}));
    if (docsList.length) doctors = docsList;
    frame.contentWindow.postMessage({
      type: 'FACTURAS_UPDATE',
      facturas,
      doctors: docsList.map(d=>({id:d.id, nombre:d.nombre, especialidad:d.especialidad}))
    }, '*');
    sendDoctorStyles(frame);
  } catch(e) {
    console.warn('No se pudieron reenviar datos a Reportes:', e);
  }
}
window.setBottomActive = el => { document.querySelectorAll('.bottom-nav-item').forEach(i=>i.classList.remove('active')); el.classList.add('active'); };
window.toggleSidebar = () => {
  const sb=document.getElementById('sidebar'), sh=document.getElementById('appShell'), ov=document.getElementById('sidebarOverlay');
  if(window.innerWidth<=768){ const open=sb.classList.toggle('mobile-open'); ov.classList.toggle('open',open); }
  else{ const col=sb.classList.toggle('collapsed'); sh.classList.toggle('full',col); }
};
window.refreshAll = () => { renderDashboard(); filterDoctors(); renderKanban(); applyTareaFilters(); renderEquipo(); updateNavBadges(); toast('Actualizado.','success'); };

/* ── CLOCK ── */
function startClock(){
  const el=document.getElementById('topbarClock');
  const tick=()=>el.textContent=new Date().toLocaleDateString('es-CO',{weekday:'short',day:'2-digit',month:'short'})+' · '+new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
  tick(); setInterval(tick,10000);
}

/* ── DASHBOARD ── */
function renderDashboard(){ renderKPIs(); renderBarChart(); renderEspList(); renderMyTasksMini(); renderTeamMini(); }
function renderKPIs(){
  const tot=doctors.length, act=doctors.filter(d=>d.estado==='Activo').length;
  const pend=formatos.filter(f=>f.status==='Pendiente').length, listo=formatos.filter(f=>f.status==='Listo').length;
  const avance=formatos.length?Math.round((listo/formatos.length)*100):0;
  const mis=tareas.filter(t=>t.asignadoId===currentUser?.uid&&t.estado!=='Completada').length;
  document.getElementById('kpiStrip').innerHTML=[
    {icon:'fa-user-doctor',cls:'blue',val:tot,label:'Doctores'},
    {icon:'fa-circle-check',cls:'green',val:act,label:'Activos'},
    {icon:'fa-clock',cls:'orange',val:pend,label:'Pendientes'},
    {icon:'fa-check-double',cls:'green',val:listo,label:'Listos'},
    {icon:'fa-list-check',cls:'gold',val:mis,label:'Mis tareas'},
    {icon:'fa-chart-line',cls:'blue',val:avance+'%',label:'Avance'},
  ].map(k=>`<div class="kpi"><div class="kpi-icon ${k.cls}"><i class="fa-solid ${k.icon}"></i></div><div><span class="kpi-num">${k.val}</span><div class="kpi-label">${k.label}</div></div></div>`).join('');
}
function renderBarChart(){
  const p=formatos.filter(f=>f.status==='Pendiente').length, r=formatos.filter(f=>f.status==='En revisión').length, l=formatos.filter(f=>f.status==='Listo').length, max=Math.max(p,r,l,1);
  document.getElementById('barChart').innerHTML=[{label:'Pendiente',val:p,color:'#e65100'},{label:'En revisión',val:r,color:'#b07d0e'},{label:'Listo',val:l,color:'#24965a'}]
    .map(b=>`<div class="bar-row"><div class="bar-label">${b.label}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.round((b.val/max)*100)}%;background:${b.color}"></div></div><div class="bar-val">${b.val}</div></div>`).join('');
}
function renderEspList(){
  const map={}; doctors.forEach(d=>{const e=d.especialidad||'Sin esp.';map[e]=(map[e]||0)+1;});
  const s=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,7);
  document.getElementById('espList').innerHTML=s.length?s.map(([e,c])=>`<div class="esp-item"><span class="esp-name">${e}</span><span class="esp-count">${c}</span></div>`).join(''):'<p style="color:var(--gray-3);font-size:13px;padding:14px">Sin doctores.</p>';
}
function renderMyTasksMini(){
  const mis=tareas.filter(t=>t.asignadoId===currentUser?.uid).slice(0,5);
  document.getElementById('myTasksMini').innerHTML=mis.length?mis.map(t=>`<div class="task-mini-item"><div class="task-mini-chk ${t.estado==='Completada'?'done':''}" onclick="toggleTarea('${t.id}','${t.estado}')">${t.estado==='Completada'?'<i class="fa-solid fa-check"></i>':''}</div><span class="task-mini-title ${t.estado==='Completada'?'done':''}">${t.titulo}</span><span class="priority-tag priority-${t.prioridad||'Normal'}">${t.prioridad||'Normal'}</span></div>`).join(''):'<p style="color:var(--gray-3);font-size:13px;padding:14px">Sin tareas asignadas.</p>';
}
function renderTeamMini(){
  document.getElementById('teamMini').innerHTML=teamMembers.slice(0,5).map(m=>`<div class="team-mini-item"><div class="team-av" style="background:${m.color||'#1757a8'}">${initials(m.nombreCompleto)}</div><span class="team-mini-name">${m.nombreCompleto}</span><span class="team-mini-role">${m.rol||''}</span></div>`).join('');
}

/* ── DOCTORS ── */
window.filterDoctors = () => {
  const q=(document.getElementById('searchDoctor')?.value||'').toLowerCase();
  const est=document.getElementById('filterEstado')?.value||'';
  let list=[...doctors];
  if(q) list=list.filter(d=>(d.nombre||'').toLowerCase().includes(q)||(d.especialidad||'').toLowerCase().includes(q)||(d.entidad||'').toLowerCase().includes(q));
  if(est) list=list.filter(d=>d.estado===est);
  const tbody=document.getElementById('doctorsBody'), empty=document.getElementById('emptyDoctors'), table=document.getElementById('doctorsTable');
  if(!list.length){tbody.innerHTML='';empty.style.display='block';table.style.display='none';return;}
  empty.style.display='none';table.style.display='table';

  const filaCliente = (d) => {
    const accCount=d.accesos?.length||0;
    const logoCell = d.logoBase64
      ? `<div class="doc-av has-logo"><img src="${d.logoBase64}" alt="logo"/></div>`
      : `<div class="doc-av" style="background:${avatarColor(d.nombre)}">${initials(d.nombre)}</div>`;
    return `<tr data-cli-group="${escHtml(d.grupo||'')}">
    <td><div class="doc-cell">${logoCell}<div><div class="doc-name">${d.nombre}</div><div style="font-size:11px;color:var(--gray-3)">${[d.especialista,d.nit].filter(Boolean).join(' · ')}</div></div></div></td>
    <td>${d.especialidad||'—'}</td><td>${d.entidad||'—'}</td>
    <td>${d.correo?`<a href="mailto:${d.correo}" style="color:var(--blue)">${d.correo}</a>`:'—'}</td>
    <td>${d.telefono||'—'}</td><td style="font-size:12px;color:var(--gray-4)">${d.contrato||'—'}</td>
    <td><span class="badge badge-${d.estado==='Activo'?'active':'inactive'}">${d.estado||'—'}</span></td>
    <td>${accCount>0?`<span class="accesos-badge"><i class="fa-solid fa-key"></i> ${accCount} acceso${accCount>1?'s':''}</span>`:'<span style="color:var(--gray-2);font-size:12px">—</span>'}</td>
    <td><div class="tbl-actions"><button class="act-btn" title="Mover a grupo" style="background:var(--blue-pale);color:var(--blue)" onclick="openMoverClienteGrupo('${d.id}')"><i class="fa-solid fa-folder"></i></button><button class="act-btn edit" onclick="openDoctorModal('${d.id}')"><i class="fa-solid fa-pen"></i></button><button class="act-btn del" onclick="deleteDoctor('${d.id}')"><i class="fa-solid fa-trash"></i></button></div></td>
  </tr>`;
  };

  // Si hay búsqueda activa, mostrar lista plana (búsqueda independiente del grupo)
  if (q) {
    tbody.innerHTML = list.map(filaCliente).join('');
    return;
  }

  // ── Agrupar clientes por su campo "grupo" ──
  const mapa = new Map();
  list.forEach(d => {
    const g = (d.grupo||'').trim() || '__singrupo__';
    if (!mapa.has(g)) mapa.set(g, []);
    mapa.get(g).push(d);
  });
  // Orden: grupos alfabéticos primero, "Sin grupo" al final
  const claves = [...mapa.keys()].sort((a,b)=>{
    if (a==='__singrupo__') return 1;
    if (b==='__singrupo__') return -1;
    return a.localeCompare(b,'es');
  });

  tbody.innerHTML = claves.map(clave => {
    const grupoNom = clave==='__singrupo__' ? 'Sin grupo' : clave;
    const items = mapa.get(clave);
    const colapsado = clienteGrupoColapsado[clave] ? 'colapsado' : '';
    const cab = `<tr class="tbl-group-row cli-group-row ${colapsado}" data-cligroup="${escHtml(clave)}" onclick="toggleClienteGrupo('${escHtml(clave)}',this)">
      <td colspan="8" class="tbl-group-cell">
        <i class="fa-solid fa-chevron-down tbl-group-chevron"></i>
        <i class="fa-solid fa-folder-open tbl-group-folder"></i>
        <span class="tbl-group-label">${escHtml(grupoNom)}</span>
        <span class="tbl-group-count">${items.length} cliente${items.length!==1?'s':''}</span>
      </td>
      <td></td>
    </tr>`;
    const filas = items.map(d => filaCliente(d).replace('<tr ', `<tr data-cligroup-row="${escHtml(clave)}" `)).join('');
    return cab + filas;
  }).join('');

  // Aplicar estado colapsado
  claves.forEach(clave => {
    if (clienteGrupoColapsado[clave]) {
      tbody.querySelectorAll(`tr[data-cligroup-row="${cssEscapa(clave)}"]`).forEach(tr=>tr.style.display='none');
    }
  });
};

/* Estado de grupos de clientes (colapsado) + persistencia */
const clienteGrupoColapsado = {};
window.toggleClienteGrupo = (clave, cab) => {
  const colapsar = !clienteGrupoColapsado[clave];
  clienteGrupoColapsado[clave] = colapsar;
  cab.classList.toggle('colapsado', colapsar);
  document.querySelectorAll(`#doctorsBody tr[data-cligroup-row="${cssEscapa(clave)}"]`).forEach(tr=>{
    tr.style.display = colapsar ? 'none' : '';
  });
  // Persistir
  clearTimeout(_cliGrupoTimer);
  _cliGrupoTimer = setTimeout(()=>{
    const cerrados={}; Object.keys(clienteGrupoColapsado).forEach(k=>{if(clienteGrupoColapsado[k])cerrados[k]=true;});
    setDoc(doc(db,'uiPrefs','clienteGrupos'),{colapsados:cerrados,updatedAt:serverTimestamp()}).catch(()=>{});
  },500);
};
let _cliGrupoTimer = null;

/* Mover un cliente a un grupo (crea el grupo si no existe) */
window.openMoverClienteGrupo = (clienteId) => {
  const d = doctors.find(x=>x.id===clienteId);
  if (!d) return;
  const gruposExistentes = [...new Set(doctors.map(x=>(x.grupo||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  _moverClienteId = clienteId;
  const sel = document.getElementById('moverGrupoSelect');
  sel.innerHTML = '<option value="">— Sin grupo —</option>'
    + gruposExistentes.map(g=>`<option value="${escHtml(g)}" ${g===(d.grupo||'')?'selected':''}>${escHtml(g)}</option>`).join('');
  document.getElementById('moverGrupoNuevo').value = '';
  document.getElementById('moverClienteNombre').textContent = d.nombre;
  document.getElementById('moverGrupoModal').classList.add('open');
};
let _moverClienteId = null;
window.closeMoverGrupoModal = () => { document.getElementById('moverGrupoModal').classList.remove('open'); _moverClienteId=null; };
window.guardarMoverGrupo = async () => {
  if (!_moverClienteId) return;
  const nuevo = document.getElementById('moverGrupoNuevo').value.trim();
  const sel   = document.getElementById('moverGrupoSelect').value;
  const grupo = nuevo || sel;   // el nombre nuevo tiene prioridad
  try {
    await updateDoc(doc(db,'doctors',_moverClienteId), { grupo });
    toast(grupo ? `Cliente movido a "${grupo}".` : 'Cliente sin grupo.', 'success');
    closeMoverGrupoModal();
  } catch(e){ toast('Error: '+e.message,'error'); }
};
window.openDoctorModal = (id=null) => {
  editingDoctorId=id;
  document.getElementById('modalDoctorTitle').textContent=id?'Editar Cliente':'Nuevo Cliente';
  const d=id?doctors.find(x=>x.id===id):{};
  document.getElementById('dNombre').value=d?.nombre||'';
  document.getElementById('dEspecialista').value=d?.especialista||'';
  document.getElementById('dEspecialidad').value=d?.especialidad||'';
  document.getElementById('dEntidad').value=d?.entidad||'';
  document.getElementById('dCorreo').value=d?.correo||'';
  document.getElementById('dTelefono').value=d?.telefono||'';
  document.getElementById('dNit').value=d?.nit||'';
  document.getElementById('dObservaciones').value=d?.observaciones||'';
  document.getElementById('dContrato').value=d?.contrato||'Honorarios';
  document.getElementById('dEstado').value=d?.estado||'Activo';
  document.getElementById('dRegimen').value=d?.regimen||'';
  document.getElementById('dBanco').value=d?.banco||'';
  document.getElementById('dNCuenta').value=d?.nCuenta||'';
  document.getElementById('dTipoCuenta').value=d?.tipoCuenta||'';
  document.getElementById('doctorId').value=id||'';
  // Cargar logo
  const logo = d?.logoBase64||'';
  document.getElementById('dLogoBase64').value = logo;
  const prev = document.getElementById('clientLogoPreview');
  const clearBtn = document.getElementById('clearClientLogoBtn');
  if (logo) {
    prev.innerHTML = `<img src="${logo}" alt="logo"/>`;
    if (clearBtn) clearBtn.style.display = 'inline-flex';
  } else {
    prev.innerHTML = '<i class="fa-solid fa-briefcase" style="font-size:26px;color:var(--gray-3)"></i>';
    if (clearBtn) clearBtn.style.display = 'none';
  }
  // Cargar accesos
  localAccesos = d?.accesos ? JSON.parse(JSON.stringify(d.accesos)) : [];
  renderAccesosTable();
  document.getElementById('doctorModal').classList.add('open');
};
window.closeDoctorModal = () => { document.getElementById('doctorModal').classList.remove('open'); editingDoctorId=null; };
window.saveDoctor = async () => {
  const nombre=document.getElementById('dNombre').value.trim();
  if(!nombre){toast('El nombre es obligatorio.','error');return;}
  // Leer accesos directamente del DOM para garantizar valores actuales
  const accesos = [];
  document.querySelectorAll('#accesosBody tr').forEach(row => {
    const portal   = row.querySelector('.acc-portal')?.value.trim() || '';
    const id       = row.querySelector('.acc-id')?.value.trim()     || '';
    const password = row.querySelector('.acc-pass')?.value          || '';
    if (portal || id || password) accesos.push({ portal, id, password });
  });
  const data={
    nombre,
    logoBase64: document.getElementById('dLogoBase64').value || '',
    especialista:document.getElementById('dEspecialista').value.trim(),
    especialidad:document.getElementById('dEspecialidad').value.trim(),
    entidad:document.getElementById('dEntidad').value.trim(),
    correo:document.getElementById('dCorreo').value.trim(),
    telefono:document.getElementById('dTelefono').value.trim(),
    nit:document.getElementById('dNit').value.trim(),
    contrato:document.getElementById('dContrato').value,
    estado:document.getElementById('dEstado').value,
    regimen:document.getElementById('dRegimen').value.trim(),
    banco:document.getElementById('dBanco').value.trim(),
    nCuenta:document.getElementById('dNCuenta').value.trim(),
    tipoCuenta:document.getElementById('dTipoCuenta').value,
    observaciones:document.getElementById('dObservaciones').value.trim(),
    accesos,
    updatedAt:serverTimestamp()
  };
  try{
    if(editingDoctorId){await updateDoc(doc(db,'doctors',editingDoctorId),data);toast('Cliente actualizado.','success');}
    else{data.createdAt=serverTimestamp();await addDoc(collection(db,'doctors'),data);toast('Cliente registrado.','success');}
    closeDoctorModal();
  }catch(e){toast('Error: '+e.message,'error');}
};
window.deleteDoctor = async id => {
  const d=doctors.find(x=>x.id===id);if(!d)return;
  if(!confirm(`¿Eliminar a "${d.nombre}"?`))return;
  try{await deleteDoc(doc(db,'doctors',id));toast('Doctor eliminado.');}catch(e){toast('Error.','error');}
};

/* ── KANBAN ── */
window.renderKanban = () => {
  const dFil=document.getElementById('kFilterDoctor')?.value||'';
  const pFil=document.getElementById('kFilterPrioridad')?.value||'';
  const rFil=document.getElementById('kFilterResponsable')?.value||'';
  let list=[...formatos];
  if(dFil) list=list.filter(f=>f.doctorId===dFil);
  if(pFil) list=list.filter(f=>f.prioridad===pFil);
  if(rFil==='me') list=list.filter(f=>
    f.responsableId===currentUser?.uid ||
    (f.responsableIds||[]).includes(currentUser?.uid));
  else if(rFil) list=list.filter(f=>
    f.responsableId===rFil || (f.responsableIds||[]).includes(rFil));
  ['Pendiente','En revisión','Listo'].forEach(s=>{
    const ids={Pendiente:'cards-pendiente','En revisión':'cards-revision',Listo:'cards-listo'};
    const cnts={Pendiente:'cnt-pendiente','En revisión':'cnt-revision',Listo:'cnt-listo'};
    document.getElementById(ids[s]).innerHTML='';
    document.getElementById(cnts[s]).textContent=list.filter(f=>f.status===s).length;
  });
  list.forEach(f=>{
    const colIds={Pendiente:'cards-pendiente','En revisión':'cards-revision',Listo:'cards-listo'};
    const col=document.getElementById(colIds[f.status]);if(!col)return;
    const chk=f.checklist||[], checked=chk.filter(c=>c.done).length, total=chk.length||1, pct=Math.round((checked/total)*100);
    // Soporte para múltiples doctores (nuevo) y doctor único (legado)
    const doctorIds = f.doctorIds?.length ? f.doctorIds : (f.doctorId ? [f.doctorId] : []);
    const doctoresNombres = f.doctoresNombres?.length ? f.doctoresNombres
      : doctorIds.map(id => doctors.find(d=>d.id===id)?.nombre).filter(Boolean);
    const doctor=doctors.find(d=>d.id===f.doctorId), resp=teamMembers.find(m=>m.id===f.responsableId);
    // Multi-responsable
    const respIds = f.responsableIds?.length ? f.responsableIds : (f.responsableId ? [f.responsableId] : []);
    const respMembers = respIds.map(id=>teamMembers.find(m=>m.id===id)).filter(Boolean);
    const respAvatars = respMembers.slice(0,3).map(m=>`<div class="kcard-resp-av" style="background:${m.color||avatarColor(m.nombreCompleto)}" title="${m.nombreCompleto}">${initials(m.nombreCompleto)}</div>`).join('');
    const respExtra  = respMembers.length>3?`<div class="kcard-resp-more">+${respMembers.length-3}</div>`:'';
    // Logo
    const logoHtml = f.logoBase64?`<div class="kcard-logo"><img src="${f.logoBase64}" alt="logo"/></div>`:'';
    const stripeC=f.status==='Pendiente'?'pending-s':f.status==='En revisión'?'review-s':'done-s';
    const isVencido=f.fecha&&new Date(f.fecha+'T23:59:59')<new Date()&&f.status!=='Listo';
    const card=document.createElement('div');
    card.className='kcard'; card.draggable=true; card.dataset.id=f.id;
    card.innerHTML=`<div class="kcard-stripe ${stripeC}"></div>
      <div class="kcard-body">
        <div class="kcard-top">${logoHtml}<div class="kcard-name" style="flex:1">${escHtml(f.nombre)}</div><span class="priority-tag priority-${f.prioridad||'Normal'}">${f.prioridad||'Normal'}</span></div>
        <div class="kcard-meta"><i class="fa-solid fa-user-doctor"></i>${doctoresNombres.length?doctoresNombres.join(', '):'Sin cliente'}</div>
        <div class="kcard-meta kcard-resps-row">
          ${respMembers.length
            ? `<div class="kcard-resps">${respAvatars}${respExtra}</div>
               <span class="kcard-resps-names">${respMembers.map(m=>m.nombreCompleto.split(' ')[0]).join(' · ')}</span>`
            : '<span style="color:var(--gray-2);font-size:11px"><i class="fa-solid fa-user"></i> Sin responsable</span>'
          }
        </div>
        <div class="kcard-meta"><i class="fa-regular fa-calendar"></i>${fmtMonth(f.mes)}</div>
        ${isVencido?`<div class="kcard-meta" style="color:var(--red)"><i class="fa-solid fa-triangle-exclamation"></i>Vencido: ${fmtDate(f.fecha)}</div>`:f.fecha?`<div class="kcard-meta"><i class="fa-solid fa-flag"></i>Límite: ${fmtDate(f.fecha)}</div>`:''}
        <div class="kcard-prog"><div class="kcard-track"><div class="kcard-fill" style="width:${pct}%"></div></div><div class="kcard-pct">${checked}/${chk.length} · ${pct}%</div></div>
      </div>
      <div class="kcard-foot">
        <span class="badge badge-${statusClass(f.status)}">${f.status}</span>
        <div class="kcard-actions">
          <button class="act-btn edit" onclick="viewFormato('${f.id}')"><i class="fa-solid fa-eye"></i></button>
          <button class="act-btn edit" onclick="openFormatoModal('${f.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="act-btn del" onclick="deleteFormato('${f.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>`;
    card.addEventListener('dragstart',e=>{draggedId=f.id;card.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
    card.addEventListener('dragend',()=>{card.classList.remove('dragging');document.querySelectorAll('.kcol-body').forEach(c=>c.classList.remove('drag-over'));});
    col.appendChild(card);
  });
};
window.dropCard = async (e,newStatus) => {
  e.preventDefault(); e.currentTarget.classList.remove('drag-over');
  if(!draggedId)return;
  const f=formatos.find(x=>x.id===draggedId);if(!f||f.status===newStatus)return;
  try{await updateDoc(doc(db,'formatos',draggedId),{status:newStatus,updatedAt:serverTimestamp()});toast(`Movido a "${newStatus}".`,'success');}
  catch(e){toast('Error al mover.','error');}
  draggedId=null;
};

/* ── CHECKLIST ── */
function buildChecklistUI(items){ localChecklist=items.map(i=>({...i})); renderChecklistUI(); }
function renderChecklistUI(){
  const el=document.getElementById('checklistItems');
  el.innerHTML=localChecklist.map((item,idx)=>`
    <div class="chk-item-row" data-idx="${idx}">
      <input type="checkbox" ${item.done?'checked':''} onchange="toggleChkItem(${idx})"/>
      <input type="text" class="chk-item-label" value="${escHtml(item.label)}" placeholder="Nombre del ítem…" oninput="updateChkLabel(${idx},this.value)"/>
      <button class="chk-item-del" onclick="removeChkItem(${idx})"><i class="fa-solid fa-times"></i></button>
    </div>`).join('');
  updateChkProgress();
}
window.toggleChkItem  = idx => { localChecklist[idx].done=!localChecklist[idx].done; renderChecklistUI(); };
window.updateChkLabel = (idx,val) => { localChecklist[idx].label=val; };
window.removeChkItem  = idx => { localChecklist.splice(idx,1); renderChecklistUI(); };
window.addChecklistItem = () => { localChecklist.push({label:'',done:false}); renderChecklistUI(); setTimeout(()=>{const inputs=document.querySelectorAll('.chk-item-label');inputs[inputs.length-1]?.focus();},50); };
function updateChkProgress(){
  const checked=localChecklist.filter(c=>c.done).length, total=localChecklist.length, pct=total?Math.round((checked/total)*100):0;
  document.getElementById('modalChkBar').style.width=pct+'%';
  document.getElementById('modalChkPct').textContent=`${checked} / ${total}`;
}

window.openFormatoModal = (id=null) => {
  editingFormatoId=id;
  document.getElementById('modalFormatoTitle').textContent=id?'Editar Proceso':'Nuevo Proceso';
  const f=id?formatos.find(x=>x.id===id):null;
  // Doctores (multi)
  window._selectedDoctorIds = f?.doctorIds ? [...f.doctorIds] : (f?.doctorId ? [f.doctorId] : []);
  // Responsables (multi)
  window._selectedRespIds = f?.responsableIds ? [...f.responsableIds] : (f?.responsableId ? [f.responsableId] : []);
  updateSelects();
  document.getElementById('fNombre').value=f?.nombre||'';
  document.getElementById('fMes').value=f?.mes||'';
  document.getElementById('fFecha').value=f?.fecha||'';
  document.getElementById('fPrioridad').value=f?.prioridad||'Normal';
  document.getElementById('fEstado').value=f?.status||'Pendiente';
  document.getElementById('fNotas').value=f?.notas||'';
  // Logo
  const logo = f?.logoBase64||'';
  document.getElementById('fLogoBase64').value = logo;
  const prev = document.getElementById('procLogoPreview');
  prev.innerHTML = logo
    ? `<img src="${logo}" alt="logo"/>`
    : '<i class="fa-solid fa-image" style="font-size:22px;color:var(--gray-2)"></i>';
  buildChecklistUI(f?.checklist?.length?f.checklist:DEFAULT_CHECKLIST.map(i=>({...i})));
  document.getElementById('formatoModal').classList.add('open');
};
window.closeFormatoModal = () => { document.getElementById('formatoModal').classList.remove('open'); editingFormatoId=null; };
window.saveFormato = async () => {
  const nombre=document.getElementById('fNombre').value.trim();
  const doctorIds = window._selectedDoctorIds || [];
  if(!nombre){toast('El nombre es obligatorio.','error');return;}
  if(!doctorIds.length){toast('Selecciona al menos un doctor.','error');return;}
  // Responsables (multi)
  const responsableIds = window._selectedRespIds || [];
  const responsableId  = responsableIds[0] || '';
  const resp = teamMembers.find(m=>m.id===responsableId);
  const responsablesNombres = responsableIds.map(id=>teamMembers.find(m=>m.id===id)?.nombreCompleto||'').filter(Boolean);
  // Doctores (nombres)
  const doctoresNombres = doctorIds.map(id => doctors.find(d=>d.id===id)?.nombre||'').filter(Boolean);
  const logoBase64 = document.getElementById('fLogoBase64').value || '';
  const data={nombre,
    doctorIds, doctorId: doctorIds[0]||'', doctoresNombres,
    responsableIds, responsableId, responsablesNombres,
    responsableNombre:resp?.nombreCompleto||'',
    logoBase64,
    mes:document.getElementById('fMes').value,
    fecha:document.getElementById('fFecha').value,
    prioridad:document.getElementById('fPrioridad').value,
    status:document.getElementById('fEstado').value,
    notas:document.getElementById('fNotas').value.trim(),
    checklist:localChecklist.map(i=>({label:i.label,done:!!i.done})),
    updatedAt:serverTimestamp()};
  try{
    if(editingFormatoId){await updateDoc(doc(db,'formatos',editingFormatoId),data);toast('Proceso actualizado.','success');}
    else{data.createdAt=serverTimestamp();await addDoc(collection(db,'formatos'),data);toast('Proceso creado.','success');}
    closeFormatoModal();
  }catch(e){toast('Error: '+e.message,'error');}
};
window.deleteFormato = async id => { if(!confirm('¿Eliminar este proceso?'))return; try{await deleteDoc(doc(db,'formatos',id));toast('Proceso eliminado.');}catch(e){toast('Error.','error');} };
window.viewFormato = id => {
  const f=formatos.find(x=>x.id===id);if(!f)return;
  const dr=doctors.find(d=>d.id===f.doctorId), resp=teamMembers.find(m=>m.id===f.responsableId);
  const chk=f.checklist||[], checked=chk.filter(c=>c.done).length, pct=chk.length?Math.round((checked/chk.length)*100):0;
  document.getElementById('drawerTitle').textContent=f.nombre;
  document.getElementById('drawerBody').innerHTML=`
    <div class="detail-section"><div class="detail-label">Información</div>
      <div class="detail-row"><span class="detail-key">Doctor</span><span class="detail-val">${dr?.nombre||'—'}</span></div>
      <div class="detail-row"><span class="detail-key">Responsable</span><span class="detail-val">${resp?.nombreCompleto||'Sin asignar'}</span></div>
      <div class="detail-row"><span class="detail-key">Mes</span><span class="detail-val">${fmtMonth(f.mes)}</span></div>
      <div class="detail-row"><span class="detail-key">Límite</span><span class="detail-val">${fmtDate(f.fecha)}</span></div>
      <div class="detail-row"><span class="detail-key">Prioridad</span><span class="detail-val"><span class="priority-tag priority-${f.prioridad||'Normal'}">${f.prioridad||'Normal'}</span></span></div>
      <div class="detail-row"><span class="detail-key">Estado</span><span class="detail-val"><span class="badge badge-${statusClass(f.status)}">${f.status}</span></span></div>
    </div>
    ${f.notas?`<div class="detail-section"><div class="detail-label">Notas</div><p style="font-size:13px;color:var(--gray-4)">${escHtml(f.notas)}</p></div>`:''}
    <div class="detail-section"><div class="detail-label">Checklist: ${checked}/${chk.length} (${pct}%)</div>
      <div style="height:7px;background:var(--gray-1);border-radius:4px;overflow:hidden;margin-bottom:12px"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--blue),var(--green-soft));border-radius:4px"></div></div>
      ${chk.map(item=>`<div style="display:flex;align-items:center;gap:7px;padding:5px 0;border-bottom:1px solid var(--gray-1);font-size:12.5px;color:${item.done?'var(--green)':'var(--gray-3)'}"><i class="fa-solid ${item.done?'fa-circle-check':'fa-circle'}" style="font-size:12px"></i>${escHtml(item.label)}</div>`).join('')}
    </div>`;
  document.getElementById('drawerBg').classList.add('open');
  document.getElementById('drawer').classList.add('open');
};
window.closeDrawer = () => { document.getElementById('drawer').classList.remove('open'); document.getElementById('drawerBg').classList.remove('open'); };

/* ── TAREAS ── */
window.applyTareaFilters = () => {
  const vis=document.getElementById('tFilterVis')?.value||'mine';
  const est=document.getElementById('tFilterEstado')?.value||'';
  const uid=currentUser?.uid;
  let list=[...tareas];
  if(vis==='mine') list=list.filter(t=>t.asignadoId===uid||t.createdBy===uid);
  if(est) list=list.filter(t=>t.estado===est);
  const el=document.getElementById('tareasList'), empty=document.getElementById('emptyTareas');
  if(!list.length){el.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  const today=new Date().toISOString().slice(0,10);
  el.innerHTML=list.map(t=>{
    const asig=teamMembers.find(m=>m.id===t.asignadoId), cb=teamMembers.find(m=>m.id===t.createdBy);
    const isVenc=t.fecha&&t.fecha<today&&t.estado!=='Completada', isOwn=t.createdBy===uid;
    return `<div class="tarea-card ${t.estado==='Completada'?'done-card':''}">
      <div class="tarea-chk ${t.estado==='Completada'?'done':''}" onclick="toggleTarea('${t.id}','${t.estado}')">${t.estado==='Completada'?'<i class="fa-solid fa-check"></i>':''}</div>
      <div class="tarea-info">
        <div class="tarea-title ${t.estado==='Completada'?'done':''}">${escHtml(t.titulo)}</div>
        ${t.descripcion?`<div class="tarea-desc">${escHtml(t.descripcion)}</div>`:''}
        <div class="tarea-meta">
          ${asig?`<div class="tarea-asig"><div class="tarea-av" style="background:${asig.color||'#1757a8'}">${initials(asig.nombreCompleto)}</div><span>${asig.nombreCompleto}</span></div>`:'<span style="font-size:12px;color:var(--gray-3)">Sin asignar</span>'}
          <span class="priority-tag priority-${t.prioridad||'Normal'}">${t.prioridad||'Normal'}</span>
          <span class="badge badge-${t.estado==='Pendiente'?'pending':t.estado==='En progreso'?'progress':'done'}">${t.estado}</span>
          ${t.fecha?`<span class="tarea-date ${isVenc?'vencida':''}"><i class="fa-solid fa-flag"></i>${fmtDate(t.fecha)}${isVenc?' ⚠':''}` :''}
        </div>
        ${cb?`<div style="font-size:11px;color:var(--gray-3);margin-top:4px">Asignada por ${cb.nombreCompleto}</div>`:''}
      </div>
      <div class="tarea-actions">
        ${isOwn||t.asignadoId===uid?`<button class="act-btn edit" onclick="openTareaModal('${t.id}')"><i class="fa-solid fa-pen"></i></button>`:''}
        ${isOwn?`<button class="act-btn del" onclick="deleteTarea('${t.id}')"><i class="fa-solid fa-trash"></i></button>`:''}
      </div>
    </div>`;
  }).join('');

  // Re-aplicar la búsqueda activa tras re-renderizar (altas, ediciones, snapshots)
  Object.keys(busquedaTablas).forEach(id => {
    if (busquedaTablas[id]) filtrarTablaBusqueda(id, busquedaTablas[id]);
  });
};
window.toggleTarea = async (id,estado) => {
  const nuevo=estado==='Completada'?'Pendiente':'Completada';
  try{await updateDoc(doc(db,'tareas',id),{estado:nuevo,updatedAt:serverTimestamp()});}catch(e){toast('Error.','error');}
};
window.openTareaModal = (id=null) => {
  editingTareaId=id; updateSelects();
  document.getElementById('modalTareaTitle').textContent=id?'Editar Tarea':'Nueva Tarea';
  const t=id?tareas.find(x=>x.id===id):null;
  document.getElementById('tTitulo').value=t?.titulo||'';
  document.getElementById('tDesc').value=t?.descripcion||'';
  document.getElementById('tAsignado').value=t?.asignadoId||'';
  document.getElementById('tPrioridad').value=t?.prioridad||'Normal';
  document.getElementById('tFecha').value=t?.fecha||'';
  document.getElementById('tEstado').value=t?.estado||'Pendiente';
  document.getElementById('tareaModal').classList.add('open');
};
window.closeTareaModal = () => { document.getElementById('tareaModal').classList.remove('open'); editingTareaId=null; };
window.saveTarea = async () => {
  const titulo=document.getElementById('tTitulo').value.trim(), asignadoId=document.getElementById('tAsignado').value;
  if(!titulo){toast('El título es obligatorio.','error');return;}
  if(!asignadoId){toast('Asigna la tarea a alguien.','error');return;}
  const asig=teamMembers.find(m=>m.id===asignadoId);
  const data={titulo,asignadoId,asignadoNombre:asig?.nombreCompleto||'',descripcion:document.getElementById('tDesc').value.trim(),prioridad:document.getElementById('tPrioridad').value,fecha:document.getElementById('tFecha').value,estado:document.getElementById('tEstado').value,updatedAt:serverTimestamp()};
  try{
    if(editingTareaId){await updateDoc(doc(db,'tareas',editingTareaId),data);toast('Tarea actualizada.','success');}
    else{
      data.createdAt=serverTimestamp();data.createdBy=currentUser?.uid;data.createdByName=currentProfile?.nombreCompleto||'';
      const ref = await addDoc(collection(db,'tareas'),data);
      // Notificar al asignado
      await notifTareaAsignada({ ...data, _tempId: ref.id });
      toast('Tarea creada.','success');
    }
    closeTareaModal();
  }catch(e){toast('Error: '+e.message,'error');}
};
window.deleteTarea = async id => { if(!confirm('¿Eliminar esta tarea?'))return; try{await deleteDoc(doc(db,'tareas',id));toast('Tarea eliminada.');}catch(e){toast('Error.','error');} };

/* ── CHAT ── */
window.selectChannel = (channel,el) => {
  currentChannel=channel; currentChannelIsGroup=false;
  document.querySelectorAll('.chat-channel').forEach(c=>c.classList.remove('active'));
  if(el) el.classList.add('active');
  document.getElementById('chatChannelName').textContent=channel;
  document.getElementById('chatIcon').className='fa-solid fa-hashtag';
  document.getElementById('chatHeaderActions').innerHTML='';
  loadMessages('chat_'+channel);
};

function loadMessages(collPath){
  document.getElementById('chatMessages').innerHTML='<div class="chat-loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando…</div>';
  if(chatUnsub) chatUnsub();
  chatUnsub=onSnapshot(query(collection(db,collPath),orderBy('createdAt','asc')),snap=>{
    renderMessages(snap.docs.map(d=>({id:d.id,...d.data()})));
  });
}
function renderMessages(msgs){
  const el=document.getElementById('chatMessages');
  if(!msgs.length){el.innerHTML='<div class="chat-loading">No hay mensajes. ¡Escribe algo!</div>';return;}
  let lastDate='';
  el.innerHTML=msgs.map(m=>{
    const isOwn=m.uid===currentUser?.uid;
    const ts=m.createdAt?.toDate?.()||new Date();
    const dateStr=ts.toLocaleDateString('es-CO',{weekday:'long',day:'2-digit',month:'long'});
    const timeStr=ts.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
    let divider=''; if(dateStr!==lastDate){lastDate=dateStr;divider=`<div class="chat-date-divider">${dateStr}</div>`;}
    return `${divider}<div class="chat-msg ${isOwn?'own':''}">
      <div class="chat-msg-av" style="background:${m.color||'#1757a8'}">${initials(m.name)}</div>
      <div class="chat-msg-content">
        <div class="chat-msg-header"><span class="chat-msg-name">${escHtml(m.name)}</span><span class="chat-msg-time">${timeStr}</span></div>
        <div class="chat-msg-bubble">${renderMentions(m.text)}</div>
      </div></div>`;
  }).join('');
  el.scrollTop=el.scrollHeight;
}
window.sendMessage = async () => {
  const inp=document.getElementById('chatInput'), text=inp.value.trim();
  if(!text) return;
  inp.value=''; hideMentionList();
  const collPath=currentChannelIsGroup?'groupMessages_'+currentChannel:'chat_'+currentChannel;
  try{
    await addDoc(collection(db,collPath),{text,uid:currentUser.uid,name:currentProfile.nombreCompleto,color:currentProfile.color||'#1757a8',createdAt:serverTimestamp()});
    // Notificar menciones si hay @alguien
    if (text.includes('@')) await notifMencion(text, currentChannel);
  }catch(e){toast('Error al enviar.','error');inp.value=text;}
};

/* ── MENTIONS — FIXED: mousedown prevents blur ── */
window.handleChatInput = e => {
  const inp=e.target, val=inp.value, cursor=inp.selectionStart;
  const before=val.slice(0,cursor), atIdx=before.lastIndexOf('@');
  if(atIdx!==-1){
    const q=before.slice(atIdx+1).replace(/\s.*/,'');
    if(atIdx===0||/\s/.test(val[atIdx-1])){
      mentionMatches=teamMembers.filter(m=>m.nombreCompleto.toLowerCase().includes(q.toLowerCase()));
      if(mentionMatches.length){showMentionList(mentionMatches);return;}
    }
  }
  hideMentionList();
};
window.handleChatKeydown = e => {
  const list=document.getElementById('mentionList');
  if(list.style.display!=='none'){
    if(e.key==='ArrowDown'){e.preventDefault();mentionIndex=Math.min(mentionIndex+1,mentionMatches.length-1);highlightMention();}
    else if(e.key==='ArrowUp'){e.preventDefault();mentionIndex=Math.max(mentionIndex-1,0);highlightMention();}
    else if(e.key==='Enter'&&mentionIndex>=0){e.preventDefault();insertMention(mentionMatches[mentionIndex]);return;}
    else if(e.key==='Escape'){hideMentionList();}
    return;
  }
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}
};
function showMentionList(matches){
  mentionIndex=-1;
  const el=document.getElementById('mentionList');
  el.innerHTML=matches.map((m,i)=>`
    <div class="mention-item" data-idx="${i}" data-uid="${m.id}">
      <div class="mention-av" style="background:${m.color||'#1757a8'}">${initials(m.nombreCompleto)}</div>
      <div><div class="mention-name">${m.nombreCompleto}</div><div class="mention-role">${m.rol||''}</div></div>
    </div>`).join('');
  /* KEY FIX: use mousedown (fires before blur) so click registers before input loses focus */
  el.querySelectorAll('.mention-item').forEach(item=>{
    item.addEventListener('mousedown',e=>{
      e.preventDefault(); // prevents input from losing focus
      const member=teamMembers.find(x=>x.id===item.dataset.uid);
      if(member) insertMention(member);
    });
  });
  el.style.display='block';
}
function highlightMention(){ document.querySelectorAll('.mention-item').forEach((el,i)=>el.classList.toggle('selected',i===mentionIndex)); }
function hideMentionList(){ document.getElementById('mentionList').style.display='none'; mentionIndex=-1; }
function insertMention(member){
  if(!member) return;
  const inp=document.getElementById('chatInput'), val=inp.value, cursor=inp.selectionStart;
  const before=val.slice(0,cursor), atIdx=before.lastIndexOf('@'), after=val.slice(cursor);
  const name=member.nombreCompleto.split(' ')[0];
  inp.value=before.slice(0,atIdx)+'@'+name+' '+after;
  inp.focus(); inp.selectionStart=inp.selectionEnd=atIdx+name.length+2;
  hideMentionList();
}

/* ── GROUPS ── */
function renderGroupsList(){
  const el=document.getElementById('chatGroups');
  const mine=groups.filter(g=>g.memberIds?.includes(currentUser?.uid));
  if(!mine.length){
    el.innerHTML='<div style="padding:6px 10px;font-size:12px;color:rgba(255,255,255,.3)">Sin grupos</div>';
    return;
  }
  el.innerHTML=mine.map(g=>`
    <div class="chat-channel" data-gid="${g.id}">
      <i class="fa-solid fa-users"></i><span>${escHtml(g.nombre)}</span>
      <div class="ch-actions">
        <div class="ch-btn ch-edit" data-gid="${g.id}"><i class="fa-solid fa-pen"></i></div>
        <div class="ch-btn ch-del"  data-gid="${g.id}"><i class="fa-solid fa-trash"></i></div>
      </div>
    </div>`).join('');

  /* Event delegation — no inline onclick, works with ES modules */
  el.querySelectorAll('.chat-channel').forEach(row=>{
    row.addEventListener('click', e=>{
      // edit button
      if(e.target.closest('.ch-edit')){
        e.stopPropagation();
        openGroupModal(row.dataset.gid);
        return;
      }
      // delete button
      if(e.target.closest('.ch-del')){
        e.stopPropagation();
        confirmDeleteGroup(row.dataset.gid);
        return;
      }
      // click on the row itself → open group chat
      window.selectGroup(row.dataset.gid, row);
    });
  });
}

/* Exposed globally so header "Editar" button (rendered as innerHTML) also works */
window.selectGroup = (groupId, el) => {
  const grp=groups.find(g=>g.id===groupId);
  if(!grp){ toast('Grupo no encontrado.','error'); return; }
  if(!grp.memberIds?.includes(currentUser?.uid)){ toast('No eres miembro de este grupo.','error'); return; }
  currentChannel=groupId; currentChannelIsGroup=true;
  document.querySelectorAll('.chat-channel').forEach(c=>c.classList.remove('active'));
  if(el) el.classList.add('active');
  document.getElementById('chatChannelName').textContent=grp.nombre;
  document.getElementById('chatIcon').className='fa-solid fa-users';
  document.getElementById('chatHeaderActions').innerHTML=
    `<button class="btn btn-ghost btn-xs" onclick="openGroupModal('${groupId}')"><i class="fa-solid fa-pen"></i> Editar</button>`;
  loadMessages('groupMessages_'+groupId);
};
window.openGroupModal = (id=null) => {
  editingGroupId=id;
  document.getElementById('modalGroupTitle').textContent=id?'Editar Grupo':'Nuevo Grupo';
  document.getElementById('btnDeleteGroup').style.display=id?'inline-flex':'none';
  const grp=id?groups.find(x=>x.id===id):null;
  document.getElementById('gNombre').value=grp?.nombre||'';
  document.getElementById('membersPicker').innerHTML=teamMembers.map(m=>`
    <label class="member-pick-item">
      <input type="checkbox" value="${m.id}" ${grp?.memberIds?.includes(m.id)?'checked':''}/>
      <div class="member-pick-av" style="background:${m.color||'#1757a8'}">${initials(m.nombreCompleto)}</div>
      <div><div style="font-weight:700;color:var(--navy)">${m.nombreCompleto}</div><div style="font-size:11px;color:var(--gray-3)">${m.rol||''}</div></div>
    </label>`).join('');
  document.getElementById('groupModal').classList.add('open');
};
window.closeGroupModal = () => { document.getElementById('groupModal').classList.remove('open'); editingGroupId=null; };
window.saveGroup = async () => {
  const nombre=document.getElementById('gNombre').value.trim();
  if(!nombre){toast('El nombre es obligatorio.','error');return;}
  const memberIds=[...document.querySelectorAll('#membersPicker input:checked')].map(i=>i.value);
  if(!memberIds.includes(currentUser?.uid)) memberIds.push(currentUser.uid);
  const data={nombre,memberIds,updatedAt:serverTimestamp()};
  try{
    if(editingGroupId){await updateDoc(doc(db,'groups',editingGroupId),data);toast('Grupo actualizado.','success');}
    else{data.createdAt=serverTimestamp();data.createdBy=currentUser?.uid;await addDoc(collection(db,'groups'),data);toast('Grupo creado.','success');}
    closeGroupModal();
  }catch(e){toast('Error al guardar grupo: '+e.message,'error');}
};
window.deleteCurrentGroup = () => confirmDeleteGroup(editingGroupId);
window.confirmDeleteGroup = async id => {
  const grp=groups.find(g=>g.id===id);
  if(!confirm(`¿Eliminar el grupo "${grp?.nombre||''}"?`))return;
  try{await deleteDoc(doc(db,'groups',id));toast('Grupo eliminado.');closeGroupModal();}catch(e){toast('Error.','error');}
};

/* ── EQUIPO ── */
function renderEquipo(){
  const el=document.getElementById('teamGrid'), empty=document.getElementById('emptyEquipo');
  if(!teamMembers.length){el.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  el.innerHTML=teamMembers.map(m=>`<div class="team-card">
    <div class="team-card-av" style="background:${m.color||'#1757a8'}">${initials(m.nombreCompleto)}</div>
    <div class="team-card-name">${m.nombreCompleto}</div>
    <div class="team-card-role">${m.rol||'Usuario'}</div>
    <div class="team-card-email"><i class="fa-solid fa-envelope"></i>${m.email||''}</div>
    ${m.uid===currentUser?.uid?'<div style="margin-top:8px"><span class="badge badge-active">Tú</span></div>':''}
  </div>`).join('');
}

/* ── BADGES ── */
function updateNavBadges(){
  document.getElementById('navBadgeDoctores').textContent=doctors.length;
  const pend=formatos.filter(f=>f.status==='Pendiente').length;
  document.getElementById('navBadgeKanban').textContent=pend;
  const mis=tareas.filter(t=>t.asignadoId===currentUser?.uid&&t.estado!=='Completada').length;
  const navT=document.getElementById('navBadgeTareas'); if(navT) navT.textContent=mis||'';
  const bnK=document.getElementById('bnBadgeKanban'),bnT=document.getElementById('bnBadgeTareas');
  if(bnK){bnK.textContent=pend;bnK.style.display=pend>0?'flex':'none';}
  if(bnT){bnT.textContent=mis;bnT.style.display=mis>0?'flex':'none';}
}

/* ── SELECTS ── */
function updateSelects(){
  // Multi-doctor picker y multi-responsable para Kanban
  buildDoctorPicker(window._selectedDoctorIds||[]);
  buildRespPicker(window._selectedRespIds||[]);
  const fR=document.getElementById('fResponsable'); if(fR){const cv=fR.value;fR.innerHTML='<option value="">Sin asignar</option>'+teamMembers.map(m=>`<option value="${m.id}">${m.nombreCompleto}</option>`).join('');fR.value=cv;}
  const tA=document.getElementById('tAsignado'); if(tA){const cv=tA.value;tA.innerHTML='<option value="">Seleccionar…</option>'+teamMembers.map(m=>`<option value="${m.id}">${m.nombreCompleto} (${m.rol||'Usuario'})</option>`).join('');tA.value=cv;}
}

/* ── Constructor del multi-picker de doctores ── */
function buildDoctorPicker(selectedIds=[]) {
  window._selectedDoctorIds = selectedIds;
  const picker = document.getElementById('fDoctorPicker');
  const tagsEl = document.getElementById('fDoctorSelected');
  if (!picker) return;

  picker.innerHTML = doctors.map(d => {
    const sel = selectedIds.includes(d.id);
    const col = avatarColor(d.nombre);
    return `<label class="doc-pick-item ${sel?'selected':''}" data-id="${d.id}">
      <input type="checkbox" value="${d.id}" ${sel?'checked':''} onchange="toggleDocPick('${d.id}')"/>
      <div class="doc-pick-av" style="background:${col}">${initials(d.nombre)}</div>
      <span>${d.nombre}</span>
      <small style="color:var(--gray-3);font-size:11px;margin-left:auto">${d.especialidad||''}</small>
    </label>`;
  }).join('') || '<div style="padding:10px;color:var(--gray-3);font-size:13px">Sin doctores registrados</div>';

  renderDocTags();
}

window.toggleDocPick = (id) => {
  const ids = window._selectedDoctorIds || [];
  const idx = ids.indexOf(id);
  if (idx === -1) ids.push(id);
  else ids.splice(idx, 1);
  window._selectedDoctorIds = ids;
  // Actualizar clases visuales
  document.querySelectorAll('#fDoctorPicker .doc-pick-item').forEach(el => {
    el.classList.toggle('selected', ids.includes(el.dataset.id));
  });
  renderDocTags();
};

function renderDocTags() {
  const tagsEl = document.getElementById('fDoctorSelected');
  if (!tagsEl) return;
  const ids = window._selectedDoctorIds || [];
  tagsEl.innerHTML = ids.map(id => {
    const d = doctors.find(x => x.id === id);
    return d ? `<span class="doc-tag">
      ${d.nombre}
      <span class="doc-tag-x" onclick="toggleDocPick('${id}')">✕</span>
    </span>` : '';
  }).join('');
}
function updateKanbanSelects(){
  const kD=document.getElementById('kFilterDoctor'); if(kD){const cv=kD.value;kD.innerHTML='<option value="">Todos los doctores</option>'+doctors.map(d=>`<option value="${d.id}">${d.nombre}</option>`).join('');kD.value=cv;}
  const kR=document.getElementById('kFilterResponsable'); if(kR){const cv=kR.value;kR.innerHTML='<option value="">Todos los responsables</option><option value="me">Mis procesos</option>'+teamMembers.map(m=>`<option value="${m.id}">${m.nombreCompleto}</option>`).join('');kR.value=cv;}
}

/* ── MODAL CLOSE ON OVERLAY ── */
document.querySelectorAll('.modal-overlay').forEach(ov=>{
  ov.addEventListener('click',e=>{
    if(e.target===ov){ov.classList.remove('open');editingDoctorId=null;editingFormatoId=null;editingTareaId=null;editingGroupId=null;}
  });
});

/* ══════════════════════════════════════════════════
   ASISTENTE IA — Claude (Anthropic)
══════════════════════════════════════════════════ */
// Reemplaza con tu API key de Anthropic (console.anthropic.com)
const CLAUDE_API_KEY = 'PEGA_AQUI_TU_API_KEY_DE_CLAUDE';
let aiOpen = false;
let aiHistory = [];  // historial de conversación con la IA

/* Mostrar / ocultar panel */
window.toggleAI = () => {
  aiOpen = !aiOpen;
  document.getElementById('aiPanel').classList.toggle('open', aiOpen);
  document.getElementById('aiOverlay').classList.toggle('open', aiOpen);
  if (aiOpen && aiHistory.length === 0) showAIWelcome();
};

/* Mensaje de bienvenida */
function showAIWelcome() {
  const name = currentProfile?.nombreCompleto?.split(' ')[0] || 'equipo';
  appendAIMsg('bot', `¡Hola ${name}! 👋 Soy el asistente de Back Office Empresarial.\n\nPuedo ayudarte a:\n• Analizar el estado de tus procesos y doctores\n• Redactar correos, informes o respuestas a glosas\n• Responder dudas sobre facturación médica\n\nUsa los botones de acciones rápidas o escribe directamente tu pregunta.`);
}

/* Acciones rápidas predefinidas */
window.aiQuick = async (tipo) => {
  const prompts = {
    resumen: 'Dame un resumen ejecutivo del estado actual del sistema: cuántos doctores hay, cuántos procesos están pendientes, en revisión y listos, y cuáles son los puntos más críticos a atender hoy.',
    procesos_pendientes: 'Analiza los procesos pendientes y en revisión del sistema. ¿Cuáles llevan más tiempo sin moverse? ¿Qué recomendaciones tienes para agilizar el flujo de trabajo?',
    redactar_correo: 'Necesito que me ayudes a redactar un correo profesional. ¿Para qué situación necesitas el correo? Por ejemplo: recordatorio de documentos pendientes, notificación de radicación, cobro de glosa, etc.',
    responder_glosa: 'Voy a redactar una respuesta a una glosa médica. Cuéntame: ¿Cuál es el motivo de la glosa? ¿Qué EPS o entidad la generó? ¿Qué servicios están siendo glosados?',
    informe_doctor: 'Voy a generar un informe de gestión para un doctor. ¿Para cuál doctor necesitas el informe y de qué período?',
    tareas_pendientes: 'Revisa mis tareas pendientes asignadas y dime cuáles son prioritarias, cuáles están vencidas y qué deberías hacer primero hoy.',
  };
  const texto = prompts[tipo];
  if (!texto) return;
  document.getElementById('aiInput').value = texto;
  // Para acciones que son preguntas directas, enviar automáticamente
  if (['resumen', 'procesos_pendientes', 'tareas_pendientes'].includes(tipo)) {
    await sendAI();
  }
};

/* Construir contexto del sistema para enviar a la IA */
function buildSystemContext() {
  const uid = currentUser?.uid;
  const totalDoctores  = doctors.length;
  const activos        = doctors.filter(d => d.estado === 'Activo').length;
  const inactivos      = doctors.filter(d => d.estado === 'Inactivo').length;
  const pendientes     = formatos.filter(f => f.status === 'Pendiente').length;
  const enRevision     = formatos.filter(f => f.status === 'En revisión').length;
  const listos         = formatos.filter(f => f.status === 'Listo').length;
  const urgentes       = formatos.filter(f => f.prioridad === 'Urgente' && f.status !== 'Listo').length;
  const today          = new Date().toISOString().slice(0, 10);
  const vencidos       = formatos.filter(f => f.fecha && f.fecha < today && f.status !== 'Listo').length;
  const misTareas      = tareas.filter(t => t.asignadoId === uid);
  const misPend        = misTareas.filter(t => t.estado !== 'Completada').length;
  const misVencidas    = misTareas.filter(t => t.fecha && t.fecha < today && t.estado !== 'Completada').length;

  // Lista de doctores activos (hasta 10)
  const listaDoc = doctors.slice(0, 10).map(d =>
    `- ${d.nombre} (${d.especialidad || 'Sin esp.'}, ${d.entidad || 'Sin entidad'}, ${d.estado})`
  ).join('\n');

  // Lista de procesos críticos
  const criticos = formatos
    .filter(f => f.status !== 'Listo')
    .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))
    .slice(0, 8)
    .map(f => {
      const doc = doctors.find(d => d.id === f.doctorId);
      const chk = f.checklist || [];
      const pct = chk.length ? Math.round((chk.filter(c => c.done).length / chk.length) * 100) : 0;
      return `- "${f.nombre}" | Doctor: ${doc?.nombre || '—'} | Estado: ${f.status} | Prioridad: ${f.prioridad || 'Normal'} | Avance checklist: ${pct}% | Límite: ${f.fecha || 'sin fecha'}`;
    }).join('\n');

  // Mis tareas
  const listaTareas = misTareas.slice(0, 8).map(t =>
    `- "${t.titulo}" | Estado: ${t.estado} | Prioridad: ${t.prioridad || 'Normal'} | Vence: ${t.fecha || 'sin fecha'}`
  ).join('\n');

  return `
USUARIO ACTUAL: ${currentProfile?.nombreCompleto} (${currentProfile?.rol || 'Usuario'})
FECHA DE HOY: ${new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}

DOCTORES:
- Total: ${totalDoctores} | Activos: ${activos} | Inactivos: ${inactivos}
${listaDoc}

PROCESOS KANBAN:
- Pendientes: ${pendientes} | En revisión: ${enRevision} | Listos: ${listos}
- Urgentes sin completar: ${urgentes} | Vencidos: ${vencidos}
Procesos más relevantes:
${criticos || 'Sin procesos registrados.'}

MIS TAREAS:
- Pendientes asignadas a mí: ${misPend} | Vencidas: ${misVencidas}
${listaTareas || 'Sin tareas asignadas.'}
`.trim();
}

/* Enviar mensaje a la IA */
window.sendAI = async () => {
  const input   = document.getElementById('aiInput');
  const sendBtn = document.getElementById('aiSendBtn');
  const text    = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  appendAIMsg('user', text);
  hideQuickActions();
  aiHistory.push({ role: 'user', content: text });

  const typingId = showTyping();
  sendBtn.disabled = true;
  setAIStatus('Pensando…');

  try {
    const systemPrompt = `Eres el asistente de inteligencia artificial de Back Office Empresarial, una empresa colombiana de gestión administrativa y facturación médica para doctores y especialistas.

Tu rol es ayudar al equipo administrativo con:
1. Responder preguntas sobre procesos de facturación médica, radicación de cuentas y glosas.
2. Analizar datos del sistema cuando se te comparten (doctores, procesos Kanban, tareas).
3. Redactar textos profesionales: correos, informes, notificaciones, respuestas a glosas.
4. Dar recomendaciones sobre gestión administrativa médica en Colombia.

Contexto actual del sistema:
${buildSystemContext()}

Reglas:
- Responde siempre en español colombiano, de forma clara y profesional.
- Si te piden redactar algo, entrega el texto listo para copiar y usar.
- Si analizas datos, da conclusiones concretas y accionables.
- Mantén las respuestas concisas a menos que se pida un informe completo.`;

    // Convertir historial al formato Gemini (user / model)
    const contents = aiHistory.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY2}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1500 }
        })
      }
    );

    removeTyping(typingId);
    const data = await res.json();

    if (!res.ok) {
      appendAIMsg('bot', `❌ ${data.error?.message || 'Error de Gemini.'}`);
      setAIStatus('Error');
    } else {
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta.';
      appendAIMsg('bot', reply);
      aiHistory.push({ role: 'assistant', content: reply });
      setAIStatus('Listo para ayudarte');
    }
  } catch (e) {
    removeTyping(typingId);
    appendAIMsg('bot', `❌ Error: ${e.message}`);
    setAIStatus('Error');
  }

  sendBtn.disabled = false;
};

/* Helpers de UI */
function appendAIMsg(role, text) {
  const container = document.getElementById('aiMessages');
  const isBot = role === 'bot';
  const av = isBot
    ? `<div class="ai-msg-av bot"><i class="fa-solid fa-robot"></i></div>`
    : `<div class="ai-msg-av user" style="background:${currentProfile?.color||'#1757a8'}">${initials(currentProfile?.nombreCompleto||'U')}</div>`;
  const div = document.createElement('div');
  div.className = `ai-msg ${isBot ? '' : 'user'}`;
  div.innerHTML = `${isBot ? av : ''}<div class="ai-msg-bubble">${escHtml(text)}</div>${isBot ? '' : av}`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function showTyping() {
  const container = document.getElementById('aiMessages');
  const id = 'typing_' + Date.now();
  const div = document.createElement('div');
  div.className = 'ai-msg'; div.id = id;
  div.innerHTML = `<div class="ai-msg-av bot"><i class="fa-solid fa-robot"></i></div>
    <div class="ai-msg-bubble typing">
      <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
      <span style="margin-left:4px">Analizando…</span>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTyping(id) {
  document.getElementById(id)?.remove();
}

function setAIStatus(text) {
  document.getElementById('aiStatus').textContent = text;
}

function hideQuickActions() {
  const el = document.getElementById('aiQuickActions');
  if (el) el.style.display = 'none';
}

/* ══════════════════════════════════════════════════
   CALENDARIO DE GESTIÓN — v2 (filtros + semana mejorada + móvil)
══════════════════════════════════════════════════ */
let calView     = 'mes';
let calDate     = new Date();
let calSelected = null;

const CAL_DAYS   = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const CAL_MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/* Exponer como window para que onchange en HTML funcione */
window.renderCalendario = renderCalendario;
window.setCalView = (view, btn) => {
  calView = view;
  document.querySelectorAll('.cal-toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCalendario();
};
window.calNavPrev = () => {
  if (calView === 'mes') calDate.setMonth(calDate.getMonth() - 1);
  else calDate.setDate(calDate.getDate() - 7);
  calDate = new Date(calDate);
  renderCalendario();
};
window.calNavNext = () => {
  if (calView === 'mes') calDate.setMonth(calDate.getMonth() + 1);
  else calDate.setDate(calDate.getDate() + 7);
  calDate = new Date(calDate);
  renderCalendario();
};
window.calToday = () => { calDate = new Date(); calSelected = null; renderCalendario(); };

/* ── Recopilar eventos ── */
function getCalEvents() {
  const tipoFil = document.getElementById('calFilterTipo')?.value || '';
  const mioFil  = document.getElementById('calFilterMio')?.value  || '';
  const uid     = currentUser?.uid;
  const events  = [];
  const today   = new Date().toISOString().slice(0,10);

  if (tipoFil !== 'tarea') {
    formatos.forEach(f => {
      if (!f.fecha) return;
      if (mioFil === 'me' && f.responsableId !== uid) return;
      const vencido = f.fecha < today && f.status !== 'Listo';
      const doc = doctors.find(d => d.id === f.doctorId);
      events.push({
        id: f.id, fecha: f.fecha, tipo: 'proceso', status: f.status,
        titulo: f.nombre, sub: doc?.nombre || 'Sin doctor',
        prioridad: f.prioridad || 'Normal', vencido,
        cssClass: vencido ? 'vencido' : f.status==='Listo' ? 'proceso-listo' : f.status==='En revisión' ? 'proceso-rev' : 'proceso-pend',
        dotClass: vencido ? 'vencido' : f.status==='Listo' ? 'proceso-listo' : f.status==='En revisión' ? 'proceso-rev' : 'proceso-pend',
      });
    });
  }

  if (tipoFil !== 'proceso') {
    tareas.forEach(t => {
      if (!t.fecha) return;
      if (mioFil === 'me' && t.asignadoId !== uid && t.createdBy !== uid) return;
      const vencido = t.fecha < today && t.estado !== 'Completada';
      const asig = teamMembers.find(m => m.id === t.asignadoId);
      events.push({
        id: t.id, fecha: t.fecha, tipo: 'tarea', status: t.estado,
        titulo: t.titulo, sub: asig ? 'Para: ' + asig.nombreCompleto : 'Sin asignar',
        prioridad: t.prioridad || 'Normal', vencido,
        cssClass: vencido ? 'vencido' : 'tarea-item',
        dotClass: vencido ? 'vencido' : 'tarea-item',
      });
    });
  }
  return events;
}

/* ── Render principal ── */
function renderCalendario() {
  if (calView === 'mes') renderMes();
  else renderSemana();
  updateNavBadgeCalendario();
}

/* ── VISTA MES ── */
function renderMes() {
  const grid = document.getElementById('calGrid');
  grid.className = 'cal-grid mes';

  const y = calDate.getFullYear(), m = calDate.getMonth();
  document.getElementById('calNavTitle').textContent = CAL_MONTHS[m] + ' ' + y;

  // Lunes como primer día
  const firstDayRaw   = new Date(y, m, 1).getDay(); // 0=Dom
  const firstDay      = firstDayRaw === 0 ? 6 : firstDayRaw - 1; // convertir a Lun=0
  const daysInMon     = new Date(y, m + 1, 0).getDate();
  const daysInPrev    = new Date(y, m, 0).getDate();
  const today         = new Date().toISOString().slice(0,10);
  const events        = getCalEvents();

  const byDate = {};
  events.forEach(e => { if (!byDate[e.fecha]) byDate[e.fecha]=[]; byDate[e.fecha].push(e); });

  // Cabecera Lun→Dom
  let html = CAL_DAYS.map(d => `<div class="cal-dow">${d}</div>`).join('');

  // Días mes anterior
  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrev - i;
    const pm  = m === 0 ? 11 : m - 1;
    const py  = m === 0 ? y - 1 : y;
    const ds  = `${py}-${String(pm+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    html += renderMesCell(day, ds, byDate[ds]||[], today, true);
  }
  // Días mes actual
  for (let d = 1; d <= daysInMon; d++) {
    const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    html += renderMesCell(d, ds, byDate[ds]||[], today, false);
  }
  // Completar grilla
  const totalCells = Math.ceil((firstDay + daysInMon) / 7) * 7;
  for (let d = 1; d <= totalCells - firstDay - daysInMon; d++) {
    const nm = m === 11 ? 0 : m + 1;
    const ny = m === 11 ? y + 1 : y;
    const ds = `${ny}-${String(nm+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    html += renderMesCell(d, ds, byDate[ds]||[], today, true);
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.cal-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      calSelected = date;
      grid.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
      showDayPanel(date, byDate[date]||[]);
    });
  });
}

function renderMesCell(day, dateStr, evs, today, otherMonth) {
  let cls = 'cal-cell';
  if (otherMonth)          cls += ' other-month';
  if (dateStr === today)   cls += ' today';
  if (dateStr === calSelected) cls += ' selected';

  const MAX = 3;
  const shown = evs.slice(0, MAX), extra = evs.length - MAX;
  const evHtml = shown.map(e =>
    `<div class="cal-event ${e.cssClass}" title="${escHtml(e.titulo)}">${e.tipo==='tarea'?'✓ ':'● '} ${escHtml(e.titulo)}</div>`
  ).join('') + (extra > 0 ? `<div class="cal-more">+${extra} más</div>` : '');

  return `<div class="${cls}" data-date="${dateStr}">
    <div class="cal-day-num">${day}</div>
    <div class="cal-events">${evHtml}</div>
  </div>`;
}

/* ── VISTA SEMANA — rediseñada ── */
function renderSemana() {
  const grid = document.getElementById('calGrid');
  grid.className = 'cal-grid semana';

  // Calcular lunes de la semana
  const ref  = new Date(calDate);
  const dow  = ref.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  const mon  = new Date(ref); mon.setDate(ref.getDate() + diff);

  const days = Array.from({length:7}, (_,i) => { const d=new Date(mon); d.setDate(mon.getDate()+i); return d; });
  const today  = new Date().toISOString().slice(0,10);
  const events = getCalEvents();

  const startStr = `${days[0].getDate()} ${CAL_MONTHS[days[0].getMonth()].slice(0,3)}`;
  const endStr   = `${days[6].getDate()} ${CAL_MONTHS[days[6].getMonth()].slice(0,3)} ${days[6].getFullYear()}`;
  document.getElementById('calNavTitle').textContent = `${startStr} – ${endStr}`;

  // Agrupar eventos por fecha
  const byDate = {};
  events.forEach(e => { if (!byDate[e.fecha]) byDate[e.fecha]=[]; byDate[e.fecha].push(e); });

  // Build HTML — diseño tipo lista por día, más claro en móvil
  let html = '<div class="week-grid">';
  days.forEach(d => {
    const ds     = d.toISOString().slice(0,10);
    const isToday= ds === today;
    const dayEvs = byDate[ds] || [];
    const dowName= ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][d.getDay()===0?6:d.getDay()-1];

    html += `<div class="week-day-col ${isToday?'week-today':''}">
      <div class="week-day-head ${isToday?'week-today-head':''}">
        <span class="week-dow">${dowName}</span>
        <span class="week-dnum">${d.getDate()}</span>
      </div>
      <div class="week-day-events">`;

    if (!dayEvs.length) {
      html += '<div class="week-empty">Sin eventos</div>';
    } else {
      dayEvs.forEach(e => {
        html += `<div class="week-event ${e.cssClass}" data-id="${e.id}" data-tipo="${e.tipo}">
          <div class="week-event-title">${escHtml(e.titulo)}</div>
          <div class="week-event-sub">${escHtml(e.sub)}</div>
          ${e.vencido?'<span class="week-event-badge venc">Vencido</span>':`<span class="week-event-badge">${e.status}</span>`}
        </div>`;
      });
    }
    html += '</div></div>';
  });
  html += '</div>';
  grid.innerHTML = html;

  // Listeners editar
  grid.querySelectorAll('.week-event').forEach(el => {
    el.addEventListener('click', () => {
      const id   = el.dataset.id;
      const tipo = el.dataset.tipo;
      if (tipo === 'tarea') openTareaModal(id);
      else openFormatoModal(id);
    });
  });
}

/* ── Panel detalle del día ── */
window.showDayPanel = (dateStr, evs) => {
  if (!evs || !evs.length) evs = getCalEvents().filter(e => e.fecha === dateStr);

  const panel  = document.getElementById('calDayPanel');
  const title  = document.getElementById('calDayTitle');
  const evList = document.getElementById('calDayEvents');

  const dateObj = new Date(dateStr + 'T12:00:00');
  title.textContent = dateObj.toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  if (!evs.length) {
    evList.innerHTML = '<div class="cal-empty-day"><i class="fa-regular fa-calendar"></i>Sin eventos este día</div>';
  } else {
    evList.innerHTML = evs.map(e => `
      <div class="cal-day-event-item">
        <div class="cal-day-event-dot" style="background:${dotColor(e.cssClass)}"></div>
        <div class="cal-day-event-info">
          <div class="cal-day-event-title">${escHtml(e.titulo)}</div>
          <div class="cal-day-event-sub">${escHtml(e.sub)}</div>
          <div class="cal-day-event-badge">
            <span class="priority-tag priority-${e.prioridad}">${e.prioridad}</span>
            <span class="badge badge-${e.tipo==='tarea'
              ? (e.status==='Completada'?'done':e.status==='En progreso'?'progress':'pending')
              : statusClass(e.status)
            }" style="margin-left:5px">${e.status}</span>
            ${e.vencido?'<span class="badge" style="background:var(--red-pale);color:var(--red);margin-left:5px">⚠ Vencido</span>':''}
          </div>
        </div>
        <button class="act-btn edit" onclick="${e.tipo==='tarea'?`openTareaModal('${e.id}')`:`openFormatoModal('${e.id}')`}" title="Editar">
          <i class="fa-solid fa-pen"></i>
        </button>
      </div>`).join('');
  }

  panel.style.display = 'block';
  panel.scrollIntoView({behavior:'smooth', block:'nearest'});
};

function dotColor(cls) {
  return {'proceso-pend':'#e65100','proceso-rev':'#b07d0e','proceso-listo':'#24965a','tarea-item':'#1757a8','vencido':'#c0392b'}[cls]||'#8d9ab0';
}

/* ── Badge sidebar ── */
function updateNavBadgeCalendario() {
  const today  = new Date().toISOString().slice(0,10);
  const next7  = new Date(); next7.setDate(next7.getDate()+7);
  const next7s = next7.toISOString().slice(0,10);
  const count  = getCalEvents().filter(e => e.fecha >= today && e.fecha <= next7s && e.status !== 'Listo' && e.status !== 'Completada').length;
  const badge  = document.getElementById('navBadgeCalendario');
  if (badge) { badge.textContent = count||''; badge.style.display = count>0?'inline-block':'none'; }
}

/* ══════════════════════════════════════════════════
   SISTEMA DE NOTIFICACIONES
══════════════════════════════════════════════════ */

/* ── Pedir permiso al navegador (para popups del SO) ── */
function requestBrowserNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/* ── Suscripción en tiempo real a notificaciones del usuario ── */
let notifsUnsub = null;

function subscribeNotifs() {
  if (!currentUser) return;
  const myUid = currentUser.uid;
  let isFirstLoad = true;

  notifsUnsub = onSnapshot(
    query(collection(db, 'notificaciones'), where('toUid', '==', myUid)),
    snap => {
      // Ordenar por fecha descendente en cliente
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds||0)*1000;
          const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds||0)*1000;
          return tb - ta;
        });

      // En la primera carga solo renderizar, no mostrar push de notifs viejas
      if (isFirstLoad) {
        isFirstLoad = false;
        renderNotifPanel(all);
        return;
      }

      // Cambios posteriores: mostrar push solo para documentos nuevos recientes
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const n = { id: change.doc.id, ...change.doc.data() };
          const ms  = n.createdAt?.toMillis ? n.createdAt.toMillis()
                    : n.createdAt?.seconds  ? n.createdAt.seconds * 1000
                    : 0;
          const age = ms ? (Date.now() - ms) / 1000 : 999;
          if (!n.read && age < 30) {
            showPushNotif(n);
            shakeBell();
            triggerBrowserNotif(n);
          }
        }
      });

      renderNotifPanel(all);
    },
    err => {
      console.error('❌ Notificaciones Firestore error:', err.code, err.message);
      toast('Error cargando notificaciones: ' + err.message, 'error');
    }
  );
}

/* ── Renderizar panel de notificaciones ── */
function renderNotifPanel(notifs) {
  const list    = document.getElementById('notifList');
  const countEl = document.getElementById('notifCount');
  const bellEl  = document.getElementById('notifBell');

  const unread = notifs.filter(n => !n.read).length;

  // Badge
  if (unread > 0) {
    countEl.textContent = unread > 99 ? '99+' : unread;
    countEl.style.display = 'flex';
  } else {
    countEl.style.display = 'none';
  }

  // Color del ícono
  bellEl.style.color = unread > 0 ? 'var(--blue)' : '';

  if (!notifs.length) {
    list.innerHTML = `<div class="notif-empty">
      <i class="fa-regular fa-bell-slash"></i>
      <p>Sin notificaciones aún</p>
    </div>`;
    return;
  }

  list.innerHTML = notifs.slice(0, 50).map(n => `
    <div class="notif-item ${n.read ? '' : 'unread'}"
         onclick="openNotif('${n.id}','${n.tipo}','${n.refId||''}')">
      <div class="notif-icon ${n.tipo}">
        <i class="fa-solid ${iconForNotif(n.tipo)}"></i>
      </div>
      <div class="notif-content">
        <div class="notif-title">${escHtml(n.titulo)}</div>
        <div class="notif-body">${escHtml(n.cuerpo)}</div>
        <div class="notif-time">${timeAgo(n.createdAt)}</div>
      </div>
      ${!n.read ? '<div class="notif-unread-dot"></div>' : ''}
    </div>`).join('');
}

function iconForNotif(tipo) {
  return {
    tarea:   'fa-list-check',
    proceso: 'fa-table-columns',
    mention: 'fa-at',
    vence:   'fa-triangle-exclamation',
    sistema: 'fa-circle-info',
  }[tipo] || 'fa-bell';
}

/* ── Toggle panel ── */
window.toggleNotifPanel = () => {
  const panel = document.getElementById('notifPanel');
  const open  = panel.style.display === 'none';
  panel.style.display = open ? 'flex' : 'none';
  if (open) markVisibleAsRead();
};

// Cerrar al hacer click fuera
document.addEventListener('click', e => {
  const wrap = document.getElementById('notifBellWrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('notifPanel').style.display = 'none';
  }
});

/* ── Marcar como leída ── */
async function markAsRead(id) {
  try {
    await updateDoc(doc(db, 'notificaciones', id), { read: true });
  } catch {}
}

async function markVisibleAsRead() {
  const myUid = currentUser?.uid;
  if (!myUid) return;
  try {
    const snap = await getDocs(
      query(collection(db, 'notificaciones'), where('toUid', '==', myUid))
    );
    snap.docs
      .filter(d => !d.data().read)
      .forEach(d => updateDoc(d.ref, { read: true }).catch(() => {}));
  } catch(e) {
    console.error('Error marcando leídas:', e.message);
  }
}

window.markAllRead = async () => {
  await markVisibleAsRead();
};

/* ── Abrir notificación (navegar al recurso) ── */
window.openNotif = (id, tipo, refId) => {
  markAsRead(id);
  document.getElementById('notifPanel').style.display = 'none';
  if (tipo === 'tarea' && refId) {
    navigate('tareas', document.querySelector('[onclick*="tareas"]'));
    setTimeout(() => openTareaModal(refId), 400);
  } else if (tipo === 'proceso' && refId) {
    navigate('kanban', document.querySelector('[onclick*="kanban"]'));
    setTimeout(() => openFormatoModal(refId), 400);
  } else if (tipo === 'vence') {
    navigate('calendario', document.querySelector('[onclick*="calendario"]'));
  } else if (tipo === 'mention') {
    navigate('chat', document.querySelector('[onclick*="chat"]'));
  }
};

/* ── Push animado en esquina ── */
function showPushNotif(n) {
  const container = document.getElementById('pushContainer');
  const div = document.createElement('div');
  div.className = `push-notif ${n.tipo}`;
  div.innerHTML = `
    <div class="push-icon"><i class="fa-solid ${iconForNotif(n.tipo)}"></i></div>
    <div class="push-body">
      <div class="push-title">${escHtml(n.titulo)}</div>
      <div class="push-text">${escHtml(n.cuerpo)}</div>
    </div>
    <button class="push-close" onclick="dismissPush(this.parentElement)">
      <i class="fa-solid fa-xmark"></i>
    </button>`;

  div.addEventListener('click', e => {
    if (e.target.closest('.push-close')) return;
    window.openNotif(n.id, n.tipo, n.refId || '');
    dismissPush(div);
  });

  container.appendChild(div);

  // Auto-dismiss en 5 segundos
  setTimeout(() => dismissPush(div), 5000);
}

window.dismissPush = el => {
  if (!el || !el.parentElement) return;
  el.classList.add('removing');
  setTimeout(() => el.remove(), 350);
};

/* ── Shake campanita ── */
function shakeBell() {
  const bell = document.getElementById('notifBell');
  bell.classList.add('has-unread');
  setTimeout(() => bell.classList.remove('has-unread'), 700);
}

/* ── Notificación del navegador (popup del SO) ── */
function triggerBrowserNotif(n) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (document.hasFocus()) return; // solo si pestaña en segundo plano
  new Notification('BOE Sistema — ' + n.titulo, {
    body: n.cuerpo,
    icon: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
  });
}

/* ══ CREAR NOTIFICACIONES AUTOMÁTICAS ══
   Se llaman desde los puntos clave del sistema
════════════════════════════════════════ */

/* Cuando se crea/edita una tarea */
async function notifTareaAsignada(tarea) {
  if (!tarea.asignadoId) return;
  // Crear notificación incluso si es auto-asignada
  // así el usuario siempre ve confirmación de que la tarea fue creada
  const esMismo = tarea.asignadoId === currentUser?.uid;
  await addDoc(collection(db, 'notificaciones'), {
    toUid:     tarea.asignadoId,
    fromUid:   currentUser.uid,
    fromNombre:currentProfile?.nombreCompleto || '',
    tipo:      'tarea',
    titulo:    esMismo ? '📋 Tarea creada' : '📋 Nueva tarea asignada',
    cuerpo:    esMismo
      ? `Creaste la tarea: "${tarea.titulo}"`
      : `${currentProfile?.nombreCompleto} te asignó: "${tarea.titulo}"`,
    refId:     tarea._tempId || '',
    read:      false,
    createdAt: serverTimestamp(),
  });
}

/* Cuando alguien te menciona en el chat */
async function notifMencion(mensaje, channel) {
  const regex = /@(\w+)/g;
  let match;
  while ((match = regex.exec(mensaje)) !== null) {
    const firstName = match[1].toLowerCase();
    const miembro   = teamMembers.find(m =>
      m.nombreCompleto.split(' ')[0].toLowerCase() === firstName
    );
    if (miembro && miembro.uid !== currentUser?.uid) {
      await addDoc(collection(db, 'notificaciones'), {
        toUid:     miembro.uid,
        fromUid:   currentUser.uid,
        fromNombre:currentProfile?.nombreCompleto || '',
        tipo:      'mention',
        titulo:    `💬 Te mencionaron en #${channel}`,
        cuerpo:    `${currentProfile?.nombreCompleto}: "${mensaje.slice(0,80)}${mensaje.length>80?'…':''}"`,
        refId:     channel,
        read:      false,
        createdAt: serverTimestamp(),
      });
    }
  }
}

/* Verificar procesos que vencen en los próximos 3 días */
async function notifProcesosPorVencer() {
  const uid   = currentUser?.uid;
  const today = new Date();
  const in3   = new Date(); in3.setDate(today.getDate() + 3);
  const todayStr = today.toISOString().slice(0,10);
  const in3Str   = in3.toISOString().slice(0,10);

  formatos.forEach(async f => {
    if (!f.fecha || f.status === 'Listo') return;
    if (f.fecha < todayStr || f.fecha > in3Str) return;
    if (f.responsableId !== uid) return;

    // Verificar si ya se envió notificación hoy para este proceso
    const key = `notif_vence_${f.id}_${todayStr}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');

    const diasRestantes = Math.ceil((new Date(f.fecha+'T23:59:59') - today) / 86400000);
    await addDoc(collection(db, 'notificaciones'), {
      toUid:     uid,
      fromUid:   'sistema',
      fromNombre:'Sistema BOE',
      tipo:      'vence',
      titulo:    `⚠️ Proceso por vencer`,
      cuerpo:    `"${f.nombre}" vence ${diasRestantes === 0 ? 'hoy' : `en ${diasRestantes} día(s)`}`,
      refId:     f.id,
      read:      false,
      createdAt: serverTimestamp(),
    });
  });
}


/* ══════════════════════════════════════════════════
   REPORTES — Gestión de registros de facturación
══════════════════════════════════════════════════ */
let editingFactId = null;

/* Suscripción — cuando cambian facturas, avisar al iframe */
let _facturasDebounce = null;
function subscribeFacturas() {
  // Use query without orderBy as primary — orderBy excludes docs without createdAt
  onSnapshot(
    collection(db,'facturas'),
    snap => {
      clearTimeout(_facturasDebounce);
      _facturasDebounce = setTimeout(() => {
        const facturas = snap.docs
          .map(d => ({id:d.id,...d.data()}))
          .sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
        const frame = document.getElementById('repFrame');
        if (frame?.contentWindow) {
          frame.contentWindow.postMessage({
            type: 'FACTURAS_UPDATE',
            facturas,
            doctors: doctors.map(d=>({id:d.id, nombre:d.nombre, especialidad:d.especialidad}))
          }, '*');
        }
      }, 800);
    }
  );
}

/* También enviar doctors cuando se carga el iframe */
window.addEventListener('message', e => {
  if (e.data?.type === 'IFRAME_READY') {
    const frame = document.getElementById('repFrame');
    if (!frame?.contentWindow) return;

    Promise.all([
      getDocs(collection(db,'facturas')),
      getDocs(collection(db,'doctors')),
    ]).then(([factSnap, docSnap]) => {
      const facturas = factSnap.docs
        .map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      const docsList = docSnap.docs.map(d=>({id:d.id,...d.data()}));
      if (docsList.length) doctors = docsList;
      frame.contentWindow.postMessage({
        type: 'FACTURAS_UPDATE',
        facturas,
        doctors: docsList.map(d=>({id:d.id, nombre:d.nombre, especialidad:d.especialidad}))
      }, '*');
    });
    sendDoctorStyles(frame);
  }
  // Guardar estilo de doctor desde el iframe
  if (e.data?.type === 'SAVE_DOCTOR_STYLE') {
    saveDoctorStyle(e.data.doctorId, e.data.style);
  }
  // Recibir comando del iframe para abrir modal
  if (e.data?.type === 'OPEN_FACTURA_MODAL') {
    openFacturaModal(e.data.id || null);
  }
  if (e.data?.type === 'DELETE_FACTURA') {
    deleteFactura(e.data.id);
  }
});

/* Modal nuevo registro */
window.openFacturaModal = function(id=null) {
  editingFactId = id;
  document.getElementById('modalFacturaTit').textContent = id ? 'Editar Registro' : 'Nuevo Registro de Facturación';
  // Poblar doctores
  const sel = document.getElementById('fxDoctor');
  sel.innerHTML = '<option value="">Seleccionar…</option>' +
    doctors.map(d=>`<option value="${d.id}">${d.nombre}</option>`).join('');

  if (id) {
    // Buscar en Firebase
    getDoc(doc(db,'facturas',id)).then(snap => {
      if (!snap.exists()) return;
      const f = snap.data();
      document.getElementById('fxFecha').value    = f.fecha    || '';
      document.getElementById('fxAnio').value     = f.anio     || 2025;
      document.getElementById('fxMes').value      = f.mes      || '';
      document.getElementById('fxDoctor').value   = f.doctorId || '';
      document.getElementById('fxCtaCobro').value = f.ctaCobro || '';
      document.getElementById('fxEntidad').value  = f.entidad  || '';
      document.getElementById('fxConcepto').value = f.concepto || '';
      document.getElementById('fxValor').value    = f.valor    || '';
    });
  } else {
    ['fxFecha','fxCtaCobro','fxEntidad','fxConcepto','fxValor'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('fxMes').value    = '';
    document.getElementById('fxDoctor').value = '';
    document.getElementById('fxAnio').value   = new Date().getFullYear();
  }
  document.getElementById('facturaModal').classList.add('open');
};

window.closeFacturaModal = function() {
  document.getElementById('facturaModal').classList.remove('open');
  editingFactId = null;
};

window.saveFactura = async function() {
  const mes     = document.getElementById('fxMes').value;
  const entidad = document.getElementById('fxEntidad').value.trim();
  const valor   = Number(document.getElementById('fxValor').value);
  const doctorId= document.getElementById('fxDoctor').value;
  const concepto= document.getElementById('fxConcepto').value.trim();
  if (!mes)     { toast('Selecciona el mes.','error');   return; }
  if (!entidad) { toast('La entidad es obligatoria.','error'); return; }
  if (!valor)   { toast('El valor facturado es obligatorio.','error'); return; }
  if (!doctorId){ toast('Selecciona el doctor.','error'); return; }
  if (!concepto){ toast('El concepto es obligatorio.','error'); return; }

  const docRef = doctors.find(d=>d.id===doctorId);
  const data = {
    fecha:        document.getElementById('fxFecha').value,
    anio:         Number(document.getElementById('fxAnio').value),
    mes, doctorId,
    doctorNombre: docRef?.nombre || '',
    ctaCobro:     document.getElementById('fxCtaCobro').value.trim(),
    entidad, concepto, valor,
    updatedAt:    serverTimestamp(),
  };

  try {
    if (editingFactId) {
      await updateDoc(doc(db,'facturas',editingFactId), data);
      toast('Registro actualizado.','success');
    } else {
      data.createdAt = serverTimestamp();
      data.createdBy = currentUser?.uid;
      await addDoc(collection(db,'facturas'), data);
      toast('Registro guardado.','success');
    }
    closeFacturaModal();
  } catch(e) { toast('Error: '+e.message,'error'); }
};

window.deleteFactura = async function(id) {
  if (!confirm('¿Eliminar este registro?')) return;
  try {
    await deleteDoc(doc(db,'facturas',id));
    toast('Registro eliminado.');
  } catch(e) { toast('Error al eliminar.','error'); }
};

/* ══════════════════════════════════════════════════
   IMPORTAR EXCEL — SheetJS + Firebase
══════════════════════════════════════════════════ */

// Mapeo flexible de columnas del Excel → campos del sistema
// Soporta variaciones de nombres en español/inglés y con tildes
const COL_MAP = {
  fecha:    ['fecha','fecha de factura','fecha factura','date','fecha_factura'],
  anio:     ['año','anio','year','año factura','anio factura'],
  mes:      ['mes','month','mes factura'],
  doctorNombre: ['doctor','nombre doctor','nombre del doctor','medico','médico'],
  ctaCobro: ['cta cobro','cuenta cobro','cta_cobro','cuenta de cobro','cuenta','cta'],
  entidad:  ['entidad','entidad pagadora','eps','aseguradora','empresa'],
  concepto: ['concepto','descripcion','descripción','servicio','tipo servicio'],
  valor:    ['valor facturado','valor','valor_facturado','total','monto','importe','valor factura'],
};

const MESES_NORM = {
  'enero':1,'febrero':2,'marzo':3,'abril':4,'mayo':5,'junio':6,
  'julio':7,'agosto':8,'septiembre':9,'octubre':10,'noviembre':11,'diciembre':12,
  'ene':1,'feb':2,'mar':3,'abr':4,'may':5,'jun':6,
  'jul':7,'ago':8,'sep':9,'oct':10,'nov':11,'dic':12,
  '1':'enero','2':'febrero','3':'marzo','4':'abril','5':'mayo','6':'junio',
  '7':'julio','8':'agosto','9':'septiembre','10':'octubre','11':'noviembre','12':'diciembre',
};
const MESES_NAMES = ['','enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

let importData = []; // filas parseadas listas para subir

/* ── Detectar columna por nombre flexible ── */
function detectCol(headers, candidates) {
  for (const h of headers) {
    const hNorm = h.toLowerCase().trim().replace(/[áà]/g,'a').replace(/[éè]/g,'e').replace(/[íì]/g,'i').replace(/[óò]/g,'o').replace(/[úù]/g,'u');
    for (const c of candidates) {
      if (hNorm === c || hNorm.includes(c) || c.includes(hNorm)) return h;
    }
  }
  return null;
}

/* ── Normalizar mes ── */
function normalizarMes(val) {
  if (!val) return '';
  const v = String(val).toLowerCase().trim()
    .replace(/[áà]/g,'a').replace(/[éè]/g,'e').replace(/[íì]/g,'i').replace(/[óò]/g,'o').replace(/[úù]/g,'u');
  // Si es número (1-12)
  if (/^\d+$/.test(v)) {
    const idx = parseInt(v);
    return MESES_NAMES[idx] || '';
  }
  // Si es nombre
  return MESES_NORM[v] ? MESES_NAMES[MESES_NORM[v]] : v;
}

/* ── Normalizar valor numérico ── */
function normalizarValor(val) {
  if (!val) return 0;
  if (typeof val === 'number') return Math.round(val);
  // Quitar símbolos y puntos de miles colombianos
  const clean = String(val).replace(/[$\s]/g,'').replace(/\./g,'').replace(/,/g,'.');
  return Math.round(parseFloat(clean)) || 0;
}

/* ── Normalizar fecha ── */
function normalizarFecha(val) {
  if (!val) return '';
  if (typeof val === 'number') {
    // Excel serial date
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    return d.toISOString().slice(0,10);
  }
  const s = String(val).trim();
  // DD/MM/YYYY o DD-MM-YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  return s;
}

/* ── Buscar doctor por nombre ── */
function buscarDoctorPorNombre(nombre) {
  if (!nombre) return { id:'', nombre:'' };
  const norm = s => s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'') // remove accents
    .replace(/[^a-z0-9\s]/g,'').trim();
  const n = norm(nombre);
  if (!n) return { id:'', nombre };

  // 1. Exact match (normalized)
  let found = doctors.find(d => norm(d.nombre) === n);
  if (found) return { id:found.id, nombre:found.nombre };

  // 2. Full name contains search (or vice versa)
  found = doctors.find(d => norm(d.nombre).includes(n) || n.includes(norm(d.nombre)));
  if (found) return { id:found.id, nombre:found.nombre };

  // 3. All words of search appear in doctor name
  const words = n.split(/\s+/).filter(w=>w.length>2);
  found = doctors.find(d => {
    const dn = norm(d.nombre);
    return words.length >= 2 && words.every(w => dn.includes(w));
  });
  if (found) return { id:found.id, nombre:found.nombre };

  return { id:'', nombre };
}

/* ── Leer Excel ── */
window.importarExcel = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  // Reset input so same file can be re-selected
  event.target.value = '';

  // Show modal with loading state
  document.getElementById('importModal').classList.add('open');
  document.getElementById('importLoading').style.display = 'block';
  document.getElementById('importPreview').style.display = 'none';
  document.getElementById('importError').style.display  = 'none';
  document.getElementById('importFooter').style.display = 'none';
  importData = [];

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb    = XLSX.read(e.target.result, { type:'array', cellDates:false });
      const ws    = wb.Sheets[wb.SheetNames[0]]; // primera hoja
      const rows  = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });

      if (rows.length < 2) throw new Error('El archivo está vacío o solo tiene encabezados.');

      const headers = rows[0].map(h => String(h).trim());

      // Detectar columnas automáticamente
      const colMap = {};
      for (const [field, candidates] of Object.entries(COL_MAP)) {
        colMap[field] = detectCol(headers, candidates);
      }

      // Verificar columnas obligatorias
      const missing = ['mes','entidad','valor'].filter(f => !colMap[f]);
      if (missing.length) {
        throw new Error(`No se encontraron las columnas obligatorias: ${missing.join(', ')}.\nColumnas detectadas: ${headers.join(', ')}`);
      }

      // Parsear filas (saltar encabezado)
      const parsed = []; const warnings = [];
      rows.slice(1).forEach((row, i) => {
        if (row.every(c => !c)) return; // skip empty rows
        const rowNum = i + 2;

        const get = field => colMap[field] ? row[headers.indexOf(colMap[field])] : '';

        const mes    = normalizarMes(get('mes'));
        const valor  = normalizarValor(get('valor'));
        const entidad= String(get('entidad')||'').trim();

        if (!mes)    { warnings.push(`Fila ${rowNum}: mes no reconocido ("${get('mes')}") — fila omitida`); return; }
        if (!valor)  { warnings.push(`Fila ${rowNum}: valor inválido ("${get('valor')}") — fila omitida`); return; }
        if (!entidad){ warnings.push(`Fila ${rowNum}: entidad vacía — fila omitida`); return; }

        // Detectar año
        let anio = normalizarValor(get('anio'));
        if (!anio) {
          // Intentar extraer del campo fecha
          const fechaRaw = get('fecha');
          const fechaNorm = normalizarFecha(fechaRaw);
          anio = fechaNorm ? parseInt(fechaNorm.slice(0,4)) : new Date().getFullYear();
        }

        const docInfo = buscarDoctorPorNombre(String(get('doctorNombre')||'').trim());
        if (get('doctorNombre') && !docInfo.id) {
          warnings.push(`Fila ${rowNum}: doctor "${get('doctorNombre')}" no encontrado en el sistema — se guardará el nombre`);
        }

        parsed.push({
          fecha:        normalizarFecha(get('fecha')),
          anio,
          mes,
          doctorId:     docInfo.id,
          doctorNombre: docInfo.nombre || String(get('doctorNombre')||'').trim(),
          ctaCobro:     String(get('ctaCobro')||'').trim(),
          entidad,
          concepto:     String(get('concepto')||'').trim(),
          valor,
          _rowNum: rowNum,
        });
      });

      if (!parsed.length) throw new Error('No se encontraron filas válidas para importar.');

      importData = parsed;
      showImportPreview(parsed, warnings, colMap, headers);

    } catch(err) {
      document.getElementById('importLoading').style.display = 'none';
      document.getElementById('importError').style.display = 'block';
      document.getElementById('importErrorMsg').textContent = err.message;
    }
  };
  reader.readAsArrayBuffer(file);
};

/* ── Mostrar previsualización ── */
function showImportPreview(parsed, warnings, colMap, headers) {
  document.getElementById('importLoading').style.display = 'none';
  document.getElementById('importPreview').style.display = 'block';
  document.getElementById('importFooter').style.display  = 'flex';

  // Resumen stats
  const total     = parsed.length;
  const conDoctor = parsed.filter(r => r.doctorId).length;
  const sinDoctor = total - conDoctor;
  document.getElementById('importSummary').innerHTML = `
    <div class="import-stat ok"><span class="import-stat-num">${total}</span><span class="import-stat-label">Filas válidas</span></div>
    <div class="import-stat ok"><span class="import-stat-num">${conDoctor}</span><span class="import-stat-label">Con doctor vinculado</span></div>
    ${sinDoctor>0?`<div class="import-stat warn"><span class="import-stat-num">${sinDoctor}</span><span class="import-stat-label">Sin doctor vinculado</span></div>`:''}
    ${warnings.length>0?`<div class="import-stat err"><span class="import-stat-num">${warnings.length}</span><span class="import-stat-label">Advertencias</span></div>`:''}
  `;

  // Columnas detectadas
  const detected = Object.entries(colMap).filter(([,v])=>v).map(([k,v])=>`<span class="import-col-chip">${v}</span>`).join(' ');
  document.getElementById('importMapping').innerHTML = `
    <i class="fa-solid fa-wand-magic-sparkles"></i>
    <span><strong>Columnas detectadas automáticamente:</strong></span> ${detected}
  `;

  // Contador
  document.getElementById('importRowCount').textContent = `${total} registros`;

  // Tabla preview (primeras 8 filas)
  const preview = parsed.slice(0, 8);
  const table = document.getElementById('importPreviewTable');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Fecha</th><th>Año</th><th>Mes</th><th>Doctor</th>
        <th>Entidad</th><th>Concepto</th><th>Cta Cobro</th><th>Valor Facturado</th>
      </tr>
    </thead>
    <tbody>
      ${preview.map((r,i)=>`
        <tr style="background:${i%2===0?'white':'#fafbfc'}">
          <td>${r.fecha||'—'}</td>
          <td>${r.anio}</td>
          <td style="text-transform:capitalize">${r.mes}</td>
          <td style="color:${r.doctorId?'var(--green)':'var(--orange)'};font-weight:600">${r.doctorNombre||'—'}</td>
          <td>${r.entidad}</td>
          <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.concepto||'—'}</td>
          <td>${r.ctaCobro||'—'}</td>
          <td style="font-weight:700;color:var(--green)">$${Number(r.valor).toLocaleString('es-CO')}</td>
        </tr>`).join('')}
      ${parsed.length>8?`<tr><td colspan="8" style="text-align:center;color:var(--gray-3);font-size:12px;padding:10px">... y ${parsed.length-8} registros más</td></tr>`:''}
    </tbody>`;

  // Advertencias
  const warnEl = document.getElementById('importWarnings');
  warnEl.innerHTML = warnings.slice(0,5).map(w=>`
    <div class="import-warn-item">
      <i class="fa-solid fa-triangle-exclamation" style="flex-shrink:0;margin-top:1px"></i>
      <span>${w}</span>
    </div>`).join('') + (warnings.length>5?`<div style="font-size:12px;color:var(--gray-3);padding:4px 0">... y ${warnings.length-5} advertencias más</div>`:'');
}

/* ── Confirmar y guardar en Firebase ── */
window.confirmarImport = async function() {
  if (!importData.length) return;
  const btn = document.getElementById('btnConfirmImport');
  const replace = document.getElementById('importReplace').checked;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando…';

  try {
    // Si reemplazar: borrar SOLO registros del mismo médico + mes/año
    if (replace) {
      // Group by doctorId + mes + año
      const claves = new Set(importData.map(r => `${r.doctorId||''}_${r.anio}_${r.mes}`));
      const snapExist = await getDocs(collection(db,'facturas'));
      const toDelete  = snapExist.docs.filter(d => {
        const data = d.data();
        // Must match doctorId AND mes AND año — never delete other doctors
        return claves.has(`${data.doctorId||''}_${data.anio}_${data.mes}`);
      });
      await Promise.all(toDelete.map(d => deleteDoc(d.ref)));
    }

    // Guardar en lotes de 20
    const batchSize = 20;
    let saved = 0;
    for (let i = 0; i < importData.length; i += batchSize) {
      const batch = importData.slice(i, i + batchSize);
      await Promise.all(batch.map(r => {
        const { _rowNum, ...data } = r;
        return addDoc(collection(db,'facturas'), {
          ...data,
          createdAt:  serverTimestamp(),
          createdBy:  currentUser?.uid,
          importedAt: serverTimestamp(),
        });
      }));
      saved += batch.length;
      btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando ${saved}/${importData.length}…`;
    }

    toast(`${saved} registros importados exitosamente.`, 'success');

    // Reset button BEFORE closing so it's clean next time
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Guardar en Firebase';

    closeImportModal();

    // Forzar recarga del iframe con todos los datos actualizados
    setTimeout(() => {
      const frame = document.getElementById('repFrame');
      if (frame) frame.src = frame.src;
    }, 1200);

  } catch(err) {
    toast('Error al importar: ' + err.message, 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Guardar en Firebase';
  }
};

window.closeImportModal = function() {
  document.getElementById('importModal').classList.remove('open');
  importData = [];
  // Reset file input so same file can be imported again
  const fileInput = document.getElementById('excelFileInput');
  if (fileInput) fileInput.value = '';
  // Reset confirm button just in case
  const btn = document.getElementById('btnConfirmImport');
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Guardar en Firebase'; }
};

/* ══════════════════════════════════════════════════
   ESTILOS DE DOCTORES — color y logo por doctor
══════════════════════════════════════════════════ */

/* Guardar estilo de un doctor en Firestore */
async function saveDoctorStyle(doctorId, style) {
  if (!doctorId) return;
  try {
    // Guardar card3 como campos planos para evitar problemas de serialización
    const card3 = style.card3 || {};
    await setDoc(doc(db, 'doctorStyles', doctorId), {
      doctorId,
      color:            style.color      || '#1a2c6b',
      logoBase64:       style.logoBase64 || '',
      title:            style.title      || '',
      subtitle:         style.subtitle   || '',
      'card3.url':          card3.url          || '',
      'card3.enlaceLabel':  card3.enlaceLabel  || 'enlace',
      'card3.usuario':      card3.usuario      || '',
      'card3.clave':        card3.clave        || '',
      updatedAt:        serverTimestamp(),
    });
    // Reenviar estilos actualizados al iframe
    const frame = document.getElementById('repFrame');
    if (frame?.contentWindow) sendDoctorStyles(frame);
  } catch(e) {
    console.error('Error guardando estilo:', e.message);
  }
}

/* Leer todos los estilos de doctores y enviarlos al iframe */
async function sendDoctorStyles(frame) {
  try {
    const snap = await getDocs(collection(db, 'doctorStyles'));
    const styles = {};
    snap.docs.forEach(d => {
      const data = d.data();
      // Reconstruir card3 desde campos planos
      styles[d.id] = {
        ...data,
        card3: {
          url:         data['card3.url']         || '',
          enlaceLabel: data['card3.enlaceLabel']  || 'enlace',
          usuario:     data['card3.usuario']      || '',
          clave:       data['card3.clave']        || '',
        }
      };
    });
    frame.contentWindow.postMessage({ type: 'DOCTOR_STYLES', styles }, '*');
  } catch(e) {
    console.error('Error leyendo estilos:', e.message);
  }
}

/* También actualizar iframe cuando cambian los estilos en tiempo real */
onSnapshot(collection(db, 'doctorStyles'), snap => {
  const styles = {};
  snap.docs.forEach(d => {
    const data = d.data();
    styles[d.id] = {
      ...data,
      card3: {
        url:         data['card3.url']         || '',
        enlaceLabel: data['card3.enlaceLabel']  || 'enlace',
        usuario:     data['card3.usuario']      || '',
        clave:       data['card3.clave']        || '',
      }
    };
  });
  const frame = document.getElementById('repFrame');
  if (frame?.contentWindow) {
    frame.contentWindow.postMessage({ type: 'DOCTOR_STYLES', styles }, '*');
  }
});

/* ══════════════════════════════════════════════════
   J.A.R.V.I.S — Just A Rather Very Intelligent System
   Voz bidireccional + acceso completo al sistema BOE
══════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════
   FEATURE 2: Actualización automática mensual
   Si proceso está en Listo y pasó su fecha → siguiente mes
══════════════════════════════════════════════════ */
const MESES_LIST = ['enero','febrero','marzo','abril','mayo','junio',
                    'julio','agosto','septiembre','octubre','noviembre','diciembre'];

async function verificarActualizacionMensual() {
  const today = new Date();
  const todayStr = today.toISOString().slice(0,10);

  for (const f of formatos) {
    // Solo procesar los que están en "Listo" y tienen fecha vencida
    if (f.status !== 'Listo') continue;
    if (!f.fecha || f.fecha > todayStr) continue;

    // Calcular siguiente mes
    const fechaLimite = new Date(f.fecha + 'T12:00:00');
    const dia = fechaLimite.getDate();
    const mesActualIdx = fechaLimite.getMonth(); // 0-11
    const anioActual   = fechaLimite.getFullYear();

    const mesSigIdx  = (mesActualIdx + 1) % 12;
    const anioSig    = mesSigIdx === 0 ? anioActual + 1 : anioActual;

    // Nueva fecha: mismo día, mes siguiente
    const nuevaFecha = `${anioSig}-${String(mesSigIdx+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
    // Nuevo mes de gestión en formato YYYY-MM
    const nuevoMes   = f.mes
      ? (() => {
          const [y,m] = f.mes.split('-');
          const nm = parseInt(m);
          const sig = nm === 12 ? 1 : nm + 1;
          const ay  = nm === 12 ? parseInt(y)+1 : parseInt(y);
          return `${ay}-${String(sig).padStart(2,'0')}`;
        })()
      : '';

    try {
      await updateDoc(doc(db,'formatos',f.id), {
        status:    'Pendiente',
        fecha:     nuevaFecha,
        mes:       nuevoMes,
        // Resetear checklist al inicio
        checklist: (f.checklist||[]).map(i=>({...i, done:false})),
        updatedAt: serverTimestamp(),
        autoUpdated: true,
        autoUpdatedAt: serverTimestamp(),
      });
      toast(`🔄 "${f.nombre}" actualizado al siguiente mes automáticamente.`);
    } catch(e) {
      console.error('Error auto-actualizando proceso:', e.message);
    }
  }
}

/* ══════════════════════════════════════════════════
   J.A.R.V.I.S — Pantalla completa con voz y Gemini
   Botón flotante → Bienvenida → Escucha continua
══════════════════════════════════════════════════ */

const GEMINI_KEY2 = 'AIzaSyCtVoSCyu6RBKot72G1iqWYE3eb_o4-_ZA';

let jrv2Open      = false;
let jrv2Muted     = false;
let jrv2Listening = false;
let jrv2History   = [];
let jrv2Recog     = null;
let jrv2WaveRAF   = null;
let jrv2Phase     = 0;
let jrv2ClockInt  = null;
let jrv2Speaking  = false;

/* ── Inicializar ── */
function initJarvis2() {
  const btn = document.getElementById('jrvTopbarBtn');
  if (btn) btn.style.display = 'flex';
}

/* ── Abrir pantalla ── */
window.jrvOpen = () => {
  jrv2Open = true;
  jrv2History = [];
  document.getElementById('jrvScreen').style.display = 'flex';
  document.getElementById('jrvHistory').innerHTML = '';
  document.getElementById('jrvResponse').style.display = 'none';
  document.getElementById('jrvTranscript').textContent = '';

  // Personalizar saludo
  const nombre  = currentProfile?.nombreCompleto?.split(' ')[0] || 'usuario';
  const hora    = new Date().getHours();
  const saludo  = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches';
  document.getElementById('jrvGreeting').textContent  = `${saludo}, ${nombre}`;
  document.getElementById('jrvStateTxt').textContent  = 'Sistemas en línea · Listo para escucharte';

  // Partículas, canvas y reloj
  jrv2CreateParticles();
  jrv2StartCanvas();
  jrv2StartClock();

  // Bienvenida con voz
  const msg = `${saludo}, ${nombre}. Soy JARVIS, tu asistente de Back Office Empresarial. ¿En qué puedo ayudarte?`;
  setTimeout(() => {
    jrv2Speak(msg, () => {
      // Auto-iniciar escucha tras bienvenida
      jrv2setState('idle');
      document.getElementById('jrvStateTxt').textContent = 'Presiona "Hablar" o escribe tu pregunta';
    });
  }, 400);
};

/* ── Cerrar ── */
window.jrvClose = () => {
  jrv2Open = false;
  jrv2StopListen();
  window.speechSynthesis?.cancel();
  cancelAnimationFrame(jrv2WaveRAF);
  clearInterval(jrv2ClockInt);
  document.getElementById('jrvScreen').style.display = 'none';
  jrv2History = [];
};

/* ── Mute ── */
window.jrvToggleMute2 = () => {
  jrv2Muted = !jrv2Muted;
  const btn  = document.getElementById('jrvMuteBtn2');
  const icon = document.getElementById('jrvMuteIcon');
  btn.classList.toggle('muted', jrv2Muted);
  icon.className = jrv2Muted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
  if (jrv2Muted) window.speechSynthesis?.cancel();
};

/* ── Toggle micrófono ── */
window.jrvToggleMic = () => jrv2Listening ? jrv2StopListen() : jrv2StartListen();

function jrv2StartListen() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    jrv2AddHistory('bot','⚠️ Reconocimiento de voz no disponible. Usa Chrome o Edge.');
    return;
  }
  window.speechSynthesis?.cancel();

  jrv2Recog = new SR();
  jrv2Recog.lang = 'es-CO';
  jrv2Recog.continuous = false;
  jrv2Recog.interimResults = true;

  jrv2Recog.onstart = () => {
    jrv2Listening = true;
    jrv2setState('listening');
    document.getElementById('jrvStateTxt').textContent = 'Escuchando…';
    document.getElementById('jrvTranscript').textContent = '';
  };

  jrv2Recog.onresult = e => {
    const txt = Array.from(e.results).map(r => r[0].transcript).join('');
    document.getElementById('jrvTranscript').textContent = txt;
    if (e.results[e.results.length - 1].isFinal) {
      jrv2StopListen();
      if (txt.trim()) jrv2Process(txt.trim());
    }
  };

  jrv2Recog.onerror = err => {
    jrv2StopListen();
    if (err.error !== 'no-speech') {
      document.getElementById('jrvStateTxt').textContent = 'No te escuché. Intenta de nuevo.';
    }
  };

  jrv2Recog.onend = () => jrv2StopListen();
  jrv2Recog.start();
}

function jrv2StopListen() {
  jrv2Listening = false;
  jrv2Recog?.stop();
  const micBtn  = document.getElementById('jrvMicBtn');
  const micIcon = document.getElementById('jrvMicIcon');
  const micLbl  = document.getElementById('jrvMicLbl');
  if (micBtn)  micBtn.classList.remove('active');
  if (micIcon) micIcon.className = 'fa-solid fa-microphone';
  if (micLbl)  micLbl.textContent = 'Hablar';
  if (!jrv2Speaking) jrv2setState('idle');
}

/* ══════════════════════════════════════════════════
   MODO DUAL: COMANDO + CONVERSACIÓN
══════════════════════════════════════════════════ */
async function jrv2Process(texto) {
  if (!texto.trim()) return;
  document.getElementById('jrvTranscript').textContent = '';
  jrv2AddHistory('usr', texto);
  jrv2History.push({ role:'user', content:texto });

  // ── MODO COMANDO: intentar primero ──
  const cmdResult = jrv2DetectAction(texto);
  if (cmdResult === true) return;           // ejecutó acción y ya respondió
  if (typeof cmdResult === 'string') {      // ejecutó acción y devuelve msg para voz
    jrv2ShowResponse(cmdResult);
    jrv2Speak(cmdResult, ()=>{ jrv2setState('idle'); });
    return;
  }

  // ── MODO CONVERSACIÓN: enviar a Gemini ──
  jrv2setState('thinking');
  document.getElementById('jrvStateTxt').textContent = 'Consultando con Gemini…';

  try {
    const hoy       = new Date().toISOString().slice(0,10);
    const userName  = currentProfile?.nombreCompleto || 'usuario';
    const myTareas  = tareas.filter(t => t.asignadoId === currentUser?.uid);
    const pendientes= myTareas.filter(t => t.estado !== 'Completada');
    const vencidas  = pendientes.filter(t => t.fechaVence && t.fechaVence < hoy);
    const hoyTareas = pendientes.filter(t => t.fechaVence === hoy);
    const notifNo   = typeof notificaciones!=='undefined'
      ? notificaciones.filter(n=>!n.read).length : 0;

    const systemPrompt = `Eres JARVIS, el asistente de inteligencia artificial de Back Office Empresarial, empresa colombiana de gestión administrativa y facturación médica.

Usuario actual: ${userName}
Fecha y hora: ${new Date().toLocaleString('es-CO')}

DATOS EN TIEMPO REAL DEL SISTEMA:
${buildSystemContext()}

TAREAS DEL USUARIO:
- Total mis tareas: ${myTareas.length}
- Pendientes: ${pendientes.length}
- Para hoy: ${hoyTareas.length}${hoyTareas.length?': '+hoyTareas.map(t=>t.titulo).join(', '):''}
- Vencidas: ${vencidas.length}${vencidas.length?': '+vencidas.map(t=>t.titulo).join(', '):''}
- Notificaciones sin leer: ${notifNo}

COMANDOS QUE PUEDES DECIRLE AL USUARIO QUE EXISTEN:
"ve al dashboard/doctores/kanban/tareas/chat/calendario/alertas/reportes/resumen"
"crea una tarea / nuevo proceso / nuevo doctor"
"¿cuántas tareas tengo hoy?" "¿tengo tareas vencidas?" "¿qué tareas se vencen pronto?"

PERSONALIDAD: Profesional, conciso, como JARVIS de Iron Man. Español colombiano.
Frases: "Por supuesto", "Procesado", "Analizando", "Señor/a ${userName.split(' ')[0]}".
Respuestas: máximo 3 oraciones. Si no tienes el dato, di que no está disponible.`;

    const contents = jrv2History.map(m=>({
      role: m.role==='assistant'?'model':'user',
      parts:[{text:m.content}]
    }));

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY2}`,
      {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          system_instruction:{parts:[{text:systemPrompt}]},
          contents,
          generationConfig:{temperature:0.75, maxOutputTokens:350}
        })
      }
    );

    const data  = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sin respuesta de Gemini.';
    jrv2History.push({role:'assistant', content:reply});
    jrv2ShowResponse(reply);
    jrv2Speak(reply, ()=>{
      jrv2setState('idle');
      document.getElementById('jrvStateTxt').textContent = 'Listo · Puedes seguir preguntando';
    });

  } catch(e) {
    jrv2setState('idle');
    const err = '⚠️ Error de conexión: ' + e.message;
    jrv2AddHistory('bot', err);
    document.getElementById('jrvStateTxt').textContent = 'Error — intenta de nuevo';
  }
}

function jrv2ShowResponse(text) {
  jrv2AddHistory('bot', text);
  const el = document.getElementById('jrvResponse');
  el.style.display = 'block';
  el.textContent = text;
}

/* ══════════════════════════════════════════════════
   MODO COMANDO — detección de intención
   Devuelve: true (ejecutó + ya respondió con voz),
             string (msg para mostrar),
             false (no reconocido → modo conversación)
══════════════════════════════════════════════════ */
function jrv2DetectAction(texto) {
  const t    = texto.toLowerCase().trim();
  const hoy  = new Date().toISOString().slice(0,10);
  const man  = new Date(Date.now()+86400000).toISOString().slice(0,10);

  // ── Navegación ──
  const navTriggers = ['ir a','ve a','abre','navega','muéstrame','mostrar','abrir','llévame'];
  const sections = [
    {keys:['dashboard','inicio','panel'],   view:'dashboard'},
    {keys:['doctor','doctores','médico'],   view:'doctores' },
    {keys:['kanban','tablero','proceso'],   view:'kanban'   },
    {keys:['tarea','tareas'],              view:'tareas'   },
    {keys:['chat','mensajes','mensaje'],   view:'chat'     },
    {keys:['calendario','agenda'],         view:'calendario'},
    {keys:['alerta','alertas'],            view:'alertas'  },
    {keys:['reporte','reportes','factura'],view:'reportes' },
    {keys:['resumen'],                     view:'resumen'  },
  ];
  if (navTriggers.some(k=>t.includes(k))) {
    for (const s of sections) {
      if (s.keys.some(k=>t.includes(k))) {
        const msg = `Navegando a ${s.view}. Por supuesto.`;
        jrvClose();
        setTimeout(()=>navigate(s.view, document.querySelector(`[onclick*="${s.view}"]`)),300);
        jrv2AddHistory('bot', msg); jrv2Speak(msg); return true;
      }
    }
  }

  // ── Crear objetos ──
  const createTriggers = ['crea','crear','nuevo','nueva','agregar','añadir','registrar'];
  if (createTriggers.some(k=>t.includes(k))) {
    if (t.includes('tarea')) {
      const msg='Abriendo formulario de nueva tarea.';
      jrvClose(); setTimeout(()=>{navigate('tareas',null);setTimeout(()=>openTareaModal(),400);},300);
      jrv2AddHistory('bot',msg); jrv2Speak(msg); return true;
    }
    if (t.includes('proceso')||t.includes('kanban')||t.includes('formato')) {
      const msg='Abriendo formulario de nuevo proceso.';
      jrvClose(); setTimeout(()=>{navigate('kanban',null);setTimeout(()=>openFormatoModal(),400);},300);
      jrv2AddHistory('bot',msg); jrv2Speak(msg); return true;
    }
    if (t.includes('doctor')||t.includes('médico')) {
      const msg='Abriendo registro de nuevo doctor.';
      jrvClose(); setTimeout(()=>{navigate('doctores',null);setTimeout(()=>openDoctorModal(),400);},300);
      jrv2AddHistory('bot',msg); jrv2Speak(msg); return true;
    }
  }

  // ── Consultas de tareas por fecha ──
  const myTareas   = tareas.filter(t2=>t2.asignadoId===currentUser?.uid);
  const pendientes = myTareas.filter(t2=>t2.estado!=='Completada');

  // ¿Cuántas tareas tengo hoy?
  if ((t.includes('hoy')||t.includes('para hoy')) && (t.includes('tarea')||t.includes('pendiente')||t.includes('cuántas')||t.includes('que tengo'))) {
    const hoyT = pendientes.filter(t2=>t2.fechaVence===hoy);
    const msg  = hoyT.length
      ? `Tiene${hoyT.length>1?'s':''} ${hoyT.length} tarea${hoyT.length>1?'s':''} para hoy: ${hoyT.map(t2=>t2.titulo).join(', ')}.`
      : 'No tienes tareas programadas para hoy.';
    return msg;
  }

  // ¿Tareas para mañana?
  if ((t.includes('mañana')||t.includes('manana')) && t.includes('tarea')) {
    const manT = pendientes.filter(t2=>t2.fechaVence===man);
    const msg  = manT.length
      ? `Para mañana tienes ${manT.length} tarea${manT.length>1?'s':''}: ${manT.map(t2=>t2.titulo).join(', ')}.`
      : 'No tienes tareas para mañana.';
    return msg;
  }

  // ¿Tareas vencidas?
  if (t.includes('vencida')||t.includes('vencido')||(t.includes('venc')&&t.includes('tarea'))) {
    const venc = pendientes.filter(t2=>t2.fechaVence&&t2.fechaVence<hoy);
    const msg  = venc.length
      ? `Tienes ${venc.length} tarea${venc.length>1?'s':''} vencida${venc.length>1?'s':''}: ${venc.map(t2=>t2.titulo).join(', ')}.`
      : 'No tienes tareas vencidas. Todo al día.';
    return msg;
  }

  // ¿Tareas próximas a vencer?
  if (t.includes('próxima')||t.includes('proxima')||t.includes('pronto')||t.includes('vencer')||(t.includes('vence')&&!t.includes('vencida'))) {
    const en7  = new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    const prox = pendientes.filter(t2=>t2.fechaVence&&t2.fechaVence>=hoy&&t2.fechaVence<=en7);
    const msg  = prox.length
      ? `Tienes ${prox.length} tarea${prox.length>1?'s':''} próximas a vencer esta semana: ${prox.map(t2=>t2.titulo).join(', ')}.`
      : 'No tienes tareas próximas a vencer en los próximos 7 días.';
    return msg;
  }

  // ¿Cuántas tareas en total?
  if ((t.includes('cuántas')||t.includes('cuantas')||t.includes('total'))&&t.includes('tarea')) {
    const msg=`Tienes ${pendientes.length} tarea${pendientes.length!==1?'s':''} pendiente${pendientes.length!==1?'s':''} de un total de ${myTareas.length}.`;
    return msg;
  }

  // ¿Hay notificaciones?
  if (t.includes('notificaci')||(t.includes('lleg')&&t.includes('algo'))||t.includes('aviso')) {
    const noRead = typeof notificaciones!=='undefined'
      ? notificaciones.filter(n=>!n.read).length : 0;
    const msg = noRead
      ? `Tienes ${noRead} notificación${noRead>1?'es':''} sin leer.`
      : 'No tienes notificaciones pendientes.';
    return msg;
  }

  // No reconocido → modo conversación
  return false;
}

/* ── Síntesis de voz ── */
function jrv2Speak(texto, onEnd) {
  if (jrv2Muted || !window.speechSynthesis) { onEnd?.(); return; }
  window.speechSynthesis.cancel();
  jrv2Speaking = true;

  const limpio = texto.replace(/\*\*/g,'').replace(/\*/g,'').replace(/#{1,6}\s/g,'')
    .replace(/\n/g,' ').trim().slice(0,350);

  const u = new SpeechSynthesisUtterance(limpio);
  u.lang='es-CO'; u.rate=0.92; u.pitch=0.80; u.volume=1;

  const voz = window.speechSynthesis.getVoices()
    .find(v=>v.lang.startsWith('es')&&/male|hombre|jorge|pablo|diego/i.test(v.name))
    || window.speechSynthesis.getVoices().find(v=>v.lang.startsWith('es'))
    || null;
  if (voz) u.voice = voz;

  u.onstart = () => jrv2setState('speaking');
  u.onend   = () => { jrv2Speaking=false; jrv2setState('idle'); onEnd?.(); };
  u.onerror = () => { jrv2Speaking=false; jrv2setState('idle'); onEnd?.(); };

  window.speechSynthesis.speak(u);
}

/* ── UI helpers ── */
function jrv2setState(state) {
  const core = document.getElementById('jrvOrbCore');
  const icon = document.getElementById('jrvOrbIcon');
  const mic  = document.getElementById('jrvMicBtn');
  const micI = document.getElementById('jrvMicIcon');
  const micL = document.getElementById('jrvMicLbl');

  core?.classList.remove('listening','thinking','speaking');
  if (state !== 'idle') core?.classList.add(state);

  if (mic)  mic.classList.toggle('active', state === 'listening');
  if (micI) micI.className = state==='listening' ? 'fa-solid fa-stop' : 'fa-solid fa-microphone';
  if (micL) micL.textContent = state==='listening' ? 'Parar' : 'Hablar';

  // Topbar button state
  const topBtn = document.getElementById('jrvTopbarBtn');
  if (topBtn) topBtn.classList.toggle('active', state==='listening');
}

function jrv2AddHistory(role, text) {
  const box = document.getElementById('jrvHistory');
  if (!box) return;
  const d = document.createElement('div');
  d.className = `jrv-hist-item ${role}`;
  d.innerHTML = `<div class="jrv-hist-role">${role==='usr'?'Tú':'JARVIS'}</div>${escHtml(text)}`;
  box.appendChild(d);
  box.scrollTop = box.scrollHeight;
}

/* ── Canvas onda ── */
function jrv2StartCanvas() {
  const canvas = document.getElementById('jrvWave');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Fondo canvas
  const bg = document.getElementById('jrvBgCanvas');
  if (bg) {
    bg.width  = window.innerWidth;
    bg.height = window.innerHeight;
    const bgCtx = bg.getContext('2d');
    jrv2DrawGrid(bgCtx, bg.width, bg.height);
  }

  function draw() {
    if (!jrv2Open) return;
    const w=canvas.width, h=canvas.height, cy=h/2;
    ctx.clearRect(0,0,w,h);

    const isListen = jrv2Listening;
    const isSpeak  = jrv2Speaking;
    const amp  = isListen?18:isSpeak?12:3;
    const freq = isListen?.048:.032;
    const spd  = isListen?.12:isSpeak?.08:.025;

    ctx.beginPath();
    ctx.strokeStyle = isListen?'rgba(255,50,100,.85)':'rgba(0,212,255,.75)';
    ctx.lineWidth=2;
    ctx.shadowColor = isListen?'rgba(255,50,100,.4)':'rgba(0,212,255,.4)';
    ctx.shadowBlur=8;

    for(let x=0;x<=w;x++){
      const noise = isListen?(Math.random()-.5)*5:0;
      const y=cy+Math.sin(x*freq+jrv2Phase)*amp+Math.sin(x*freq*1.8+jrv2Phase*1.3)*(amp*.4)+noise;
      x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.stroke();

    // Segunda onda tenue
    ctx.beginPath();
    ctx.strokeStyle=isListen?'rgba(255,100,130,.2)':'rgba(0,150,255,.2)';
    ctx.lineWidth=1; ctx.shadowBlur=0;
    for(let x=0;x<=w;x++){
      const y=cy+Math.sin(x*freq*1.4+jrv2Phase*.9+1.2)*(amp*.45);
      x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.stroke();

    jrv2Phase += spd;
    jrv2WaveRAF = requestAnimationFrame(draw);
  }
  draw();
}

function jrv2DrawGrid(ctx, w, h) {
  ctx.strokeStyle='rgba(0,212,255,.06)';
  ctx.lineWidth=1;
  const step=60;
  for(let x=0;x<w;x+=step){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
  for(let y=0;y<h;y+=step){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
}

function jrv2CreateParticles() {
  const box = document.getElementById('jrvParticles');
  if (!box) return;
  box.innerHTML = '';
  for (let i=0;i<25;i++){
    const p=document.createElement('div');
    p.className='jrv-particle';
    const left=Math.random()*100;
    const dur =8+Math.random()*12;
    const delay=-Math.random()*20;
    const drift=(Math.random()-.5)*80+'px';
    p.style.cssText=`left:${left}%;animation-duration:${dur}s;animation-delay:${delay}s;--drift:${drift};width:${1+Math.random()*2}px;height:${1+Math.random()*2}px;opacity:${.3+Math.random()*.5}`;
    box.appendChild(p);
  }
}

function jrv2StartClock() {
  const el = document.getElementById('jrvScreenTime');
  const tick=()=>{
    if(!jrv2Open){clearInterval(jrv2ClockInt);return;}
    el.textContent=new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  };
  tick();
  jrv2ClockInt=setInterval(tick,1000);
}

if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged=()=>window.speechSynthesis.getVoices();
}

window.initJarvis2 = initJarvis2;

/* ══════════════════════════════════════════════════
   ACCESOS / CREDENCIALES — Clientes
══════════════════════════════════════════════════ */
let localAccesos = []; // [{portal, id, password}]

window.addAccesoRow = () => {
  localAccesos.push({ portal:'', id:'', password:'' });
  renderAccesosTable();
};

window.removeAccesoRow = (idx) => {
  localAccesos.splice(idx, 1);
  renderAccesosTable();
};

window.togglePassVis = (btn) => {
  const inp = btn.previousElementSibling;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  btn.innerHTML = show ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
};

function renderAccesosTable() {
  const tbody  = document.getElementById('accesosBody');
  const empty  = document.getElementById('accesosEmpty');
  if (!tbody) return;

  if (!localAccesos.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = localAccesos.map((a, i) => `
    <tr data-idx="${i}">
      <td><input type="text" class="acc-portal" value="${escHtml(a.portal||'')}" placeholder="SURA, Clínica X…"/></td>
      <td><input type="text" class="acc-id"     value="${escHtml(a.id||'')}"     placeholder="usuario123"/></td>
      <td class="pass-cell">
        <input type="password" class="acc-pass" value="${escHtml(a.password||'')}" placeholder="••••••••"/>
        <button class="pass-eye" onclick="togglePassVis(this)" type="button">
          <i class="fa-solid fa-eye"></i>
        </button>
      </td>
      <td>
        <button class="accesos-del-btn" onclick="removeAccesoRow(${i})" title="Eliminar">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>`).join('');
}

/* ══════════════════════════════════════════════════
   MULTI-RESPONSABLE — Kanban
══════════════════════════════════════════════════ */

function buildRespPicker(selectedIds = []) {
  window._selectedRespIds = selectedIds;
  const picker = document.getElementById('fRespPicker');
  const tagsEl = document.getElementById('fRespSelected');
  if (!picker) return;

  picker.innerHTML = teamMembers.map(m => {
    const sel = selectedIds.includes(m.id);
    const col = m.color || avatarColor(m.nombreCompleto);
    return `<label class="resp-pick-item ${sel?'selected':''}" data-rid="${m.id}">
      <input type="checkbox" value="${m.id}" ${sel?'checked':''}
        onchange="toggleRespPick('${m.id}')"/>
      <div class="resp-tag-av" style="background:${col};width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:white">${initials(m.nombreCompleto)}</div>
      <span>${m.nombreCompleto}</span>
      <small style="color:var(--gray-3);font-size:11px;margin-left:auto">${m.rol||''}</small>
    </label>`;
  }).join('') || '<div style="padding:10px;color:var(--gray-3);font-size:13px">Sin miembros del equipo</div>';

  renderRespTags();
}

window.toggleRespPick = (id) => {
  const ids = window._selectedRespIds || [];
  const idx = ids.indexOf(id);
  if (idx === -1) ids.push(id); else ids.splice(idx, 1);
  window._selectedRespIds = ids;
  document.querySelectorAll('#fRespPicker .resp-pick-item').forEach(el => {
    el.classList.toggle('selected', ids.includes(el.dataset.rid));
  });
  renderRespTags();
};

function renderRespTags() {
  const el = document.getElementById('fRespSelected');
  if (!el) return;
  const ids = window._selectedRespIds || [];
  el.innerHTML = ids.map(id => {
    const m = teamMembers.find(x=>x.id===id);
    if (!m) return '';
    const col = m.color || avatarColor(m.nombreCompleto);
    return `<span class="resp-tag">
      <span class="resp-tag-av" style="background:${col}">${initials(m.nombreCompleto)}</span>
      ${m.nombreCompleto.split(' ')[0]}
      <span class="resp-tag-x" onclick="toggleRespPick('${id}')">✕</span>
    </span>`;
  }).join('');
}

/* ══════════════════════════════════════════════════
   LOGO DEL PROCESO
══════════════════════════════════════════════════ */
/* ── Logo del cliente ── */
window.handleClientLogo = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const b64 = ev.target.result;
    document.getElementById('dLogoBase64').value = b64;
    const prev = document.getElementById('clientLogoPreview');
    prev.innerHTML = `<img src="${b64}" alt="logo"/>`;
    document.getElementById('clearClientLogoBtn').style.display = 'inline-flex';
  };
  reader.readAsDataURL(file);
};

window.clearClientLogo = () => {
  document.getElementById('dLogoBase64').value = '';
  document.getElementById('clientLogoPreview').innerHTML =
    '<i class="fa-solid fa-briefcase" style="font-size:26px;color:var(--gray-3)"></i>';
  document.getElementById('clientLogoFile').value = '';
  document.getElementById('clearClientLogoBtn').style.display = 'none';
};

window.handleProcesoLogo = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const b64 = ev.target.result;
    document.getElementById('fLogoBase64').value = b64;
    const prev = document.getElementById('procLogoPreview');
    prev.innerHTML = `<img src="${b64}" alt="logo"/>`;
  };
  reader.readAsDataURL(file);
};

window.clearProcesoLogo = () => {
  document.getElementById('fLogoBase64').value = '';
  document.getElementById('procLogoPreview').innerHTML =
    '<i class="fa-solid fa-image" style="font-size:22px;color:var(--gray-2)"></i>';
  document.getElementById('fLogoFile').value = '';
};

/* ══════════════════════════════════════════════════
   EGRESOS — Facturas madre/hija + Tablas personalizadas
══════════════════════════════════════════════════ */

let egresos       = [];   // facturas madre con hijas (vista activa)
let tablasEgreso  = [];   // tablas personalizadas (vista activa)
let localHijas    = [];   // hijas en modal activo
let editEgresoId  = null;
let editTablaRowTablaId = null;
let editTablaRowIdx     = null;

const fmtCOP = v => '$ ' + Number(v||0).toLocaleString('es-CO');

/* ── Navegar ── */
function initEgresos() {
  // Cargar logo UROEXPERTOS en el encabezado
  const logoImg = document.getElementById('uroLogoHeader');
  if (logoImg && typeof UROEXPERTOS_LOGO_B64 !== 'undefined') logoImg.src = UROEXPERTOS_LOGO_B64;
  // El estado de carpetas se carga en subscribeEgresos (al login).
  // Salvaguarda: si aún no se cargó, hacerlo ahora y re-renderizar.
  if (!_grupoEstadoCargado) {
    _grupoEstadoCargado = true;
    cargarGrupoColapsado().then(() => { renderEgresoTable(); renderCustomTables(); });
  }
  renderEgresoTable();
  renderCustomTables();
}

/* ══ SUSCRIPCIÓN FIRESTORE ══ */
let _grupoEstadoCargado = false;
function subscribeEgresos() {
  // Cargar el estado de carpetas UNA sola vez, temprano, antes de que
  // los snapshots rendericen. Al terminar, re-renderiza para aplicarlo.
  if (!_grupoEstadoCargado) {
    _grupoEstadoCargado = true;
    cargarGrupoColapsado().then(() => {
      renderEgresoTable();
      renderCustomTables();
    });
  }
  onSnapshot(collection(db,'egresos'), snap => {
    egresos = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderEgresoTable();
    renderCustomTables();
  });
  onSnapshot(collection(db,'tablasEgreso'), snap => {
    const prev = tablasEgreso; // keep transient state
    tablasEgreso = snap.docs.map(d=>{
      const existing = prev.find(t=>t.id===d.id);
      return {
        id:d.id,...d.data(),
        _selectedIdent:   existing?._selectedIdent   || '',
        _selectedIdents:  existing?._selectedIdents  || [],
        _chkContabilidad: d.data().chkContabilidad   || false,
        _chkFacturacion:  d.data().chkFacturacion    || false,
      };
    });
    renderCustomTables();
  });
}

/* ══ TABLA EGRESO (madre/hija) ══ */
/* "2026-07-15" → "15/07/2026" (fecha legible corta) */
function fmtFechaLegible(iso){
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function renderEgresoTable() {
  const tbody = document.getElementById('egresoBody');
  const empty = document.getElementById('egresoEmpty');
  if (!tbody) return;
  if (!egresos.length) {
    tbody.innerHTML=''; empty.style.display='flex'; return;
  }
  empty.style.display='none';

  // Construye el HTML de una factura madre + sus hijas
  const madreHtml = (e, claveGrupo) => {
    const hijas = e.hijas||[];
    const totalHijas = hijas.reduce((s,h)=>s+(Number(h.valorEspecialista)||0),0);
    const totalEntidadHijas = hijas.reduce((s,h)=>s+(Number(h.valorEntidad)||0),0);
    const totalAdminHijas   = hijas.reduce((s,h)=>s+(Number(h.administracion)||0),0);
    const entidadMadre = Number(e.valorEntidad)||0;
    const difEntidad = entidadMadre - totalEntidadHijas;
    const hayDif = hijas.length && Math.abs(difEntidad) > 0.5;
    let h = '';

    // ── FILA MADRE ──
    h += `<tr class="egr-madre" data-mgroup-row="${escHtml(claveGrupo)}" onclick="toggleHijas('${e.id}')">
      <td class="egr-expand-cell">
        <i class="fa-solid fa-chevron-right egr-expand-icon" id="icon-${e.id}"></i>
      </td>
      <td>${e.honorarioMes||'—'}</td>
      <td>${escHtml(e.concepto||'—')}</td>
      <td><strong>${escHtml(e.nombre||'—')}</strong></td>
      <td>${fmtCOP(e.valorEntidad)}</td>
      <td>${fmtCOP(e.administracion)}</td>
      <td class="egr-val-esp">${fmtCOP(e.valorEspecialista)}</td>
      <td><span class="egr-factura-badge">${escHtml(e.factura||'—')}</span></td>
      <td>
        <div class="tbl-actions">
          ${e.fechaPago
            ? `<span class="pago-badge pagada" title="Pagada el ${fmtFechaLegible(e.fechaPago)}"><i class="fa-solid fa-circle-check"></i></span>`
            : `<span class="pago-badge pendiente" title="Pendiente de pago"><i class="fa-solid fa-clock"></i></span>`}
          <button class="act-btn edit" onclick="event.stopPropagation();openEgresoModal('${e.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="act-btn del"  onclick="event.stopPropagation();deleteEgreso('${e.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`;

    // ── FILAS HIJAS ──
    hijas.forEach((hj) => {
      h += `<tr class="egr-hija-row" data-parent="${e.id}" data-mgroup-row="${escHtml(claveGrupo)}" style="display:none">
        <td class="egr-expand-cell egr-hija-indent">
          <i class="fa-solid fa-corner-down-right egr-hija-icon"></i>
        </td>
        <td>${hj.honorarioMes||'—'}</td>
        <td>${escHtml(hj.concepto||'—')}</td>
        <td>${escHtml(hj.nombre||'—')}</td>
        <td>${fmtCOP(hj.valorEntidad)}</td>
        <td>${fmtCOP(hj.administracion)}</td>
        <td class="egr-val-esp">${fmtCOP(hj.valorEspecialista)}</td>
        <td><span class="egr-factura-badge egr-hija-badge">${escHtml(hj.factura||'—')}</span></td>
        <td></td>
      </tr>`;
    });

    // ── FILA TOTAL HIJAS (Entidad, Administración, Especialista por separado) ──
    if (hijas.length) {
      h += `<tr class="egr-total-row" data-parent="${e.id}" data-mgroup-row="${escHtml(claveGrupo)}" style="display:none">
        <td colspan="4" class="egr-total-lbl">Total hijas (${hijas.length}):</td>
        <td class="egr-total-val">${fmtCOP(totalEntidadHijas)}</td>
        <td class="egr-total-val">${fmtCOP(totalAdminHijas)}</td>
        <td class="egr-total-val egr-val-esp">${fmtCOP(totalHijas)}</td>
        <td colspan="2"></td>
      </tr>`;
      if (hayDif) {
        const signo = difEntidad > 0 ? 'Faltan' : 'Sobran';
        h += `<tr class="egr-alerta-row" data-parent="${e.id}" data-mgroup-row="${escHtml(claveGrupo)}" style="display:none">
          <td colspan="9" class="egr-alerta-dif">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <strong>ALERTA:</strong> El valor entidad de las hijas (${fmtCOP(totalEntidadHijas)}) no coincide con el de la madre (${fmtCOP(entidadMadre)}). ${signo} ${fmtCOP(Math.abs(difEntidad))}.
          </td>
        </tr>`;
      } else {
        h += `<tr class="egr-ok-row" data-parent="${e.id}" data-mgroup-row="${escHtml(claveGrupo)}" style="display:none">
          <td colspan="9" class="egr-ok-conciliado">
            <i class="fa-solid fa-circle-check"></i> Valor entidad conciliado: hijas y madre coinciden (${fmtCOP(entidadMadre)}).
          </td>
        </tr>`;
      }
    }
    return h;
  };

  // ── Agrupar facturas madre por mes (campo honorarioMes tipo "2026-03") ──
  const grupos = agruparPorMesMadre(egresos);
  let html = '';
  grupos.forEach(g => {
    const colapsado = grupoColapsado[`madre|${g.clave}`] ? 'colapsado' : '';
    const totalGrupo = g.items.reduce((s,e)=>s+(Number(e.valorEspecialista)||0),0);
    html += `<tr class="tbl-group-row egr-group-row ${colapsado}" data-group="${escHtml(g.clave)}" onclick="toggleGrupoMadre('${escHtml(g.clave)}',this)">
      <td colspan="7" class="tbl-group-cell">
        <i class="fa-solid fa-chevron-down tbl-group-chevron"></i>
        <i class="fa-solid fa-folder-open tbl-group-folder"></i>
        <span class="tbl-group-label">${escHtml(g.etiqueta)}</span>
        <span class="tbl-group-count">${g.items.length} factura${g.items.length!==1?'s':''}</span>
      </td>
      <td class="tbl-group-total">${fmtCOP(totalGrupo)}</td>
      <td></td>
    </tr>`;
    g.items.forEach(e => { html += madreHtml(e, g.clave); });
  });

  tbody.innerHTML = html;

  // Aplicar estado colapsado inicial de los grupos
  grupos.forEach(g => {
    if (grupoColapsado[`madre|${g.clave}`]) {
      tbody.querySelectorAll(`tr[data-mgroup-row="${cssEscapa(g.clave)}"]`).forEach(tr=>tr.style.display='none');
    }
  });
}

/* Agrupa facturas madre por honorarioMes (desc, sin-mes al final) */
function agruparPorMesMadre(items){
  const map = new Map();
  items.forEach(e => {
    const clave = (e.honorarioMes||'').trim() || 'sin-mes';
    if (!map.has(clave)) map.set(clave, []);
    map.get(clave).push(e);
  });
  const claves = [...map.keys()].sort((a,b)=>{
    if (a === 'sin-mes') return 1;
    if (b === 'sin-mes') return -1;
    return b.localeCompare(a);
  });
  return claves.map(clave => ({ clave, etiqueta: etiquetaMes(clave), items: map.get(clave) }));
}

/* Expandir / contraer un grupo de mes de facturas madre */
window.toggleGrupoMadre = (clave, filaCab) => {
  const key = `madre|${clave}`;
  const colapsar = !grupoColapsado[key];
  grupoColapsado[key] = colapsar;
  persistirGrupoColapsado();
  filaCab.classList.toggle('colapsado', colapsar);
  const tbody = document.getElementById('egresoBody');
  if (!tbody) return;
  tbody.querySelectorAll(`tr[data-mgroup-row="${cssEscapa(clave)}"]`).forEach(tr=>{
    if (colapsar) {
      tr.style.display = 'none';
    } else {
      // Al expandir el grupo: mostrar madres; hijas quedan ocultas hasta abrir cada madre
      if (tr.classList.contains('egr-madre')) tr.style.display = '';
      else tr.style.display = 'none';
      // reset del ícono de expansión de cada madre
      if (tr.classList.contains('egr-madre')) {
        const ic = tr.querySelector('.egr-expand-icon');
        ic?.classList.remove('open');
      }
    }
  });
}

window.toggleHijas = (id) => {
  const icon = document.getElementById('icon-'+id);
  const rows = document.querySelectorAll(`[data-parent="${id}"]`);
  const open = [...rows].some(r => r.style.display !== 'none');
  rows.forEach(r => r.style.display = open ? 'none' : 'table-row');
  icon?.classList.toggle('open', !open);
};

/* ══ MODAL EGRESO ══ */
window.openEgresoModal = (id=null) => {
  editEgresoId = id;
  const e = id ? egresos.find(x=>x.id===id) : null;
  document.getElementById('egresoModalTitle').textContent = id?'Editar Egreso':'Nuevo Egreso';
  document.getElementById('egresoId').value = id||'';
  document.getElementById('eFechaFacturacion').value = e?.fechaFacturacion||'';
  document.getElementById('eHonorarioMes').value = e?.honorarioMes||'';
  document.getElementById('eConcepto').value = e?.concepto||'';
  document.getElementById('eNombre').value = e?.nombre||'';
  document.getElementById('eFactura').value = e?.factura||'';
  document.getElementById('eValorEntidad').value = e?.valorEntidad||'';
  document.getElementById('eNotaCredito').value = e?.notaCredito||'';
  document.getElementById('eAdministracion').value = e?.administracion||'';
  document.getElementById('eValorEspecialista').value = e?.valorEspecialista||'';
  document.getElementById('eFechaPago').value = e?.fechaPago||'';
  document.getElementById('eNotas').value = e?.notas||'';
  // Editar: respetar ICA/Rete guardados (pueden ser manuales). Nuevo: auto-calcular.
  if (e) {
    document.getElementById('eIca').value = (e.ica ?? '') === '' ? '' : e.ica;
    document.getElementById('eReteHonorarios').value = (e.reteHonorarios ?? '') === '' ? '' : e.reteHonorarios;
    calcEgresoNeto(true);   // recalcula solo el neto, sin tocar ICA/Rete
  } else {
    calcEgresoNeto();       // egreso nuevo: ICA y Rete automáticos
  }
  localHijas = e?.hijas ? JSON.parse(JSON.stringify(e.hijas)) : [];
  renderHijasTable();
  document.getElementById('egresoModal').classList.add('open');
};

window.calcEgresoNeto = (edicionManual) => {
  const entidad = Number(document.getElementById('eValorEntidad')?.value)||0;
  const nota    = Number(document.getElementById('eNotaCredito')?.value)||0;
  const elIca = document.getElementById('eIca');
  const elRet = document.getElementById('eReteHonorarios');

  // Si NO es edición manual de ICA/Rete, recalcular desde Valor Entidad:
  //   ICA = REDONDEAR(Valor Entidad × 10 / 1000)   (10 x mil)
  //   Retención por Honorarios = Valor Entidad × 11%
  if (!edicionManual) {
    if (elIca) elIca.value = Math.round(entidad * 10 / 1000);
    if (elRet) elRet.value = Math.round(entidad * 0.11);
  }

  const ica     = Number(elIca?.value)||0;
  const reteHon = Number(elRet?.value)||0;

  // Valor Entidad Neto = Valor Entidad − Nota Crédito − ICA − Retención
  const neto = entidad - nota - ica - reteHon;
  const el = document.getElementById('eValorEntidadNeto');
  if(el) el.value = neto;
};

window.closeEgresoModal = () => {
  document.getElementById('egresoModal').classList.remove('open');
  editEgresoId = null; localHijas = [];
};

window.addHijaRow = () => {
  localHijas.push({factura:'', concepto:'', valor:0});
  renderHijasTable();
};

window.removeHijaRow = (i) => {
  localHijas.splice(i,1);
  renderHijasTable();
};

function renderHijasTable() {
  const tbody  = document.getElementById('hijasBody');
  const emptyEl= document.getElementById('hijasEmpty');
  const tableEl= document.getElementById('hijasTableEl');
  if (!tbody) return;
  if (!localHijas.length) {
    tbody.innerHTML='';
    if(emptyEl) emptyEl.style.display='block';
    if(tableEl) tableEl.querySelector('thead').style.display='none';
    updateHijasTotal(); return;
  }
  if(emptyEl) emptyEl.style.display='none';
  if(tableEl) tableEl.querySelector('thead').style.display='';

  tbody.innerHTML = localHijas.map((h,i)=>`
    <tr data-i="${i}"${h.importado?` data-importado="1" title="Importada desde Excel: ${(h.registros||[]).length} registro(s)"`:''}>
      <td><input type="date"   class="hija-fecha"    value="${h.fechaFacturacion||''}"/></td>
      <td><input type="month"  class="hija-mes"       value="${h.honorarioMes||''}"/></td>
      <td><input type="text"   class="hija-concepto" value="${escHtml(h.concepto||'')}"  placeholder="Descripción del servicio…"/></td>
      <td>
        <select class="hija-nombre" style="width:100%;border:1.5px solid var(--gray-1);border-radius:8px;padding:8px 10px;font-size:13px;outline:none;font-family:'Nunito',sans-serif;background:white;color:var(--navy);font-weight:600;cursor:pointer;transition:border-color .2s"
          onchange="autoProveedorFromNombre(this,${i})">
          <option value="">— Seleccionar especialista —</option>
          ${doctors.filter(d=>d.especialista).slice().sort((a,b)=>a.especialista.localeCompare(b.especialista,'es',{sensitivity:'base'})).map(d=>`<option value="${escHtml(d.especialista)}" ${h.nombre===d.especialista?'selected':''}>${escHtml(d.especialista)}</option>`).join('')}
          ${h.nombre && !doctors.some(d=>d.especialista===h.nombre)?`<option value="${escHtml(h.nombre)}" selected>${escHtml(h.nombre)}</option>`:''}
        </select>
      </td>
      <td>
        <select class="hija-tipopersona" style="width:100%;border:1.5px solid var(--gray-1);border-radius:8px;padding:8px 10px;font-size:13px;outline:none;font-family:'Nunito',sans-serif;background:white;color:var(--navy);font-weight:600;cursor:pointer">
          <option value="">— Tipo —</option>
          <option value="Persona Natural" ${h.tipoPersona==='Persona Natural'?'selected':''}>Persona Natural</option>
          <option value="SAS" ${h.tipoPersona==='SAS'?'selected':''}>SAS</option>
        </select>
      </td>
      <td><input type="text" class="hija-proveedor" value="${escHtml(h.proveedor||'')}" placeholder="Nombre empresa…" style="border:1.5px solid var(--gray-1);border-radius:8px;padding:8px 10px;font-size:13px;outline:none;font-family:'Nunito',sans-serif;background:#f8faff;color:var(--navy);font-weight:600;width:100%;transition:border-color .2s" readonly/></td>
      <td><input type="text"   class="hija-factura"  value="${escHtml(h.factura||'')}"  placeholder="FE-001-H"/></td>
      <td><input type="number" class="hija-entidad"  value="${h.valorEntidad||''}"       placeholder="0" min="0"
        oninput="recalcHijaRow(this)"/></td>
      <td>
        <div class="hija-admin-cell">
          <div class="hija-admin-fila1">
            <select class="hija-admin-modo" onchange="recalcHijaRow(this)" title="Cómo se calcula la administración">
              <option value="directo" ${h.adminModo!=='pct'?'selected':''}>Valor $</option>
              <option value="pct" ${h.adminModo==='pct'?'selected':''}>Porcentaje %</option>
            </select>
            <input type="number" class="hija-admin-pct" value="${h.adminPct||''}" placeholder="%" min="0" max="100" step="0.01"
              oninput="recalcHijaRow(this)" title="Porcentaje de administración"
              style="${h.adminModo==='pct'?'':'display:none'}"/>
            <input type="number" class="hija-admin-directo" value="${h.adminModo!=='pct'?(h.administracion||''):''}" placeholder="0" min="0"
              oninput="recalcHijaRow(this)" title="Valor de administración"
              style="width:100px;text-align:right;${h.adminModo==='pct'?'display:none':''}"/>
          </div>
          <div class="hija-admin-resultado">
            <span class="lbl">Admin.</span>
            <input type="number" class="hija-admin" value="${h.administracion||''}" readonly tabindex="-1"
              style="border:none;background:transparent;width:100%;text-align:right;font-weight:800;color:var(--navy);padding:0"/>
          </div>
        </div>
      </td>
      <td><input type="number" class="hija-valor"    value="${h.valorEspecialista||''}"  placeholder="0" min="0"
        oninput="updateHijasTotal()"/></td>
      <td><button class="accesos-del-btn" onclick="removeHijaRow(${i})"><i class="fa-solid fa-trash"></i></button></td>
    </tr>`).join('');
  updateHijasTotal();
}

/* Autocompletar Proveedor desde Nombre Especialista */
window.autoProveedorFromNombre = (selectEl, rowIdx) => {
  const esp = selectEl.value;
  const row = selectEl.closest('tr');
  const provInput = row?.querySelector('.hija-proveedor');
  if (!provInput) return;
  const cliente = doctors.find(d => d.especialista === esp);
  provInput.value = cliente?.nombre || '';
};

function updateHijasTotal() {
  const total = [...document.querySelectorAll('.hija-valor')]
    .reduce((s,el)=>s+(Number(el.value)||0),0);
  const el = document.getElementById('hijasTotal');
  if (el) el.textContent = fmtCOP(total);
}

/* Recalcula una fila hija: modo admin (%/directo), administración y valor especialista.
   Valor Especialista = Valor Entidad − Administración (autocalculado, editable después). */
window.recalcHijaRow = (triggerEl) => {
  const row = triggerEl.closest('tr');
  if (!row) return;
  const entidadEl = row.querySelector('.hija-entidad');
  const modoEl    = row.querySelector('.hija-admin-modo');
  const pctEl     = row.querySelector('.hija-admin-pct');
  const directoEl = row.querySelector('.hija-admin-directo');
  const adminEl   = row.querySelector('.hija-admin');       // resultado (readonly, siempre visible)
  const espEl     = row.querySelector('.hija-valor');
  if (!entidadEl || !adminEl) return;

  const entidad = Number(entidadEl.value)||0;
  const modo    = modoEl?.value || 'directo';
  let admin = 0;

  if (modo === 'pct') {
    // Mostrar campo %, ocultar campo valor directo
    if (pctEl) pctEl.style.display = '';
    if (directoEl) directoEl.style.display = 'none';
    let pct = Number(pctEl?.value)||0;
    if (pct < 0) pct = 0; if (pct > 100) pct = 100;
    if (pctEl) pctEl.value = pct || '';
    admin = Math.round(entidad * pct / 100);
  } else {
    // Mostrar campo valor directo, ocultar %
    if (pctEl) pctEl.style.display = 'none';
    if (directoEl) directoEl.style.display = '';
    admin = Number(directoEl?.value)||0;
  }

  // Validación: administración no puede superar la entidad
  if (admin > entidad) {
    admin = entidad;
    if (modo!=='pct' && directoEl) directoEl.value = admin;
    adminEl.style.color = 'var(--red, #e74c3c)';
    setTimeout(()=>{ adminEl.style.color=''; }, 1200);
  }

  // Resultado de Administración SIEMPRE visible
  adminEl.value = admin;
  // Valor Especialista automático = Entidad − Administración
  if (espEl && row.dataset.importado!=='1') espEl.value = Math.max(0, entidad - admin);
  updateHijasTotal();
};

window.saveEgreso = async () => {
  const factura = document.getElementById('eFactura').value.trim();
  const nombre  = document.getElementById('eNombre').value.trim();
  const conceptoMadre = document.getElementById('eConcepto').value.trim();
  if (!conceptoMadre) { toast('El Concepto es obligatorio.','error'); return; }

  // Leer hijas del DOM — todos los campos iguales a la madre
  const hijas = [];
  document.querySelectorAll('#hijasBody tr').forEach(row=>{
    const honorarioMes     = row.querySelector('.hija-mes')?.value||'';
    const concepto         = row.querySelector('.hija-concepto')?.value.trim()||'';
    const nombre           = row.querySelector('.hija-nombre')?.value||'';
    const tipoPersona      = row.querySelector('.hija-tipopersona')?.value||'';
    const proveedor        = row.querySelector('.hija-proveedor')?.value.trim()||'';
    const factura          = row.querySelector('.hija-factura')?.value.trim()||'';
    const fechaFacturacion = row.querySelector('.hija-fecha')?.value||'';
    const valorEntidad     = Number(row.querySelector('.hija-entidad')?.value)||0;
    const administracion   = Number(row.querySelector('.hija-admin')?.value)||0;
    const valorEspecialista= Number(row.querySelector('.hija-valor')?.value)||0;
    const adminModo        = row.querySelector('.hija-admin-modo')?.value||'directo';
    const adminPct         = Number(row.querySelector('.hija-admin-pct')?.value)||0;
    if (factura||nombre||concepto) hijas.push({fechaFacturacion,honorarioMes,concepto,nombre,tipoPersona,proveedor,factura,valorEntidad,administracion,valorEspecialista,adminModo,adminPct, ...impExtrasFila(row)});
  });

  const data = {
    fechaFacturacion: document.getElementById('eFechaFacturacion').value,
    honorarioMes: document.getElementById('eHonorarioMes').value,
    concepto:     document.getElementById('eConcepto').value.trim(),
    nombre,
    factura,
    valorEntidad:      Number(document.getElementById('eValorEntidad').value)||0,
    ica:               Number(document.getElementById('eIca').value)||0,
    reteHonorarios:    Number(document.getElementById('eReteHonorarios').value)||0,
    notaCredito:       Number(document.getElementById('eNotaCredito').value)||0,
    valorEntidadNeto:  Number(document.getElementById('eValorEntidadNeto').value)||0,
    administracion:    Number(document.getElementById('eAdministracion').value)||0,
    valorEspecialista: Number(document.getElementById('eValorEspecialista').value)||0,
    fechaPago:         document.getElementById('eFechaPago').value||'',
    notas:        document.getElementById('eNotas').value.trim(),
    hijas,
    ...impMetaPara(),
    updatedAt: serverTimestamp()
  };
  try {
    if (editEgresoId) {
      await updateDoc(doc(db,'egresos',editEgresoId),data);
      toast('Registro actualizado.','success');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db,'egresos'),data);
      toast('Registro creado.','success');
    }
    closeEgresoModal();
  } catch(e) { toast('Error: '+e.message,'error'); }
};

window.deleteEgreso = async (id) => {
  if (!confirm('¿Eliminar este egreso?')) return;
  try { await deleteDoc(doc(db,'egresos',id)); toast('Eliminado.'); }
  catch(e) { toast('Error: '+e.message,'error'); }
};

/* ═══════════════════════════════════════════════════════════════════════
   IMPORTACIÓN DE EXCEL → FACTURA MADRE + HIJAS (solo UROEXPERTOS original)
   - Totales de la madre: sobre FILAS ORIGINALES del Excel (por ID registro).
   - Una hija consolidada por especialista; el detalle por paciente se guarda
     en hija.registros (trazabilidad + anti-duplicados), sin cambiar la UI.
   - Filas con varios especialistas: cada hija lleva el valor completo
     (Entidad, Administración y Honorario no se dividen).
   - Se guarda con saveEgreso(): la madre queda igual a una manual.
═══════════════════════════════════════════════════════════════════════ */
/* IMP-PURE-START */
function impNorm(s){
  return String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function impLimpiarNombre(s){ return String(s==null?'':s).replace(/\s+/g,' ').trim(); }

/* Números: acepta 254000, "$ 254.000", "254.000,50", "1,254,000" */
function impParseNum(v){
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v==null?'':v).trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/[$\s]/g,''));
  s = s.replace(/[^0-9.,]/g,'');
  if (!s) return 0;
  const hasDot = s.includes('.'), hasCom = s.includes(',');
  if (hasDot && hasCom){
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g,'').replace(',', '.');
    else s = s.replace(/,/g,'');
  } else if (hasDot){
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');
  } else if (hasCom){
    if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g,'');
    else s = s.replace(',', '.');
  }
  const n = Number(s);
  return isFinite(n) ? (neg ? -n : n) : 0;   // precisión completa; se redondea a pesos al guardar
}

/* Fechas: serial de Excel, Date, "dd/mm/aaaa" (Colombia) o "aaaa-mm-dd" → 'YYYY-MM-DD' */
function impParseFecha(v, XL){
  if (v==null || v==='') return '';
  const pad = n => String(n).padStart(2,'0');
  if (typeof v === 'number' && v > 20000 && v < 80000 && XL && XL.SSF){
    const d = XL.SSF.parse_date_code(v);
    if (d) return d.y + '-' + pad(d.m) + '-' + pad(d.d);
  }
  if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + pad(v.getMonth()+1) + '-' + pad(v.getDate());
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if (m){ let y = Number(m[3]); if (y < 100) y += 2000; return y + '-' + pad(m[2]) + '-' + pad(m[1]); }
  return '';
}

/* Localiza columnas por NOMBRE de encabezado (no por color) */
function impDetectarColumnas(fila){
  const raw = (fila||[]).map(c=>String(c==null?'':c));
  // Las columnas de porcentaje ('% Adm. Uroexpertos') normalizan igual que las de valor: se excluyen
  const h = raw.map(c=>c.includes('%') ? '' : impNorm(c));
  const find = pred => h.findIndex(pred);
  const col = {
    id:   find(x=>x==='id registro' || x.startsWith('id registro')),
    fecha:find(x=>x.includes('fecha servicio')),
    esp:  find(x=>x==='especialista' || x==='especialistas'),
    doc:  find(x=>x.includes('documento')),
    pac:  find(x=>x==='paciente' || x==='nombre paciente'),
    cod:  find(x=>x==='codigo' || x.startsWith('codigo')),
    proc: find(x=>x.includes('procedimiento')),
    ent:  find(x=>x.includes('valor a cobrar')),
    adm:  find(x=>x.includes('adm') && x.includes('uroexpertos')),
    hon:  find(x=>x.includes('honorario por participante')),
    est:  find(x=>x==='estado'),
    entTxt: find(x=>x.startsWith('entidad como')),   // Entidad tal como se digitó (solo lectura, para reportes)
  };
  if (col.fecha<0) col.fecha = find(x=>x.startsWith('fecha'));
  if (col.esp<0)   col.esp   = find(x=>x.includes('especialista') && !x.includes('honorario'));
  if (col.hon<0)   col.hon   = find(x=>x.includes('honorario'));
  if (col.pac<0)   col.pac   = find(x=>x.includes('paciente') && !x.includes('documento'));
  if (col.entTxt<0) col.entTxt = find(x=>x==='entidad');
  return col;
}

/* Busca en todas las hojas la fila de encabezados (tolera filas de título arriba) */
function impLeerLibro(wb, XL){
  const req = { esp:'Especialista', ent:'VALOR A COBRAR A LA CLINICA', adm:'Adm. Uroexpertos', hon:'Honorario por participante' };
  let ultimoError = 'No se encontró una hoja con los encabezados esperados (Especialista, VALOR A COBRAR A LA CLINICA, Adm. Uroexpertos, Honorario por participante).';
  for (const nombreHoja of wb.SheetNames){
    const filas = XL.utils.sheet_to_json(wb.Sheets[nombreHoja], {header:1, raw:true, defval:''});
    for (let i=0; i<Math.min(filas.length, 25); i++){
      const col = impDetectarColumnas(filas[i]);
      const faltan = Object.keys(req).filter(k=>col[k]<0);
      if (!faltan.length){
        const ws = wb.Sheets[nombreHoja];
        const rg = ws['!ref'] ? XL.utils.decode_range(ws['!ref']) : {s:{r:0,c:0}};
        return { hoja:nombreHoja, filaEnc:i, col, filas:filas.slice(i+1), ws, r0:rg.s.r, c0:rg.s.c };
      }
      if (col.esp>=0 && faltan.length<=2) ultimoError = 'Hoja "' + nombreHoja + '": faltan las columnas ' + faltan.map(k=>req[k]).join(', ') + '.';
    }
  }
  throw new Error(ultimoError);
}

/* Filas originales del Excel (una por atención), con la lista de especialistas separada */
function impExtraerRegistros(lectura, XL){
  const col = lectura.col;
  const cel = (f,k) => col[k]>=0 ? f[col[k]] : '';
  const originales = []; const idsVistos = new Set();
  let omitidas = 0, dupArchivo = 0;
  const errores = { ent:0, adm:0, hon:0 }, filasConError = [];
  const esError = (i,k) => {
    if (!lectura.ws || col[k]<0) return false;
    const x = lectura.ws[XL.utils.encode_cell({ r:lectura.r0+lectura.filaEnc+1+i, c:lectura.c0+col[k] })];
    return !!(x && x.t==='e');
  };
  lectura.filas.forEach((f,iFila)=>{
    const espTxt = impLimpiarNombre(cel(f,'esp'));
    if (espTxt){
      let conError = false;
      ['ent','adm','hon'].forEach(k=>{ if (esError(iFila,k)){ errores[k]++; conError = true; } });
      if (conError && filasConError.length<5) filasConError.push(impLimpiarNombre(cel(f,'id')) || ('fila '+(lectura.r0+lectura.filaEnc+2+iFila)));
    }
    const e = impParseNum(cel(f,'ent')), a = impParseNum(cel(f,'adm')), h = impParseNum(cel(f,'hon'));
    if (!espTxt){ if (e||a||h) omitidas++; return; }
    if (/^total/.test(impNorm(espTxt))) return;
    const esps = [];
    espTxt.split(/[,;]/).map(impLimpiarNombre).filter(Boolean).forEach(n=>{
      if (!esps.some(x=>impNorm(x)===impNorm(n))) esps.push(n);
    });
    if (!esps.length){ omitidas++; return; }
    const fecha = impParseFecha(cel(f,'fecha'), XL);
    const doc = impLimpiarNombre(cel(f,'doc')), pac = impLimpiarNombre(cel(f,'pac'));
    const cod = impLimpiarNombre(cel(f,'cod')), proc = impLimpiarNombre(cel(f,'proc'));
    let id = impLimpiarNombre(cel(f,'id'));
    if (!id) id = 'AUTO-' + impNorm([fecha,doc,cod,proc,e,a,h,espTxt].join('|')).replace(/ /g,'-').slice(0,120);
    if (idsVistos.has(id)){ dupArchivo++; return; }
    idsVistos.add(id);
    originales.push({ id, fecha, doc, pac, cod, proc, e, a, h, esps, est: impLimpiarNombre(cel(f,'est')), entTxt: impLimpiarNombre(cel(f,'entTxt')) });
  });
  return { originales, omitidas, dupArchivo, errores, filasConError };
}

function impLev(a,b){
  const m=a.length, n=b.length; if(!m) return n; if(!n) return m;
  let prev = Array.from({length:n+1},(_,j)=>j);
  for (let i=1;i<=m;i++){
    const cur=[i];
    for (let j=1;j<=n;j++) cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=cur;
  }
  return prev[n];
}
function impSimilitud(a,b){ if(!a||!b) return 0; return 1 - impLev(a,b)/Math.max(a.length,b.length); }

/* Compara nombres del Excel con el maestro: exacto → alias guardado → aproximado → nuevo */
function impResolverNombres(nombresExcel, existentes, alias){
  const porNorm = {}; existentes.forEach(n=>{ porNorm[impNorm(n)] = n; });
  return nombresExcel.map(raw=>{
    const n = impNorm(raw);
    if (porNorm[n]) return { raw, estado:'ok', canon:porNorm[n] };
    if (alias[n] && porNorm[impNorm(alias[n])]) return { raw, estado:'alias', canon:porNorm[impNorm(alias[n])] };
    let mejor=null, score=0;
    existentes.forEach(ex=>{
      const en = impNorm(ex);
      let s = impSimilitud(n,en);
      const tn = n.split(' '), te = en.split(' ');
      if (tn.length>=2 && tn.every(t=>te.includes(t))) s = Math.max(s, 0.85);
      if (te.length>=2 && te.every(t=>tn.includes(t))) s = Math.max(s, 0.85);
      if (s>score){ score=s; mejor=ex; }
    });
    if (mejor && score>=0.75) return { raw, estado:'posible', canon:null, sugerido:mejor, score };
    return { raw, estado:'nuevo', canon:null, sugerido:null };
  });
}

/* Reparte registros en hijas consolidadas por especialista.
   Cada fila original se asigna UNA sola vez a cada especialista canónico (clave: ID registro + especialista).
   Si la asignación ya existía (reimportación), se ACTUALIZAN sus valores con los del archivo nuevo. */
function impConstruirHijas(opts){
  const hijas = opts.hijasActuales.map(h=>Object.assign({}, h, h.registros ? {registros:h.registros.map(r=>Object.assign({}, r))} : {}));
  const indice = new Map();
  hijas.forEach(h=>(h.registros||[]).forEach(r=>indice.set(r.k || (r.id + '|' + impNorm(h.nombre)), r)));
  let nuevos = 0, actualizados = 0, repetidos = 0;
  opts.originales.forEach(o=>{
    const canons = [];
    o.esps.forEach(raw=>{ const c = opts.mapaCanon[impNorm(raw)]; if (c && !canons.includes(c)) canons.push(c); });
    canons.forEach(canon=>{
      const k = o.id + '|' + impNorm(canon);
      const datos = { id:o.id, f:o.fecha, doc:o.doc, pac:o.pac, cod:o.cod, proc:o.proc,
                      e:Math.round(o.e), a:Math.round(o.a), h:Math.round(o.h), _e:o.e, _a:o.a, _h:o.h };
      const previo = indice.get(k);
      if (previo){
        if (previo._visto){ repetidos++; return; }            // ya asignada en este mismo archivo: no duplicar
        const cambio = Math.round(previo.e)!==datos.e || Math.round(previo.a)!==datos.a || Math.round(previo.h)!==datos.h;
        Object.assign(previo, datos); delete previo.k; previo._visto = true;
        if (cambio) actualizados++; else repetidos++;
        return;
      }
      let hija = hijas.find(x=>x.importado && impNorm(x.nombre)===impNorm(canon));
      if (!hija){ hija = Object.assign(opts.base(canon), { importado:true, registros:[] }); hijas.push(hija); }
      const reg = Object.assign(datos, { _visto:true });
      hija.registros.push(reg); indice.set(k, reg);
      nuevos++;
    });
  });
  hijas.forEach(x=>{
    (x.registros||[]).forEach(r=>{ delete r._visto; });
    if (!x.importado || !x.registros) return;
    // Pesos enteros sin perder la suma exacta: total = redondeo de la suma exacta del Excel,
    // y el detalle (enteros) suma exactamente ese total (método del mayor residuo).
    ['e','a','h'].forEach(k=>impRedondearCuadrando(x.registros, k));
    x.registros.forEach(r=>{ delete r._e; delete r._a; delete r._h; });
    x.valorEntidad      = x.registros.reduce((s,r)=>s+r.e,0);
    x.administracion    = x.registros.reduce((s,r)=>s+r.a,0);
    x.valorEspecialista = x.registros.reduce((s,r)=>s+r.h,0);
    x.adminModo = 'directo'; x.adminPct = 0;
    const fechas = x.registros.map(r=>r.f).filter(Boolean).sort();
    if (fechas.length){
      x.fechaFacturacion = fechas[fechas.length-1];
      const cuenta = {}; fechas.forEach(f=>{ const p=f.slice(0,7); cuenta[p]=(cuenta[p]||0)+1; });
      x.honorarioMes = Object.entries(cuenta).sort((a,b)=>b[1]-a[1])[0][0];
    }
  });
  return { hijas, nuevos, actualizados, repetidos };
}

/* Convierte a pesos enteros los valores de un campo de modo que su suma sea
   Math.round(suma exacta). Usa el valor exacto del Excel (_campo) si existe. */
function impRedondearCuadrando(registros, k){
  const raw = registros.map(r => Number(r['_'+k] !== undefined ? r['_'+k] : r[k]) || 0);
  const objetivo = Math.round(raw.reduce((s,v)=>s+v,0));
  const base = raw.map(v=>Math.floor(v));
  let faltan = objetivo - base.reduce((s,v)=>s+v,0);
  const orden = raw.map((v,i)=>({ i, frac:v-Math.floor(v) })).sort((p,q)=>(q.frac-p.frac) || (p.i-q.i));
  for (let j=0; j<orden.length && faltan>0; j++, faltan--) base[orden[j].i] += 1;
  registros.forEach((r,i)=>{ r[k] = base[i]; });
}

/* Totales de la madre: SUMA de filas ORIGINALES (por ID), nunca de registros expandidos.
   En reimportación, los valores del archivo nuevo reemplazan los anteriores del mismo ID. */
function impTotalesMadre(importPrevio, originales){
  const porId = new Map();
  (importPrevio||[]).forEach(r=>porId.set(r.id, { id:r.id, e:r.e||0, a:r.a||0 }));
  let nuevasOrig = 0;
  originales.forEach(o=>{ if (!porId.has(o.id)) nuevasOrig++; porId.set(o.id, { id:o.id, e:o.e, a:o.a }); });
  const lista = [...porId.values()];
  return {
    registros: lista.map(r=>({ id:r.id, e:Math.round(r.e), a:Math.round(r.a) })),
    nuevasOrig,
    entidad: Math.round(lista.reduce((s,r)=>s+r.e,0)),     // suma exacta, redondeo final
    admin:   Math.round(lista.reduce((s,r)=>s+r.a,0)),
  };
}

function impPeriodos(originales){
  const c = {};
  originales.forEach(o=>{ if (o.fecha){ const p=o.fecha.slice(0,7); c[p]=(c[p]||0)+1; } });
  return Object.entries(c).sort((a,b)=>b[1]-a[1]);
}
/* IMP-PURE-END */

let _imp = null;       // importación en curso (vista previa)
let _impMeta = null;   // { egresoId, registros } pendiente de guardarse con la madre

/* Datos extra de una fila hija importada (para que saveEgreso no los pierda) */
function impExtrasFila(row){
  const di = row && row.dataset ? row.dataset.i : undefined;
  if (di===undefined || di==='') return {};
  const src = localHijas[Number(di)];
  return (src && src.importado) ? { importado:true, registros: src.registros||[] } : {};
}
function impMetaPara(){
  return (_impMeta && _impMeta.egresoId===editEgresoId) ? { importRegistros:_impMeta.registros } : {};
}
function impImportPrevio(){
  if (_impMeta && _impMeta.egresoId===editEgresoId) return _impMeta.registros;
  const e = editEgresoId ? egresos.find(x=>x.id===editEgresoId) : null;
  return (e && e.importRegistros) || [];
}
function impEspecialistasExistentes(){
  const m = new Map();
  doctors.forEach(d=>{ const n=d.especialista; if (n && String(n).trim() && !m.has(impNorm(n))) m.set(impNorm(n), n); });
  return [...m.values()];
}
async function impCargarAlias(){
  const map = {};
  try {
    const snap = await getDocs(collection(db,'aliasEspecialistas'));
    snap.docs.forEach(d=>{ const x=d.data(); if (x.aliasNorm && x.especialista) map[x.aliasNorm]=x.especialista; });
  } catch(e){ console.warn('No se pudieron leer alias de especialistas:', e); }
  return map;
}
/* Lee las hijas que hay en pantalla (incluye ediciones no guardadas) conservando datos de importación */
function impLeerHijasDOM(){
  const out = [];
  document.querySelectorAll('#hijasBody tr').forEach(row=>{
    const g = s => row.querySelector(s);
    const h = Object.assign({
      fechaFacturacion: g('.hija-fecha')?.value||'', honorarioMes: g('.hija-mes')?.value||'',
      concepto: g('.hija-concepto')?.value.trim()||'', nombre: g('.hija-nombre')?.value||'',
      tipoPersona: g('.hija-tipopersona')?.value||'', proveedor: g('.hija-proveedor')?.value.trim()||'',
      factura: g('.hija-factura')?.value.trim()||'',
      valorEntidad: Number(g('.hija-entidad')?.value)||0, administracion: Number(g('.hija-admin')?.value)||0,
      valorEspecialista: Number(g('.hija-valor')?.value)||0,
      adminModo: g('.hija-admin-modo')?.value||'directo', adminPct: Number(g('.hija-admin-pct')?.value)||0,
    }, impExtrasFila(row));
    if (h.factura||h.nombre||h.concepto||h.importado) out.push(h);
  });
  return out;
}

/* Tipo de Persona para una hija importada. UROEXPERTOS no tiene un valor por defecto
   (una hija nueva nace vacía) ni lo guarda en la ficha del cliente. Prioridad:
   1) ficha del cliente, si algún día lo tiene; 2) el más usado para ese especialista
   en facturas y tablas existentes; 3) vacío (comportamiento actual). */
function impTipoPersonaDe(canon, doctor){
  if (doctor && doctor.tipoPersona) return doctor.tipoPersona;
  const n = impNorm(canon), cuenta = {};
  const sumar = (nombre, tipo) => { if (tipo && impNorm(nombre)===n) cuenta[tipo]=(cuenta[tipo]||0)+1; };
  (egresos||[]).forEach(e=>(e.hijas||[]).forEach(h=>sumar(h.nombre, h.tipoPersona)));
  (tablasEgreso||[]).forEach(t=>(t.filas||[]).forEach(f=>sumar(f.nombre, f.tipoPersona)));
  const top = Object.entries(cuenta).sort((a,b)=>b[1]-a[1])[0];
  return top ? top[0] : '';
}

/* Verificación previa al guardado (#15) y diagnóstico en consola (#14).
   Lanza error si algún especialista tuviera la misma fila dos veces: en ese caso NO se guarda nada. */
function impVerificarYDiagnosticar(hijas, originales, mapaCanon){
  const resumen = [];
  hijas.filter(h=>h.importado).forEach(h=>{
    const ids = h.registros.map(r=>r.id);
    if (new Set(ids).size !== ids.length) throw new Error('Asignación duplicada detectada en '+h.nombre+'. No se guardó nada.');
    const suma = h.registros.reduce((s,r)=>s+r.h,0);
    if (suma !== h.valorEspecialista) throw new Error('El detalle de '+h.nombre+' no cuadra con su total. No se guardó nada.');
    resumen.push({ Especialista:h.nombre, Registros:ids.length, 'Valor Entidad':h.valorEntidad, 'Administración':h.administracion, 'Valor Especialista':h.valorEspecialista });
  });
  window.__impUltimo = { hijas, originales, mapaCanon };
  console.log('%c=== IMPORTACIÓN: RESUMEN POR ESPECIALISTA (asignaciones únicas verificadas) ===','font-weight:bold');
  console.table(resumen);
  console.log('Para ver fila por fila: impDiagnostico("ANDRES CHICA")');
}
/* Detalle fila por fila de un especialista en la última importación, con desgloses para comparar con Excel */
window.impDiagnostico = (nombre) => {
  const U = window.__impUltimo;
  if (!U){ console.warn('Aún no hay una importación en esta sesión.'); return; }
  const n = impNorm(nombre);
  const hija = U.hijas.find(h=>h.importado && impNorm(h.nombre)===n);
  const filas = U.originales.filter(o=>o.esps.some(raw=>impNorm(U.mapaCanon[impNorm(raw)]||raw)===n));
  console.log('%c=== VALIDACIÓN '+nombre.toUpperCase()+' ===','font-weight:bold');
  console.log('Registros encontrados: '+filas.length+(hija?' | en la hija: '+hija.registros.length:''));
  const asignado = {}; (hija ? hija.registros : []).forEach(r=>{ asignado[r.id] = r.h; });
  const val = o => asignado[o.id] !== undefined ? asignado[o.id] : Math.round(o.h);
  console.table(filas.map(o=>({ 'ID registro':o.id, 'Especialista original':o.esps.join(', '), Estado:o.est||'',
    'Honorario (Excel)':o.h, 'Honorario asignado':val(o) })));
  const sum = arr => arr.reduce((s,o)=>s+val(o),0);
  const exacta = arr => Math.round(arr.reduce((s,o)=>s+o.h,0));
  const porEstado = {}; filas.forEach(o=>{ const k=o.est||'(sin estado)'; porEstado[k]=(porEstado[k]||0)+o.h; });
  console.log('TOTAL CALCULADO: '+sum(filas).toLocaleString('es-CO')+' (suma exacta del Excel redondeada: '+exacta(filas).toLocaleString('es-CO')+')'
    +(hija?' | Valor Especialista de la hija: '+hija.valorEspecialista.toLocaleString('es-CO'):''));
  console.log('  Filas donde aparece solo ('+filas.filter(o=>o.esps.length===1).length+'): '+exacta(filas.filter(o=>o.esps.length===1)).toLocaleString('es-CO')+'  ← equivale a SUMAR.SI exacto en Excel');
  console.log('  Filas compartidas ('+filas.filter(o=>o.esps.length>1).length+'): '+exacta(filas.filter(o=>o.esps.length>1)).toLocaleString('es-CO'));
  Object.entries(porEstado).forEach(([k,v])=>console.log('  Estado "'+k+'": '+Math.round(v).toLocaleString('es-CO')));
  return { filas:filas.length, total:sum(filas), hija:hija?hija.valorEspecialista:null };
};

window.impAbrirSelector = () => {
  if (!window.XLSX){ toast('La librería de Excel no cargó. Recarga la página.','error'); return; }
  const inp = document.getElementById('impExcelInput');
  inp.value = ''; inp.click();
};
window.impCerrar = () => { document.getElementById('impExcelModal')?.classList.remove('open'); _imp = null; };

window.impOnFile = async (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), {type:'array'});
    const lectura = impLeerLibro(wb, XLSX);
    const ext = impExtraerRegistros(lectura, XLSX);
    if (!ext.originales.length){ toast('El archivo no tiene filas con especialista y valores.','error'); return; }
    const alias = await impCargarAlias();
    const existentes = impEspecialistasExistentes();
    const unicos = [];
    ext.originales.forEach(o=>o.esps.forEach(n=>{ if (!unicos.some(u=>impNorm(u)===impNorm(n))) unicos.push(n); }));
    const resol = impResolverNombres(unicos, existentes, alias);
    _imp = Object.assign({ archivo:file.name, lectura, resol, existentes }, ext);
    impRenderPreview();
    document.getElementById('impExcelModal').classList.add('open');
  } catch(e){ console.error(e); toast('No se pudo leer el Excel: '+e.message,'error'); }
};

function impRenderPreview(){
  const I = _imp;
  const body = document.getElementById('impExcelBody');
  if (!I || !body) return;
  const concepto = document.getElementById('eConcepto')?.value.trim() || '(sin concepto: escríbelo en la factura madre)';
  const per = impPeriodos(I.originales);
  const tot = impTotalesMadre(impImportPrevio(), I.originales);
  const yaImport = I.originales.length - tot.nuevasOrig;
  const honorTotal = I.originales.reduce((s,o)=>s+Math.round(o.h)*o.esps.length,0);
  const multiEsp = I.originales.filter(o=>o.esps.length>1).length;
  const exOrd = I.existentes.slice().sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));

  const filasEsp = I.resol.map((r,i)=>{
    const regs = I.originales.filter(o=>o.esps.some(n=>impNorm(n)===impNorm(r.raw)));
    const hon = regs.reduce((s,o)=>s+Math.round(o.h),0);
    let estado;
    if (r.canon){
      estado = '<span class="imp-ok"><i class="fa-solid fa-circle-check"></i> ' + escHtml(r.canon)
        + (r.estado==='alias' ? ' <small>(equivalencia guardada)</small>' : '') + '</span>';
    } else {
      const opts = exOrd.map(n=>'<option value="'+escHtml(n)+'" '+(r.estado==='posible'&&r.sugerido===n?'selected':'')+'>'+escHtml(n)+'</option>').join('');
      estado = '<div class="imp-resolver">'
        + '<span class="imp-warn"><i class="fa-solid fa-triangle-exclamation"></i> '
        + (r.estado==='posible' ? 'Posible coincidencia: ¿es '+escHtml(r.sugerido)+'?' : 'No existe en Clientes') + '</span>'
        + '<select class="imp-sel" data-i="'+i+'">'
        + '<option value="__nuevo__" '+(r.estado==='posible'?'':'selected')+'>Crear especialista nuevo: '+escHtml(r.raw)+'</option>'
        + opts + '</select>'
        + '<label class="imp-alias"><input type="checkbox" class="imp-alias-chk" data-i="'+i+'" checked/> Recordar esta equivalencia</label>'
        + '</div>';
    }
    return '<tr><td class="imp-raw">'+escHtml(r.raw)+'</td><td class="imp-num">'+regs.length+'</td>'
      + '<td class="imp-num">'+fmtCOP(hon)+'</td><td>'+estado+'</td></tr>';
  }).join('');

  const avisos = [];
  const nErr = I.errores ? (I.errores.ent + I.errores.adm + I.errores.hon) : 0;
  const btnConf = document.getElementById('impBtnConfirmar');
  if (btnConf) btnConf.disabled = nErr > 0;
  if (nErr){
    const E = I.errores;
    avisos.push('<div class="imp-bloqueo"><b><i class="fa-solid fa-circle-xmark"></i> No se puede importar: el Excel no tiene los valores calculados.</b>'
      + '<div>Celdas con error de Excel (#VALUE!, #REF!…): VALOR A COBRAR A LA CLINICA: '+E.ent+' · Adm. Uroexpertos: '+E.adm+' · Honorario por participante: '+E.hon+'.'
      + (I.filasConError.length ? ' Ejemplos: '+I.filasConError.map(escHtml).join(', ')+'.' : '') + '</div>'
      + '<div>Las fórmulas de esas columnas dependen de otro libro (Tarifas, Parámetros, Honorarios). Exporta la hoja desde el libro maestro pegando <b>solo valores</b> y vuelve a importar. No se guardó nada.</div></div>');
  }
  const fechasUnicas = new Set(I.originales.map(o=>o.fecha).filter(Boolean));
  if (I.originales.length>20 && fechasUnicas.size===1)
    avisos.push('<div class="imp-aviso imp-aviso-fuerte">Las '+I.originales.length+' filas tienen la misma Fecha servicio ('+fmtFechaLegible([...fechasUnicas][0])+'). Honorario Mes y Fecha Facturación de las hijas saldrán de esa fecha: verifica que sea la correcta.</div>');
  if (per.length>1) avisos.push('<label class="imp-aviso imp-aviso-fuerte"><input type="checkbox" id="impMultiMes"/> El archivo tiene registros de '+per.length+' meses ('
    + per.map(p=>etiquetaMes(p[0])+': '+p[1]).join(' · ') + '). Marca para confirmar que quieres mezclarlos en esta factura.</label>');
  if (yaImport) avisos.push('<div class="imp-aviso">'+yaImport+' fila(s) ya estaban importadas en esta factura: no se duplican, se actualizan con los valores de este archivo.</div>');
  if (I.dupArchivo) avisos.push('<div class="imp-aviso">'+I.dupArchivo+' fila(s) con ID registro repetido dentro del archivo: se tomó solo la primera.</div>');
  if (I.omitidas) avisos.push('<div class="imp-aviso">'+I.omitidas+' fila(s) con valores pero sin especialista: se omitieron.</div>');
  if (multiEsp) avisos.push('<div class="imp-aviso imp-aviso-info">'+multiEsp+' fila(s) tienen varios especialistas: cada hija lleva el valor completo. La alerta de conciliación de esta madre mostrará diferencia por ese motivo.</div>');

  body.innerHTML =
    '<div class="imp-resumen">'
    + '<div><span>Factura madre</span><b>'+escHtml(concepto)+'</b></div>'
    + '<div><span>Periodo detectado</span><b>'+(per[0]?etiquetaMes(per[0][0]):'Sin fecha')+'</b></div>'
    + '<div><span>Filas originales</span><b>'+I.originales.length+'</b></div>'
    + '<div><span>Especialistas</span><b>'+I.resol.length+'</b></div>'
    + '</div>'
    + '<div class="imp-totales">'
    + '<div class="imp-tot-tit">Totales de la factura madre (suma de filas originales)</div>'
    + '<div class="imp-tot-grid">'
    + '<div><span>Valor Entidad</span><b>'+fmtCOP(tot.entidad)+'</b></div>'
    + '<div><span>Administración</span><b>'+fmtCOP(tot.admin)+'</b></div>'
    + '<div><span>Honorarios especialistas (este archivo)</span><b>'+fmtCOP(honorTotal)+'</b></div>'
    + '</div></div>'
    + avisos.join('')
    + '<div class="imp-tabla-wrap"><table class="imp-tabla"><thead><tr><th>Especialista en el Excel</th><th>Registros</th><th>Honorarios</th><th>En UROEXPERTOS</th></tr></thead>'
    + '<tbody>'+filasEsp+'</tbody></table></div>'
    + '<div class="imp-archivo"><i class="fa-solid fa-file-excel"></i> '+escHtml(I.archivo)+' · hoja "'+escHtml(I.lectura.hoja)+'"</div>';
}

window.impConfirmar = async () => {
  const I = _imp; if (!I) return;
  if (I.errores && (I.errores.ent + I.errores.adm + I.errores.hon) > 0){ toast('El Excel tiene celdas con error: no se importó nada.','error'); return; }
  const multi = document.getElementById('impMultiMes');
  if (multi && !multi.checked){ toast('Confirma que quieres importar varios meses en la misma factura.','error'); return; }
  const btn = document.getElementById('impBtnConfirmar');
  const txt = btn.innerHTML; btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';
  try {
    // 1. Resolver especialistas (crear nuevos / guardar alias)
    const mapaCanon = {};
    for (let i=0; i<I.resol.length; i++){
      const r = I.resol[i];
      if (r.canon){ mapaCanon[impNorm(r.raw)] = r.canon; continue; }
      const sel = document.querySelector('.imp-sel[data-i="'+i+'"]');
      const val = sel ? sel.value : '__nuevo__';
      if (val==='__nuevo__'){
        const nombre = impLimpiarNombre(r.raw);
        const ya = doctors.find(d=>impNorm(d.especialista)===impNorm(nombre));
        if (ya){ mapaCanon[impNorm(r.raw)] = ya.especialista; continue; }
        const ref = await addDoc(collection(db,'doctors'), {
          nombre, especialista:nombre, logoBase64:'', especialidad:'', entidad:'', correo:'', telefono:'',
          nit:'', contrato:'', estado:'', regimen:'', banco:'', nCuenta:'', tipoCuenta:'',
          observaciones:'Creado desde importación de Excel', accesos:[],
          createdAt:serverTimestamp(), updatedAt:serverTimestamp()
        });
        doctors.push({ id:ref.id, nombre, especialista:nombre });   // disponible ya para el render de hijas
        mapaCanon[impNorm(r.raw)] = nombre;
      } else {
        mapaCanon[impNorm(r.raw)] = val;
        const chk = document.querySelector('.imp-alias-chk[data-i="'+i+'"]');
        if (chk && chk.checked && impNorm(r.raw)!==impNorm(val)){
          await setDoc(doc(db,'aliasEspecialistas', impNorm(r.raw).replace(/ /g,'_')),
            { alias:r.raw, aliasNorm:impNorm(r.raw), especialista:val, updatedAt:serverTimestamp(), updatedBy:currentUser?.email||'' });
        }
      }
    }

    // 2. Repartir registros en hijas (partiendo de lo que hay en pantalla)
    const per = impPeriodos(I.originales);
    const periodo = per[0] ? per[0][0] : '';
    const fechaFact = document.getElementById('eFechaFacturacion')?.value || '';
    const conceptoMadre = document.getElementById('eConcepto')?.value.trim() || 'Honorarios';
    const base = canon => {
      const d = doctors.find(x=>impNorm(x.especialista)===impNorm(canon));
      return { fechaFacturacion:fechaFact, honorarioMes:periodo, concepto:conceptoMadre, nombre:canon,
               tipoPersona:impTipoPersonaDe(canon, d), proveedor:(d && d.nombre)||'', factura:'' };
    };
    const res = impConstruirHijas({ originales:I.originales, mapaCanon, hijasActuales:impLeerHijasDOM(), base });
    // 3. Totales de la madre sobre FILAS ORIGINALES
    const tot = impTotalesMadre(impImportPrevio(), I.originales);
    // Límite de Firestore: 1 MB por documento. Se deja margen para el resto de campos.
    const tamKB = Math.round(new Blob([JSON.stringify({ hijas:res.hijas, importRegistros:tot.registros })]).size / 1024);
    if (tamKB > 900)
      throw new Error('Esta factura quedaría de '+tamKB+' KB y Firebase admite hasta 1024 KB por documento. Divide el archivo en dos facturas madre (por ejemplo, por quincena).');
    const espTotal = res.hijas.filter(h=>h.importado).reduce((s,h)=>s+(Number(h.valorEspecialista)||0),0);
    impVerificarYDiagnosticar(res.hijas, I.originales, mapaCanon);   // valida unicidad y deja el detalle en consola
    const set = (id,v) => { const el=document.getElementById(id); if (el) el.value = v; };
    set('eValorEntidad', tot.entidad);
    set('eAdministracion', tot.admin);
    set('eValorEspecialista', espTotal);
    if (!document.getElementById('eHonorarioMes').value && periodo) set('eHonorarioMes', periodo);
    calcEgresoNeto(false);   // ICA, Retención y Neto con la lógica existente

    _impMeta = { egresoId: editEgresoId, registros: tot.registros };
    localHijas = res.hijas;
    renderHijasTable();
    const nHijas = res.hijas.filter(h=>h.importado).length;
    document.getElementById('impExcelModal')?.classList.remove('open');
    _imp = null;
    toast(res.nuevos+' registro(s) nuevos'+(res.actualizados?' · '+res.actualizados+' actualizados':'')+' en '+nHijas+' hija(s).','success');

    // 4. Guardar con la lógica existente (queda igual que una madre manual)
    await saveEgreso();
  } catch(e){ console.error(e); toast('Error en la importación: '+e.message,'error'); }
  finally { btn.disabled = false; btn.innerHTML = txt; }
};

/* Descartar datos de importación pendientes al abrir/cerrar el modal de la madre */
{
  const _openOrig = window.openEgresoModal;
  window.openEgresoModal = (...a) => { _impMeta = null; return _openOrig(...a); };
  const _closeOrig = window.closeEgresoModal;
  window.closeEgresoModal = (...a) => { _impMeta = null; return _closeOrig(...a); };
}


const PAN_LOGO_B64 = 'data:image/png;base64,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';
/* ═══════════════════════════════════════════════════════════════════════
   REPORTES PANAMERICANA — reporte de honorarios por especialista → PDF
   Solo lectura: reutiliza el lector del importador (impLeerLibro / impExtraerRegistros)
   y NO escribe nada en Firebase.
═══════════════════════════════════════════════════════════════════════ */
/* PAN-PURE-START */
const PAN_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function panFmtCOP(n){ const v = Math.round(Number(n)||0); return (v<0?'-$':'$') + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g,'.'); }
function panFmtFecha(iso){ const m = String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3]+'/'+m[2]+'/'+m[1] : ''; }
function panPeriodo(filas){
  const meses = [...new Set(filas.map(f=>(f.fecha||'').slice(0,7)).filter(Boolean))].sort();
  const lbl = p => PAN_MESES[Number(p.slice(5,7))-1] + ' ' + p.slice(0,4);
  if (!meses.length) return 'Sin fecha';
  if (meses.length===1) return lbl(meses[0]);
  return lbl(meses[0]) + ' – ' + lbl(meses[meses.length-1]);
}
function panNombreArchivo(especialista, periodo){
  const limpio = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  return 'UROEXPERTOS_Panamericana_' + limpio(especialista) + '_' + limpio(periodo) + '.pdf';
}
/* Construye el reporte de UN especialista.
   - participa: la fila se incluye si el especialista está en la lista YA separada y normalizada (no .includes sobre el texto)
   - una fila por ID registro (nunca duplicada)
   - honorario = Honorario por participante, sin dividir; pesos enteros con el mismo reparto de redondeo
     que usa la facturación, para que reporte y factura coincidan al peso */
function panConstruirReporte(originales, claveSel, claveDe){
  const vistos = new Set(); const filas = [];
  originales.forEach((o, idx)=>{
    if (!o.esps.some(raw => claveDe(raw) === claveSel)) return;
    if (vistos.has(o.id)) return;
    vistos.add(o.id);
    filas.push({ idx, id:o.id, fecha:o.fecha, doc:o.doc, pac:o.pac, cod:o.cod, proc:o.proc, entidad:o.entTxt||'', h:0, _h:o.h });
  });
  impRedondearCuadrando(filas, 'h');                     // orden del archivo, igual que la facturación
  const exacto = filas.reduce((s,f)=>s+(Number(f._h)||0),0);
  filas.forEach(f=>{ delete f._h; });
  filas.sort((a,b)=> (a.fecha||'9999').localeCompare(b.fecha||'9999') || (a.idx-b.idx));   // fecha ascendente, orden estable
  const total = filas.reduce((s,f)=>s+f.h,0);
  // Validación matemática obligatoria
  if (new Set(filas.map(f=>f.id)).size !== filas.length) throw new Error('Hay registros duplicados en el reporte.');
  if (total !== Math.round(exacto)) throw new Error('La suma de las filas no coincide con el total del Excel.');
  return { filas, total, periodo: panPeriodo(filas) };
}

/* PDF A4 horizontal con jsPDF + autoTable. Devuelve el documento (no lo descarga). */
function panGenerarPDF(JsPDF, rep, especialista, logo, fechaGen){
  const doc = new JsPDF({ orientation:'landscape', unit:'mm', format:'a4', compress:true });
  const W = 297, H = 210, M = 12;
  const NAVY=[30,27,75], VIOLET=[112,48,230], MAGENTA=[214,51,160], GRIS=[110,110,125], LAV=[246,244,253];
  const LOGO_R = 171/658;
  const barra = (y, h) => {                              // franja degradada navy → violeta → magenta
    const n = 90;
    for (let i=0;i<n;i++){
      const t = i/(n-1), a = t<0.5 ? NAVY : VIOLET, b = t<0.5 ? VIOLET : MAGENTA, u = t<0.5 ? t*2 : (t-0.5)*2;
      doc.setFillColor(...a.map((v,k)=>Math.round(v+(b[k]-v)*u)));
      doc.rect(W*i/n, y, W/n+0.3, h, 'F');
    }
  };
  // ── Encabezado principal (solo página 1) ──
  barra(0, 2.4);
  const lw = 62; doc.addImage(logo, 'PNG', M, 9, lw, lw*LOGO_R, 'logo', 'SLOW');
  doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(...NAVY);
  doc.text('REPORTE DE HONORARIOS', W-M, 17, { align:'right' });
  doc.setFontSize(11); doc.setTextColor(...VIOLET);
  // align:'right' no descuenta el espaciado entre letras: se calcula la posición a mano
  const sub = 'PANAMERICANA', cs = 1.2;
  doc.setCharSpace(cs); doc.text(sub, W-M - (doc.getTextWidth(sub) + cs*sub.length), 23.5); doc.setCharSpace(0);
  doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...GRIS);
  doc.text('Generado el ' + fechaGen, W-M, 28.5, { align:'right' });
  doc.setDrawColor(230,227,243); doc.setLineWidth(0.3); doc.line(M, 32.5, W-M, 32.5);
  // ── Tarjetas de información ──
  const cards = [['ESPECIALISTA', especialista], ['PERIODO', rep.periodo], ['REGISTROS', String(rep.filas.length)], ['TOTAL HONORARIOS', panFmtCOP(rep.total)]];
  const gap = 4, cw = (W-2*M-3*gap)/4, cy = 36, ch = 19;
  cards.forEach(([lbl,val],i)=>{
    const x = M + i*(cw+gap), fuerte = i===3;
    doc.setFillColor(...(fuerte ? NAVY : LAV)); doc.roundedRect(x, cy, cw, ch, 2.2, 2.2, 'F');
    doc.setFillColor(...(fuerte ? MAGENTA : VIOLET)); doc.rect(x, cy+3, 1.2, ch-6, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(7); doc.setTextColor(...(fuerte ? [200,196,240] : GRIS));
    doc.setCharSpace(0.6); doc.text(lbl, x+5, cy+6.5); doc.setCharSpace(0);
    let fs = fuerte ? 15 : 12; doc.setFontSize(fs);
    while (fs>8 && doc.getTextWidth(val) > cw-9){ fs -= 0.5; doc.setFontSize(fs); }
    doc.setTextColor(...(fuerte ? [255,255,255] : NAVY)); doc.text(val, x+5, cy+14.2);
  });
  // ── Tabla ──
  doc.autoTable({
    startY: cy + ch + 6,
    margin: { top: 22, left: M, right: M, bottom: 16 },
    head: [['Fecha','Documento','Paciente','Código','Procedimiento','Entidad','Honorario']],
    body: rep.filas.map(f=>[panFmtFecha(f.fecha), f.doc, f.pac, f.cod, f.proc, f.entidad, panFmtCOP(f.h)]),
    foot: [[{ content:'TOTAL HONORARIOS', colSpan:6, styles:{ halign:'right' } }, panFmtCOP(rep.total)]],
    showHead: 'everyPage', showFoot: 'lastPage', rowPageBreak: 'avoid',
    theme: 'plain',
    styles: { font:'helvetica', fontSize:8.5, cellPadding:{top:2.3,bottom:2.3,left:2.2,right:2.2}, textColor:[40,40,55], overflow:'linebreak', valign:'middle', lineColor:[232,229,244], lineWidth:{bottom:0.2} },
    headStyles: { fillColor:NAVY, textColor:[255,255,255], fontStyle:'bold', fontSize:8.5, cellPadding:{top:3,bottom:3,left:2.2,right:2.2} },
    footStyles: { fillColor:VIOLET, textColor:[255,255,255], fontStyle:'bold', fontSize:11, cellPadding:{top:4,bottom:4,left:3,right:3} },
    alternateRowStyles: { fillColor:[250,249,254] },
    columnStyles: {
      0:{ cellWidth:21 }, 1:{ cellWidth:25 }, 2:{ cellWidth:46 }, 3:{ cellWidth:17 },
      4:{ cellWidth:'auto' }, 5:{ cellWidth:56 }, 6:{ cellWidth:29, halign:'right', fontStyle:'bold', textColor:NAVY },
    },
    didParseCell: d => { if (d.section==='head' && d.column.index===6) d.cell.styles.halign = 'right'; },
  });
  // ── Encabezado reducido (páginas 2+) y pie de página en todas ──
  const total = doc.getNumberOfPages();
  for (let p=1; p<=total; p++){
    doc.setPage(p);
    if (p>1){
      barra(0, 1.6);
      const sw = 30; doc.addImage(logo, 'PNG', M, 6, sw, sw*LOGO_R, 'logo', 'SLOW');
      doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...GRIS);
      doc.text('UROEXPERTOS  —  Reporte de Honorarios  —  ' + especialista, W-M, 11.5, { align:'right' });
    }
    doc.setDrawColor(230,227,243); doc.setLineWidth(0.25); doc.line(M, H-11, W-M, H-11);
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...VIOLET);
    doc.text('UROEXPERTOS', M, H-6.5);
    doc.setFont('helvetica','normal'); doc.setTextColor(...GRIS);
    doc.text('Reporte de Honorarios — Panamericana', M + doc.getTextWidth('UROEXPERTOS ') + 1, H-6.5);
    doc.text('Página ' + p + ' de ' + total, W-M, H-6.5, { align:'right' });
  }
  return doc;
}
/* PAN-PURE-END */

let _pan = null;   // { archivo, originales, especialistas:[{clave,nombre,n}], errores, sel, rep }

function panClaveFactory(alias){
  const maestro = {}; impEspecialistasExistentes().forEach(n=>{ maestro[impNorm(n)] = n; });
  const nombreDe = raw => {
    const n = impNorm(raw);
    if (maestro[n]) return impLimpiarNombre(maestro[n]);   // nombre de Clientes, sin espacios sobrantes
    if (alias[n] && maestro[impNorm(alias[n])]) return impLimpiarNombre(maestro[impNorm(alias[n])]);
    return impLimpiarNombre(raw).toUpperCase();
  };
  return { nombreDe, claveDe: raw => impNorm(nombreDe(raw)) };
}

window.panInit = () => { panRender(); };
window.panAbrirSelector = () => {
  if (!window.XLSX){ toast('La librería de Excel no cargó. Recarga la página.','error'); return; }
  const inp = document.getElementById('panExcelInput'); inp.value=''; inp.click();
};
window.panOnFile = async (ev) => {
  const file = ev.target.files && ev.target.files[0]; if (!file) return;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), {type:'array'});
    const lectura = impLeerLibro(wb, XLSX);
    const ext = impExtraerRegistros(lectura, XLSX);
    if (!ext.originales.length){ toast('El archivo no tiene filas con especialista.','error'); return; }
    const alias = await impCargarAlias();                  // solo lectura
    const { nombreDe, claveDe } = panClaveFactory(alias);
    const mapa = new Map();
    ext.originales.forEach(o=>o.esps.forEach(raw=>{
      const k = claveDe(raw); const e = mapa.get(k) || { clave:k, nombre:nombreDe(raw), n:0 };
      e.n++; mapa.set(k, e);
    }));
    const especialistas = [...mapa.values()].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'}));
    _pan = { archivo:file.name, originales:ext.originales, especialistas, errores:ext.errores, filasConError:ext.filasConError, claveDe, sel:null, rep:null };
    panRender();
  } catch(e){ console.error(e); toast('No se pudo leer el Excel: '+e.message,'error'); }
};
window.panFiltrarLista = () => {
  const q = impNorm(document.getElementById('panBuscar')?.value||'');
  document.querySelectorAll('#panSelect option').forEach(op=>{ if (op.value) op.hidden = !!q && !impNorm(op.textContent).includes(q); });
};
window.panSeleccionar = (clave) => {
  if (!_pan) return;
  _pan.sel = clave || null; _pan.rep = null;
  if (clave){
    try { _pan.rep = panConstruirReporte(_pan.originales, clave, _pan.claveDe); }
    catch(e){ toast('Reporte no válido: '+e.message,'error'); }
  }
  panRender();
};

function panRender(){
  const cont = document.getElementById('panContenido'); if (!cont) return;
  if (!_pan){
    cont.innerHTML = '<div class="pan-vacio"><i class="fa-solid fa-file-excel"></i><p>Sube el mismo Excel de facturación de Panamericana para generar los reportes por especialista.</p>'
      + '<button class="btn btn-primary" onclick="panAbrirSelector()"><i class="fa-solid fa-upload"></i> Subir Excel</button></div>';
    return;
  }
  const P = _pan;
  const nErr = P.errores ? P.errores.hon : 0;
  const esp = P.especialistas.find(e=>e.clave===P.sel);
  let h = '<div class="pan-barra">'
    + '<div class="pan-archivo"><i class="fa-solid fa-circle-check"></i> Excel cargado: <b>'+escHtml(P.archivo)+'</b> · '+P.originales.length+' filas · '+P.especialistas.length+' especialistas</div>'
    + '<button class="btn btn-ghost btn-xs" onclick="panAbrirSelector()"><i class="fa-solid fa-rotate"></i> Cambiar Excel</button></div>';
  if (nErr){
    h += '<div class="imp-bloqueo"><b><i class="fa-solid fa-circle-xmark"></i> El Excel no tiene los honorarios calculados.</b><div>'+nErr
      + ' celdas de "Honorario por participante" tienen error de Excel (#VALUE!…). Exporta la hoja pegando solo valores y vuelve a cargarla.</div></div>';
    cont.innerHTML = h; return;
  }
  h += '<div class="pan-selector"><label>Especialista</label>'
    + '<input type="text" id="panBuscar" placeholder="Escribe para buscar…" oninput="panFiltrarLista()"/>'
    + '<select id="panSelect" onchange="panSeleccionar(this.value)"><option value="">Seleccione especialista</option>'
    + P.especialistas.map(e=>'<option value="'+escHtml(e.clave)+'" '+(e.clave===P.sel?'selected':'')+'>'+escHtml(e.nombre)+'  ('+e.n+')</option>').join('')
    + '</select></div>';
  if (P.rep && esp){
    const R = P.rep;
    h += '<div class="pan-cards">'
      + '<div><span>Especialista</span><b>'+escHtml(esp.nombre)+'</b></div>'
      + (() => { const cs = panCorreosDe(P.sel);
          return cs.length
            ? '<div><span>Correo</span><b title="'+escHtml(cs.join(', '))+'">'+escHtml(cs[0])+(cs.length>1?' (+'+(cs.length-1)+')':'')+'</b></div>'
            : '<div class="pan-card-sincorreo"><span>Correo</span><b>Sin correo en Clientes</b><a onclick="navigate(\'doctores\')">Ir a Clientes</a></div>'; })()
      + '<div><span>Periodo</span><b>'+escHtml(R.periodo)+'</b></div>'
      + '<div><span>Registros</span><b>'+R.filas.length+'</b></div>'
      + '<div class="pan-card-total"><span>Total honorarios</span><b>'+panFmtCOP(R.total)+'</b></div></div>'
      + '<div class="pan-acciones"><button class="btn btn-ghost" onclick="panExportarPDF()"><i class="fa-solid fa-file-pdf"></i> Exportar PDF</button>'
      + '<button class="btn btn-primary" onclick="panAbrirEnvio()"><i class="fa-solid fa-paper-plane"></i> Enviar al especialista</button></div>'
      + '<div class="pan-tabla-wrap"><table class="pan-tabla"><thead><tr><th>Fecha</th><th>Documento</th><th>Paciente</th><th>Código</th><th>Procedimiento</th><th>Entidad</th><th class="num">Honorario</th></tr></thead><tbody>'
      + R.filas.map(f=>'<tr><td>'+panFmtFecha(f.fecha)+'</td><td>'+escHtml(f.doc)+'</td><td>'+escHtml(f.pac)+'</td><td>'+escHtml(f.cod)+'</td><td>'+escHtml(f.proc)+'</td><td>'+escHtml(f.entidad)+'</td><td class="num">'+panFmtCOP(f.h)+'</td></tr>').join('')
      + '</tbody><tfoot><tr><td colspan="6">TOTAL HONORARIOS</td><td class="num">'+panFmtCOP(R.total)+'</td></tr></tfoot></table></div>';
  }
  cont.innerHTML = h;
}

/* Genera el PDF del reporte actual. ÚNICA fuente para "Exportar PDF" y "Enviar al especialista". */
function panPrepararPDF(){
  const P = _pan; if (!P || !P.rep) throw new Error('Selecciona un especialista.');
  const JsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!JsPDF) throw new Error('La librería PDF no cargó. Recarga la página.');
  const suma = P.rep.filas.reduce((s,f)=>s+f.h,0);   // validación: total = suma de filas visibles
  if (suma !== P.rep.total) throw new Error('La suma de las filas no coincide con el total.');
  const esp = P.especialistas.find(e=>e.clave===P.sel);
  const probe = new JsPDF(); if (typeof probe.autoTable !== 'function') throw new Error('El complemento de tablas PDF no cargó. Recarga la página.');
  const hoy = new Date(); const fg = String(hoy.getDate()).padStart(2,'0')+'/'+String(hoy.getMonth()+1).padStart(2,'0')+'/'+hoy.getFullYear();
  return { doc: panGenerarPDF(JsPDF, P.rep, esp.nombre, PAN_LOGO_B64, fg), archivo: panNombreArchivo(esp.nombre, P.rep.periodo), esp, rep: P.rep };
}
window.panExportarPDF = () => {
  try { const r = panPrepararPDF(); r.doc.save(r.archivo); }
  catch(e){ console.error(e); toast('No se pudo generar el PDF: '+e.message,'error'); }
};

/* ── Correo del especialista desde CLIENTES (misma normalización que la importación) ── */
function panCorreosDe(clave){
  const valido = x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x);
  const recoger = pred => { const m = new Map();
    doctors.forEach(d=>{ if (!pred(d)) return;
      String(d.correo||'').split(/[;,\s]+/).map(x=>x.trim()).filter(valido).forEach(x=>m.set(x.toLowerCase(), x)); });
    return [...m.values()]; };
  const porEspecialista = recoger(d => impNorm(d.especialista) === clave);
  return porEspecialista.length ? porEspecialista : recoger(d => impNorm(d.nombre) === clave);
}
function panPeriodoTexto(p){ return String(p||'').replace(/([A-Za-zÁÉÍÓÚáéíóú]+) (\d{4})/g, (m,a,b)=>a.toLowerCase()+' de '+b); }
function panEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

let _panEnviando = false;
/* Modos del envío por correo compartido (mismo modal, backend y historial).
   'panamericana' conserva exactamente sus textos; 'clinicavida' usa su propio PDF y textos. */
const REP_ENVIO_MODOS = {
  panamericana: {
    tipo:'panamericana', estado:()=>_pan, preparar:()=>panPrepararPDF(), totalLbl:'Total honorarios',
    archivo:(esp,R)=>panNombreArchivo(esp.nombre, R.periodo),
    asunto:(esp,R)=>'Reporte de Honorarios Panamericana — ' + R.periodo + ' — ' + esp.nombre,
    mensaje:(esp,R)=>'Hola, ' + esp.nombre + ':\n\nAdjuntamos su reporte de honorarios correspondiente a Panamericana para el periodo ' + panPeriodoTexto(R.periodo) + '.\n\n'
      + 'En el documento encontrará el detalle de los servicios relacionados y el valor de sus honorarios.\n\n'
      + 'Total honorarios: ' + panFmtCOP(R.total) + '\n\nCordialmente,\n\nUROEXPERTOS',
  },
  clinicavida: {
    tipo:'clinicavida', estado:()=>_cv, preparar:()=>cvPrepararPDF(), totalLbl:'Total a pagar',
    archivo:(esp,R)=>cvNombreArchivo(esp.nombre, R.periodo),
    asunto:(esp,R)=>'Informe de servicios y honorarios ' + CV_CLINICA + ' — ' + R.periodo + ' — ' + esp.nombre,
    mensaje:(esp,R)=>'Hola, ' + esp.nombre + ':\n\nAdjuntamos su informe de servicios y honorarios correspondiente a ' + CV_CLINICA + ' para el periodo ' + R.periodo + '.\n\n'
      + 'En el documento encontrará el detalle de los servicios relacionados y el valor a pagar.\n\n'
      + 'Total a pagar: ' + panFmtCOP(R.total) + '\n\nCordialmente,\n\nUROEXPERTOS',
  },
};
let _repEnvModo = 'panamericana';
function repModoEnvio(m){ return REP_ENVIO_MODOS[m] || REP_ENVIO_MODOS.panamericana; }
window.panCerrarEnvio = () => { if (_panEnviando) return; document.getElementById('panEnviarModal')?.classList.remove('open'); };
window.panIrAClientes = () => { panCerrarEnvio(); navigate('doctores'); };

window.panAbrirEnvio = async (modo) => {
  const MD = repModoEnvio(modo); _repEnvModo = MD.tipo;
  const P = MD.estado(); if (!P || !P.rep) return;
  const esp = P.especialistas.find(e=>e.clave===P.sel);
  const correos = panCorreosDe(P.sel);
  const body = document.getElementById('panEnviarBody'), foot = document.getElementById('panEnviarFoot');
  document.getElementById('panEnviarModal').classList.add('open');
  if (!correos.length){
    body.innerHTML = '<div class="imp-bloqueo"><b><i class="fa-solid fa-envelope-circle-check"></i> No se encontró un correo registrado para '+escHtml(esp.nombre)+' en Clientes.</b>'
      + '<div>Completa el correo en su ficha de Clientes y quedará disponible para los próximos envíos.</div></div>';
    foot.innerHTML = '<button class="btn btn-ghost" onclick="panCerrarEnvio()">Cancelar</button>'
      + '<button class="btn btn-primary" onclick="panIrAClientes()"><i class="fa-solid fa-address-book"></i> Ir a Clientes</button>';
    return;
  }
  const R = P.rep, archivo = MD.archivo(esp, R);
  const asunto = MD.asunto(esp, R);
  const mensaje = MD.mensaje(esp, R);
  const dest = correos.length===1
    ? '<b>'+escHtml(correos[0])+'</b><input type="hidden" id="panEnvCorreo" value="'+escHtml(correos[0])+'"/>'
    : '<select id="panEnvCorreo">'+correos.map(x=>'<option>'+escHtml(x)+'</option>').join('')+'</select><small>Hay '+correos.length+' correos registrados en Clientes para este especialista.</small>';
  body.innerHTML = '<div id="panEnvEstado"></div><div id="panEnvPrevio"></div>'
    + '<div class="pan-env-datos">'
    + '<div><span>Especialista</span><b>'+escHtml(esp.nombre)+'</b></div>'
    + '<div><span>Destinatario</span>'+dest+'</div>'
    + '<div><span>Periodo</span><b>'+escHtml(R.periodo)+'</b></div>'
    + '<div><span>Registros</span><b>'+R.filas.length+'</b></div>'
    + '<div><span>'+MD.totalLbl+'</span><b>'+panFmtCOP(R.total)+'</b></div>'
    + '<div><span>Archivo</span><b class="pan-env-archivo"><i class="fa-solid fa-file-pdf"></i> '+escHtml(archivo)+'</b></div>'
    + '</div>'
    + '<div class="fg"><label>Asunto</label><input type="text" id="panEnvAsunto" value="'+escHtml(asunto)+'"/></div>'
    + '<div class="fg"><label>Mensaje</label><textarea id="panEnvMensaje" rows="9">'+escHtml(mensaje)+'</textarea></div>';
  foot.innerHTML = '<button class="btn btn-ghost" onclick="panCerrarEnvio()">Cancelar</button>'
    + '<button class="btn btn-primary" id="panBtnEnviar" onclick="panEnviar()"><i class="fa-solid fa-paper-plane"></i> Enviar reporte</button>';
  // Aviso si este reporte ya se envió antes (historial)
  try {
    const snap = await getDocs(query(collection(db,'enviosReportes'), where('clave','==',P.sel)));
    const previos = snap.docs.map(d=>d.data()).filter(x=>x.tipo===MD.tipo && x.periodo===R.periodo && x.resultado==='enviado')
      .sort((a,b)=>String(b.fechaISO).localeCompare(String(a.fechaISO)));
    const el = document.getElementById('panEnvPrevio');
    if (previos.length && el){
      const u = previos[0], f = new Date(u.fechaISO);
      el.innerHTML = '<div class="imp-aviso">Este reporte ya se envió '+previos.length+' vez/veces. Último envío: '
        + f.toLocaleDateString('es-CO')+' '+f.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})+' a '+escHtml(u.correo)+'.</div>';
    }
  } catch(e){ console.warn('No se pudo consultar el historial de envíos:', e); }
};

window.panEnviar = async () => {
  if (_panEnviando) return;                                  // bloquea doble clic
  const btn = document.getElementById('panBtnEnviar');
  const estado = document.getElementById('panEnvEstado');
  const correo = (document.getElementById('panEnvCorreo')?.value||'').trim();
  const asunto = (document.getElementById('panEnvAsunto')?.value||'').trim();
  const mensaje = document.getElementById('panEnvMensaje')?.value||'';
  if (!correo || !asunto){ toast('Destinatario y asunto son obligatorios.','error'); return; }
  _panEnviando = true;
  btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';
  if (estado) estado.innerHTML = '';
  let r = null;
  const MD = repModoEnvio(_repEnvModo);
  try {
    r = MD.preparar();                                    // el MISMO PDF que "Exportar PDF"
    const attachmentBase64 = r.doc.output('datauristring').split(',')[1];
    const resp = await fetch('/api/send-email', {            // mismo backend y remitente del sistema
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ to:correo, subject:asunto, message:panEsc(mensaje), attachmentBase64, attachmentName:r.archivo }),
    });
    let data = {}; try { data = await resp.json(); } catch(_){}
    if (!resp.ok || !data.ok) throw new Error(data.error || ('El servidor respondió '+resp.status+(resp.status===413?' (archivo demasiado grande)':'')));
    panRegistrarEnvio(r, correo, 'enviado', data.messageId||'', '');
    document.getElementById('panEnviarBody').innerHTML = '<div class="pan-env-ok"><i class="fa-solid fa-circle-check"></i>'
      + '<h3>Reporte enviado correctamente</h3><p><b>'+escHtml(r.esp.nombre)+'</b><br>'+escHtml(correo)+'<br>'+escHtml(r.rep.periodo)+'</p></div>';
    document.getElementById('panEnviarFoot').innerHTML = '<button class="btn btn-primary" onclick="panCerrarEnvio()">Cerrar</button>';
    toast('Reporte enviado a '+correo+'.','success');
  } catch(e){
    console.error(e);
    if (r) panRegistrarEnvio(r, correo, 'error', '', e.message);
    if (estado) estado.innerHTML = '<div class="imp-bloqueo"><b><i class="fa-solid fa-circle-xmark"></i> No se pudo enviar el reporte.</b><div>'+escHtml(e.message)+'</div></div>';
    if (btn){ btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Reintentar'; }
  } finally { _panEnviando = false; }
};

/* Historial liviano de envíos (colección aparte; no toca facturación). Nunca bloquea el envío. */
function panRegistrarEnvio(r, correo, resultado, messageId, error){
  try {
    addDoc(collection(db,'enviosReportes'), {
      tipo:_repEnvModo, clave:repModoEnvio(_repEnvModo).estado()?.sel||'', especialista:r.esp.nombre, correo, periodo:r.rep.periodo,
      registros:r.rep.filas.length, total:r.rep.total, archivo:r.archivo, resultado, messageId, error,
      fechaISO:new Date().toISOString(), fecha:serverTimestamp(), enviadoPor:currentUser?.email||'',
    }).catch(e=>console.warn('No se pudo registrar el envío:', e));
  } catch(e){ console.warn('No se pudo registrar el envío:', e); }
}

/* ═══════════════════════════════════════════════════════════════════════
   REPORTES CLÍNICA VIDA — mismo flujo que Reportes Panamericana
   (Excel → especialista → PDF → correo). Reutiliza: impNorm, impParseNum, impParseFecha,
   impRedondearCuadrando, panClaveFactory, panCorreosDe, panFmtFecha y el modal/envío de Panamericana.
   Solo lectura: NO escribe nada en Firebase salvo el historial de envíos (enviosReportes).
═══════════════════════════════════════════════════════════════════════ */
/* CV-PURE-START */
const CV_CLINICA = 'Clínica Vida';
/* Encabezados obligatorios. El pago SIEMPRE sale de "Pago al especialista (uso interno)";
   no se aceptan nombres alternativos (solo se ignoran mayúsculas, tildes, saltos de línea y espacios). */
const CV_COLUMNAS = {
  fecha:'Fecha', tipo:'Tipo', esp:'Especialista', doc:'Identificación',
  pac:'Nombre completo del paciente', concepto:'Concepto', pago:'Pago al especialista (uso interno)',
};
const CV_MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function cvFmtCOP(n){ return panFmtCOP(n).replace(/^(-?)\$/, '$1$ '); }
function cvTexto(v){                                   // celda de texto; el 0 de las rondas sin paciente queda vacío
  if (v==null) return '';
  if (typeof v === 'number') return v===0 ? '' : String(Math.round(v)===v ? v : v);
  const s = impLimpiarNombre(v);
  return s==='0' ? '' : s;
}
function cvPeriodo(fechas){
  const fs = [...new Set(fechas.filter(Boolean))].sort();
  if (!fs.length) return 'Sin fecha';
  const p = iso => ({ y:iso.slice(0,4), m:CV_MESES[Number(iso.slice(5,7))-1], d:String(Number(iso.slice(8,10))) });
  const a = p(fs[0]), b = p(fs[fs.length-1]);
  if (fs.length===1) return a.d+' de '+a.m+' de '+a.y;
  if (a.y!==b.y) return a.d+' de '+a.m+' de '+a.y+' al '+b.d+' de '+b.m+' de '+b.y;
  if (a.m===b.m) return a.d+' al '+b.d+' de '+b.m+' de '+b.y;
  return a.d+' de '+a.m+' al '+b.d+' de '+b.m+' de '+b.y;
}
function cvNombreArchivo(especialista, periodo){
  const limpio = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  return 'UROEXPERTOS_ClinicaVida_' + limpio(especialista) + '_' + limpio(periodo) + '.pdf';
}
function cvLeerLibro(wb, XL){
  const claves = Object.keys(CV_COLUMNAS);
  const objetivo = {}; claves.forEach(k=>{ objetivo[k] = impNorm(CV_COLUMNAS[k]); });
  let mejor = null;
  for (const nombreHoja of wb.SheetNames){
    const ws = wb.Sheets[nombreHoja];
    const filas = XL.utils.sheet_to_json(ws, {header:1, raw:true, defval:''});
    for (let i=0; i<Math.min(filas.length, 25); i++){
      const norm = (filas[i]||[]).map(impNorm);
      const col = {}; claves.forEach(k=>{ col[k] = norm.indexOf(objetivo[k]); });
      const faltan = claves.filter(k=>col[k]<0);
      if (!faltan.length){
        if (norm.filter(x=>x===objetivo.pago).length > 1)
          throw new Error('Hoja "'+nombreHoja+'": la columna "'+CV_COLUMNAS.pago+'" aparece más de una vez.');
        const rg = ws['!ref'] ? XL.utils.decode_range(ws['!ref']) : {s:{r:0,c:0}};
        return { hoja:nombreHoja, filaEnc:i, col, filas:filas.slice(i+1), ws, r0:rg.s.r, c0:rg.s.c };
      }
      if (col.esp>=0 && (!mejor || faltan.length < mejor.faltan.length)) mejor = { hoja:nombreHoja, faltan };
    }
  }
  if (mejor) throw new Error('Hoja "'+mejor.hoja+'": no se encontraron las columnas ' + mejor.faltan.map(k=>'"'+CV_COLUMNAS[k]+'"').join(', ') + '.');
  throw new Error('No se encontró una hoja con los encabezados de Clínica Vida (Fecha, Tipo, Especialista, Identificación, Nombre completo del paciente, Concepto, Pago al especialista (uso interno)).');
}
function cvExtraer(lectura, XL){
  const col = lectura.col, originales = [], filasConError = [];
  let errores = 0;
  const cel = (f,k) => f[col[k]];
  lectura.filas.forEach((f,i)=>{
    const esp = impLimpiarNombre(cel(f,'esp'));
    if (!esp || /^total/.test(impNorm(esp))) return;
    const x = lectura.ws && lectura.ws[XL.utils.encode_cell({ r:lectura.r0+lectura.filaEnc+1+i, c:lectura.c0+col.pago })];
    if (x && x.t==='e'){ errores++; if (filasConError.length<5) filasConError.push('fila '+(lectura.r0+lectura.filaEnc+2+i)); return; }
    originales.push({
      idx:i, fecha:impParseFecha(cel(f,'fecha'), XL), tipo:impLimpiarNombre(cel(f,'tipo')) || 'Sin tipo', esp,
      doc:cvTexto(cel(f,'doc')), pac:cvTexto(cel(f,'pac')), concepto:impLimpiarNombre(cel(f,'concepto')),
      pago:impParseNum(cel(f,'pago')),
    });
  });
  const tipos = []; originales.forEach(o=>{ if (!tipos.includes(o.tipo)) tipos.push(o.tipo); });
  return { originales, errores, filasConError, tipos, periodo: cvPeriodo(originales.map(o=>o.fecha)) };
}
/* Reporte de UN especialista: solo filas con pago distinto de 0, agrupadas por Tipo (orden del archivo),
   fecha ascendente dentro de cada grupo. Pesos enteros. */
function cvConstruirReporte(ext, claveSel, claveDe){
  const todas = ext.originales.filter(o=>claveDe(o.esp)===claveSel).map(o=>({ ...o, h:0, _h:o.pago }));
  impRedondearCuadrando(todas, 'h');
  const exacto = todas.reduce((s,f)=>s+(Number(f._h)||0),0);
  todas.forEach(f=>{ delete f._h; });
  const filas = todas.filter(f=>f.h!==0);
  const omitidas = todas.length - filas.length;
  const grupos = ext.tipos.map(tipo=>{
    const fs = filas.filter(f=>f.tipo===tipo)
      .sort((a,b)=>(a.fecha||'9999').localeCompare(b.fecha||'9999') || (a.idx-b.idx));
    return { tipo, filas:fs, total:fs.reduce((s,f)=>s+f.h,0),
      pacientes:new Set(fs.map(f=>f.doc||impNorm(f.pac)).filter(Boolean)).size,
      dias:new Set(fs.map(f=>f.fecha).filter(Boolean)).size };
  }).filter(g=>g.filas.length);
  const ordenadas = grupos.flatMap(g=>g.filas);
  const total = ordenadas.reduce((s,f)=>s+f.h,0);
  if (total !== Math.round(exacto)) throw new Error('La suma de las filas no coincide con el total del Excel.');
  return { filas:ordenadas, grupos, total, omitidas, periodo:ext.periodo };
}
function cvDetalleGrupo(g){
  const pl = (n,s,p) => n+' '+(n===1?s:p);
  return [pl(g.dias,'día','días'), g.pacientes ? pl(g.pacientes,'paciente','pacientes') : ''].filter(Boolean).join(' · ');
}

/* PDF carta vertical (diseño del informe de servicios y honorarios). Devuelve el documento. */
function cvGenerarPDF(JsPDF, rep, especialista, logo, fechaGen){
  const doc = new JsPDF({ orientation:'portrait', unit:'mm', format:'letter', compress:true });
  const W = 215.9, H = 279.4, M = 14;
  const MORADO=[46,16,101], CABEZA=[45,18,94], LINEA=[83,56,196], GRIS=[100,100,112], TEXTO=[32,32,40], LAV=[237,234,248], RAYA=[224,222,234];
  const LOGO_R = 171/658, TOP = 31;
  const tabla = (opts) => doc.autoTable(Object.assign({
    margin:{ top:TOP+3, left:M, right:M, bottom:20 }, theme:'plain', showHead:'everyPage', showFoot:'lastPage', rowPageBreak:'avoid',
    styles:{ font:'helvetica', fontSize:7.6, textColor:TEXTO, cellPadding:{top:1.9,bottom:1.9,left:2,right:2}, overflow:'linebreak', valign:'middle', lineColor:RAYA, lineWidth:{bottom:0.2} },
    headStyles:{ fillColor:CABEZA, textColor:[255,255,255], fontStyle:'bold', fontSize:7.6, cellPadding:{top:2.4,bottom:2.4,left:2,right:2} },
    footStyles:{ fillColor:LAV, textColor:MORADO, fontStyle:'bold', fontSize:8, lineColor:LINEA, lineWidth:{top:0.45} },
  }, opts));
  const seccion = (titulo, y) => {
    if (y > H-45){ doc.addPage(); y = TOP+6; }
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5); doc.setTextColor(...MORADO);
    doc.text(titulo, M, y); return y + 2.5;
  };
  // ── Título (página 1) ──
  doc.setFont('helvetica','bold'); doc.setFontSize(21); doc.setTextColor(...MORADO);
  const nombreL = doc.splitTextToSize(especialista, W-2*M);
  doc.text(nombreL, M, 43);
  let y = 43 + (nombreL.length-1)*8;
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...GRIS);
  doc.text('Informe de servicios y honorarios · ' + CV_CLINICA + ' · ' + rep.periodo, M, y+6.5);
  doc.setDrawColor(...LINEA); doc.setLineWidth(0.4); doc.line(M, y+10.5, W-M, y+10.5);
  // ── 1. Resumen del periodo ──
  y = seccion('1. RESUMEN DEL PERIODO', y+19);
  tabla({
    startY:y,
    head:[['Concepto','Cantidad','Detalle','Valor a pagar']],
    body:rep.grupos.map(g=>[g.tipo, String(g.filas.length), cvDetalleGrupo(g), cvFmtCOP(g.total)]),
    foot:[[{ content:'TOTAL A PAGAR', colSpan:3 }, cvFmtCOP(rep.total)]],
    styles:{ font:'helvetica', fontSize:8.6, textColor:TEXTO, cellPadding:{top:2.5,bottom:2.5,left:2.4,right:2.4}, lineColor:RAYA, lineWidth:{bottom:0.2} },
    headStyles:{ fillColor:CABEZA, textColor:[255,255,255], fontStyle:'bold', fontSize:8.4, cellPadding:{top:2.6,bottom:2.6,left:2.4,right:2.4} },
    footStyles:{ fillColor:LAV, textColor:MORADO, fontStyle:'bold', fontSize:9, lineColor:LINEA, lineWidth:{top:0.45} },
    columnStyles:{ 0:{cellWidth:48}, 1:{cellWidth:20, halign:'right'}, 2:{cellWidth:'auto'}, 3:{cellWidth:36, halign:'right'} },
    didParseCell:d=>{ if (d.column.index===3 && d.section!=='body') d.cell.styles.halign='right';
                      if (d.column.index===1 && d.section==='head') d.cell.styles.halign='right'; },
  });
  // ── 2..n. Detalle por tipo ──
  rep.grupos.forEach((g,i)=>{
    y = seccion((i+2)+'. '+g.tipo.toUpperCase(), doc.lastAutoTable.finalY + 9);
    tabla({
      startY:y,
      head:[['Fecha','Tipo','Especialista','Identificación','Nombre completo del paciente','Concepto','Pago al especialista']],
      body:g.filas.map(f=>[panFmtFecha(f.fecha), f.tipo, f.esp, f.doc, f.pac, f.concepto, cvFmtCOP(f.h)]),
      foot:[[{ content:g.filas.length+' '+(g.filas.length===1?'registro':'registros')+(cvDetalleGrupo(g)?' · '+cvDetalleGrupo(g):''), colSpan:5, styles:{ fontStyle:'normal', textColor:TEXTO } },
             { content:'TOTAL', styles:{ halign:'right' } }, cvFmtCOP(g.total)]],
      headStyles:{ fillColor:CABEZA, textColor:[255,255,255], fontStyle:'bold', fontSize:7.2, cellPadding:{top:2.4,bottom:2.4,left:2,right:2} },
      columnStyles:{ 0:{cellWidth:18.5}, 1:{cellWidth:17}, 2:{cellWidth:28}, 3:{cellWidth:21.5}, 4:{cellWidth:36}, 5:{cellWidth:'auto'}, 6:{cellWidth:23, halign:'right'} },
      didParseCell:d=>{ if (d.column.index===6) d.cell.styles.halign='right'; },
    });
  });
  // ── Nota final ──
  y = doc.lastAutoTable.finalY + 7;
  if (y > H-30){ doc.addPage(); y = TOP+8; }
  doc.setFont('helvetica','normal'); doc.setFontSize(7.4); doc.setTextColor(...GRIS);
  doc.text(doc.splitTextToSize('Los valores corresponden a los servicios ya auditados por ' + CV_CLINICA + '. Solo se incluyen los registros con valor a pagar; los registros en $ 0 no se relacionan.', W-2*M), M, y);
  // ── Encabezado y pie en todas las páginas ──
  const total = doc.getNumberOfPages();
  for (let p=1; p<=total; p++){
    doc.setPage(p);
    const lw = 46; doc.addImage(logo, 'PNG', M, 11.5, lw, lw*LOGO_R, 'logo', 'SLOW');
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...TEXTO);
    doc.text('Informe de servicios y honorarios', W-M, 15.5, { align:'right' });
    doc.setFont('helvetica','normal'); doc.setFontSize(7.3); doc.setTextColor(...GRIS);
    doc.text(especialista + ' · ' + rep.periodo, W-M, 19.6, { align:'right' });
    doc.text(CV_CLINICA + '   ·   Emitido ' + fechaGen, W-M, 23.4, { align:'right' });
    doc.setDrawColor(...LINEA); doc.setLineWidth(0.5); doc.line(M, 26.8, W-M, 26.8);
    doc.setDrawColor(...RAYA); doc.setLineWidth(0.3); doc.line(M, H-15, W-M, H-15);
    doc.setFontSize(7); doc.setTextColor(...GRIS);
    doc.text('Uroexpertos S.A.S.   ·   Medellín, Colombia', M, H-10.5);
    doc.text('Informe de liquidación de honorarios', W/2, H-10.5, { align:'center' });
    doc.text('Página ' + p + ' de ' + total, W-M, H-10.5, { align:'right' });
  }
  return doc;
}
/* CV-PURE-END */

let _cv = null;   // { archivo, ext, especialistas:[{clave,nombre,n}], claveDe, sel, rep }

window.cvInit = () => { cvRender(); };
window.cvAbrirSelector = () => {
  if (!window.XLSX){ toast('La librería de Excel no cargó. Recarga la página.','error'); return; }
  const inp = document.getElementById('cvExcelInput'); inp.value=''; inp.click();
};
window.cvOnFile = async (ev) => {
  const file = ev.target.files && ev.target.files[0]; if (!file) return;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), {type:'array'});
    const ext = cvExtraer(cvLeerLibro(wb, XLSX), XLSX);
    if (!ext.originales.length && !ext.errores){ toast('El archivo no tiene filas con especialista.','error'); return; }
    const alias = await impCargarAlias();                  // solo lectura (mismo maestro de nombres que Panamericana)
    const { nombreDe, claveDe } = panClaveFactory(alias);
    const mapa = new Map();
    ext.originales.forEach(o=>{
      const k = claveDe(o.esp); const e = mapa.get(k) || { clave:k, nombre:nombreDe(o.esp), n:0 };
      if (Math.round(o.pago)!==0) e.n++;                   // solo registros con valor a pagar
      mapa.set(k, e);
    });
    const todos = [...mapa.values()];
    const especialistas = todos.filter(e=>e.n>0).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es',{sensitivity:'base'}));
    _cv = { archivo:file.name, ext, especialistas, sinValor:todos.length-especialistas.length,
            ceros:ext.originales.filter(o=>Math.round(o.pago)===0).length, claveDe, sel:null, rep:null };
    cvRender();
  } catch(e){ console.error(e); toast('No se pudo leer el Excel: '+e.message,'error'); _cv = null; cvRender(e.message); }
};
window.cvFiltrarLista = () => {
  const q = impNorm(document.getElementById('cvBuscar')?.value||'');
  document.querySelectorAll('#cvSelect option').forEach(op=>{ if (op.value) op.hidden = !!q && !impNorm(op.textContent).includes(q); });
};
window.cvSeleccionar = (clave) => {
  if (!_cv) return;
  _cv.sel = clave || null; _cv.rep = null;
  if (clave){
    try { _cv.rep = cvConstruirReporte(_cv.ext, clave, _cv.claveDe); }
    catch(e){ toast('Reporte no válido: '+e.message,'error'); }
  }
  cvRender();
};

function cvRender(errorLectura){
  const cont = document.getElementById('cvContenido'); if (!cont) return;
  if (!_cv){
    cont.innerHTML = (errorLectura ? '<div class="imp-bloqueo"><b><i class="fa-solid fa-circle-xmark"></i> No se pudo leer el Excel.</b><div>'+escHtml(errorLectura)+'</div></div>' : '')
      + '<div class="pan-vacio"><i class="fa-solid fa-file-excel"></i><p>Sube el Excel de Clínica Vida para generar los informes por especialista. El valor a pagar se toma de la columna <b>"Pago al especialista (uso interno)"</b>.</p>'
      + '<button class="btn btn-primary" onclick="cvAbrirSelector()"><i class="fa-solid fa-upload"></i> Subir Excel</button></div>';
    return;
  }
  const P = _cv;
  const esp = P.especialistas.find(e=>e.clave===P.sel);
  let h = '<div class="pan-barra">'
    + '<div class="pan-archivo"><i class="fa-solid fa-circle-check"></i> Excel cargado: <b>'+escHtml(P.archivo)+'</b> · '+P.ext.originales.length+' filas · '+P.especialistas.length+' especialistas'
    + (P.ceros ? ' · '+P.ceros+' registros en $0 omitidos' : '') + '</div>'
    + '<button class="btn btn-ghost btn-xs" onclick="cvAbrirSelector()"><i class="fa-solid fa-rotate"></i> Cambiar Excel</button></div>';
  if (P.ext.errores){
    h += '<div class="imp-bloqueo"><b><i class="fa-solid fa-circle-xmark"></i> El Excel tiene errores en el valor a pagar.</b><div>'+P.ext.errores
      + ' celdas de "Pago al especialista (uso interno)" tienen error de Excel (#VALUE!, #REF!…)'
      + (P.ext.filasConError.length ? ' — ' + escHtml(P.ext.filasConError.join(', ')) : '')
      + '. Corrige el archivo (o pégalo como valores) y vuelve a cargarlo.</div></div>';
    cont.innerHTML = h; return;
  }
  h += '<div class="pan-selector"><label>Especialista</label>'
    + '<input type="text" id="cvBuscar" placeholder="Escribe para buscar…" oninput="cvFiltrarLista()"/>'
    + '<select id="cvSelect" onchange="cvSeleccionar(this.value)"><option value="">Seleccione especialista</option>'
    + P.especialistas.map(e=>'<option value="'+escHtml(e.clave)+'" '+(e.clave===P.sel?'selected':'')+'>'+escHtml(e.nombre)+'  ('+e.n+')</option>').join('')
    + '</select></div>';
  if (P.rep && esp){
    const R = P.rep;
    h += '<div class="pan-cards">'
      + '<div><span>Especialista</span><b>'+escHtml(esp.nombre)+'</b></div>'
      + (() => { const cs = panCorreosDe(P.sel);
          return cs.length
            ? '<div><span>Correo</span><b title="'+escHtml(cs.join(', '))+'">'+escHtml(cs[0])+(cs.length>1?' (+'+(cs.length-1)+')':'')+'</b></div>'
            : '<div class="pan-card-sincorreo"><span>Correo</span><b>Sin correo en Clientes</b><a onclick="navigate(\'doctores\')">Ir a Clientes</a></div>'; })()
      + '<div><span>Periodo</span><b>'+escHtml(R.periodo)+'</b></div>'
      + '<div><span>Registros</span><b>'+R.filas.length+'</b></div>'
      + '<div class="pan-card-total"><span>Total a pagar</span><b>'+panFmtCOP(R.total)+'</b></div></div>'
      + '<div class="pan-acciones"><button class="btn btn-ghost" onclick="cvExportarPDF()"><i class="fa-solid fa-file-pdf"></i> Exportar PDF</button>'
      + '<button class="btn btn-primary" onclick="panAbrirEnvio(\'clinicavida\')"><i class="fa-solid fa-paper-plane"></i> Enviar al especialista</button></div>'
      + '<div class="pan-tabla-wrap"><table class="pan-tabla"><thead><tr><th>Fecha</th><th>Tipo</th><th>Especialista</th><th>Identificación</th><th>Nombre completo del paciente</th><th>Concepto</th><th class="num">Pago al especialista</th></tr></thead><tbody>'
      + R.filas.map(f=>'<tr><td>'+panFmtFecha(f.fecha)+'</td><td>'+escHtml(f.tipo)+'</td><td>'+escHtml(f.esp)+'</td><td>'+escHtml(f.doc)+'</td><td>'+escHtml(f.pac)+'</td><td>'+escHtml(f.concepto)+'</td><td class="num">'+panFmtCOP(f.h)+'</td></tr>').join('')
      + '</tbody><tfoot><tr><td colspan="6">TOTAL A PAGAR</td><td class="num">'+panFmtCOP(R.total)+'</td></tr></tfoot></table></div>';
  }
  cont.innerHTML = h;
}

/* ÚNICA fuente del PDF de Clínica Vida para "Exportar PDF" y "Enviar al especialista" */
function cvPrepararPDF(){
  const P = _cv; if (!P || !P.rep) throw new Error('Selecciona un especialista.');
  const JsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!JsPDF) throw new Error('La librería PDF no cargó. Recarga la página.');
  const suma = P.rep.filas.reduce((s,f)=>s+f.h,0);
  if (suma !== P.rep.total) throw new Error('La suma de las filas no coincide con el total.');
  if (P.rep.filas.some(f=>f.h===0)) throw new Error('El reporte contiene registros en $0.');
  const esp = P.especialistas.find(e=>e.clave===P.sel);
  const probe = new JsPDF(); if (typeof probe.autoTable !== 'function') throw new Error('El complemento de tablas PDF no cargó. Recarga la página.');
  const hoy = new Date(); const fg = String(hoy.getDate()).padStart(2,'0')+'/'+String(hoy.getMonth()+1).padStart(2,'0')+'/'+hoy.getFullYear();
  return { doc: cvGenerarPDF(JsPDF, P.rep, esp.nombre, PAN_LOGO_B64, fg), archivo: cvNombreArchivo(esp.nombre, P.rep.periodo), esp, rep: P.rep };
}
window.cvExportarPDF = () => {
  try { const r = cvPrepararPDF(); r.doc.save(r.archivo); }
  catch(e){ console.error(e); toast('No se pudo generar el PDF: '+e.message,'error'); }
};

/* ══ TABLAS PERSONALIZADAS ══ */
window.openTablaModal = (id=null) => {
  const t = id ? tablasEgreso.find(x=>x.id===id) : null;
  document.getElementById('tablaModalTitle').textContent = id ? 'Editar Tabla' : 'Nueva Tabla';
  document.getElementById('tablaEditId').value  = id||'';
  document.getElementById('tablaName').value    = t?.nombre||'';
  // Logos
  _setTablaLogoPreview('izq', t?.logoIzq||'');
  _setTablaLogoPreview('der', t?.logoDer||'');
  document.getElementById('tablaLogoIzq').value = t?.logoIzq||'';
  document.getElementById('tablaLogoDer').value = t?.logoDer||'';
  document.getElementById('tablaModal').classList.add('open');
};
window.closeTablaModal = () => {
  document.getElementById('tablaModal').classList.remove('open');
  document.getElementById('tablaEditId').value = '';
};
window.editTabla = (id) => openTablaModal(id);

function _setTablaLogoPreview(side, b64) {
  const prev = document.getElementById(`tablaLogo${side==='izq'?'Izq':'Der'}Prev`);
  if (!prev) return;
  if (b64) {
    prev.innerHTML = `<img src="${b64}" style="max-height:46px;max-width:80px;object-fit:contain"/>`;
  } else {
    prev.innerHTML = '<i class="fa-solid fa-image" style="color:var(--gray-2);font-size:18px"></i>';
  }
}

window.handleTablaLogo = (e, side) => {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    const b64 = ev.target.result;
    document.getElementById(side==='izq'?'tablaLogoIzq':'tablaLogoDer').value = b64;
    _setTablaLogoPreview(side, b64);
  };
  r.readAsDataURL(file);
};

window.clearTablaLogo = (side) => {
  document.getElementById(side==='izq'?'tablaLogoIzq':'tablaLogoDer').value = '';
  _setTablaLogoPreview(side, '');
  document.getElementById(side==='izq'?'tablaLogoIzqFile':'tablaLogoDerFile').value = '';
};

window.saveTabla = async () => {
  const nombre  = document.getElementById('tablaName').value.trim();
  if (!nombre) { toast('Ponle un nombre a la tabla.','error'); return; }
  const editId  = document.getElementById('tablaEditId').value;
  const logoIzq = document.getElementById('tablaLogoIzq').value||'';
  const logoDer = document.getElementById('tablaLogoDer').value||'';
  try {
    if (editId) {
      await updateDoc(doc(db,'tablasEgreso',editId),{nombre,logoIzq,logoDer,updatedAt:serverTimestamp()});
      toast('Tabla actualizada.','success');
    } else {
      await addDoc(collection(db,'tablasEgreso'),{nombre,logoIzq,logoDer,filas:[],createdAt:serverTimestamp()});
      toast('Tabla creada.','success');
    }
    closeTablaModal();
  } catch(e){ toast('Error: '+e.message,'error'); }
};

/* ── Checklist headers ── */
window.toggleTablaCheck = (tablaId, field, val) => {
  const idx = tablasEgreso.findIndex(t=>t.id===tablaId);
  if(idx===-1) return;
  if(field==='contabilidad') tablasEgreso[idx]._chkContabilidad = val;
  if(field==='facturacion')  tablasEgreso[idx]._chkFacturacion  = val;
  // persist to Firestore
  const upd = {};
  upd[field==='contabilidad'?'chkContabilidad':'chkFacturacion'] = val;
  updateDoc(doc(db,'tablasEgreso',tablaId), upd).catch(()=>{});
};

/* ── Identificador: cambiar filtro de factura madre ── */
window.onIdentChange = async (tablaId, selectEl) => {
  const idx = tablasEgreso.findIndex(t=>t.id===tablaId);
  if (idx===-1) return;
  const selectedIds = [...selectEl.selectedOptions].map(o=>o.value).filter(Boolean);
  tablasEgreso[idx]._selectedIdents = selectedIds;
  tablasEgreso[idx]._selectedIdent  = selectedIds[0]||'';
  renderCustomTables();

  if (!selectedIds.length) return;
  const tabla = tablasEgreso[idx];
  const filasActuales = tabla.filas||[];

  // ── Clave de RELACIÓN interna: madre + índice de la hija (no depende del nombre/factura) ──
  // Las filas ya vinculadas se identifican por su hijaKey; si una fila vieja no la tiene,
  // se reconstruye por (identId + factura) para mantener compatibilidad.
  const hijaKeyDe = (egresoId, i, h) => `${egresoId}::${i}`;
  const yaVinculadas = new Set();
  filasActuales.forEach(f => {
    if (f.hijaKey) yaVinculadas.add(f.hijaKey);
  });

  // ── Traer los datos FRESCOS: releer del array de egresos vigente ──
  const nuevas = [];
  let totalHijasAsociadas = 0;
  selectedIds.forEach(egresoId => {
    const egreso = egresos.find(e=>e.id===egresoId);
    if (!egreso) return;
    const hijas = egreso.hijas||[];
    totalHijasAsociadas += hijas.length;

    hijas.forEach((h, i) => {
      const hijaKey = hijaKeyDe(egresoId, i, h);
      // No duplicar: si esta relación ya está vinculada, saltar
      if (yaVinculadas.has(hijaKey)) return;
      // Compatibilidad: si una fila vieja (sin hijaKey) ya representa esta hija por factura, no duplicar
      const factKey = (h.factura||'').trim().toLowerCase();
      if (factKey) {
        const yaPorFactura = filasActuales.some(f =>
          !f.hijaKey && f.identId===egresoId && (f.factura||'').trim().toLowerCase()===factKey);
        if (yaPorFactura) return;
      }
      yaVinculadas.add(hijaKey);

      const valorFactura = Number(h.valorEspecialista)||0;
      nuevas.push({
        rowId:        genRowId(),
        hijaKey,                       // ← relación interna estable
        identId:      egresoId,
        identIds:     [egresoId],
        factura:      h.factura||'',
        mes:          h.honorarioMes||egreso.honorarioMes||'',
        nombre:       h.nombre||egreso.nombre||'',
        tipoPersona:  h.tipoPersona||'',
        valorFactura,
        abono:        0,
        glosa:        0,
        reteFuente:   0,
        afc:          0,
        residentes:   0,
        tiquetes:     0,
        hotel:        0,
        transporte:   0,
        valorPagar:   valorFactura,
        pagos:        [],
      });
    });
  });

  if (!nuevas.length) {
    toast(`Sin hijas nuevas por traer. Ya están las ${totalHijasAsociadas} asociadas.`, 'info');
    return;
  }

  try {
    const filasActualizadas = [...filasActuales, ...nuevas];
    await updateDoc(doc(db,'tablasEgreso',tablaId), {
      filas: filasActualizadas,
      updatedAt: serverTimestamp()
    });
    toast(`${nuevas.length} fila${nuevas.length>1?'s':''} traída${nuevas.length>1?'s':''} (de ${totalHijasAsociadas} hija${totalHijasAsociadas>1?'s':''} asociada${totalHijasAsociadas>1?'s':''}).`, 'success');
  } catch(e) {
    toast('Error al autocargar filas: '+e.message, 'error');
  }
};

window.deleteTabla = async (id) => {
  if (!confirm('¿Eliminar esta tabla y todas sus filas?')) return;
  try { await deleteDoc(doc(db,'tablasEgreso',id)); toast('Tabla eliminada.'); }
  catch(e) { toast('Error: '+e.message,'error'); }
};

/* ══ BUSCADOR DE TABLAS ══
   Filtrado en vivo sobre el DOM: instantáneo, sin re-render,
   así el campo no pierde el foco mientras se escribe. */
const busquedaTablas = {};   // { tablaId: texto }

/* Normaliza para comparar: minúsculas, sin tildes, espacios colapsados */
function normBusq(s){
  return String(s||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

window.filtrarTablaBusqueda = (tablaId, texto) => {
  busquedaTablas[tablaId] = texto || '';
  const q    = normBusq(texto);
  const card = document.getElementById('tcard-'+tablaId);
  if (!card) return;

  const filas = card.querySelectorAll('.egr-custom-table tbody tr[data-search]');
  let visibles = 0, total = 0;

  // ¿Cuántos grupos hay y cuántos están abiertos? Si TODOS abiertos → buscar en todo.
  const grupos = [...card.querySelectorAll('.tbl-group-row')];
  const totalGrupos = grupos.length;
  const gruposAbiertos = grupos.filter(gr => {
    const clave = gr.getAttribute('data-group');
    return !grupoColapsado[`${tablaId}|${clave}`];
  }).length;
  // Si hay grupos y no todos están abiertos, la búsqueda se limita a los abiertos
  const limitarAAbiertos = totalGrupos > 0 && gruposAbiertos < totalGrupos;

  filas.forEach(tr => {
    const clave = tr.getAttribute('data-group-row');
    const grupoCerrado = clave && grupoColapsado[`${tablaId}|${clave}`];
    // Con búsqueda: si limitamos a abiertos, las filas de grupos cerrados NO participan
    const participa = !(limitarAAbiertos && grupoCerrado);
    const match = participa && (!q || (tr.getAttribute('data-search')||'').includes(q));
    // Sin búsqueda: respetar el colapso normal
    const mostrar = q ? match : !grupoCerrado;
    tr.style.display = mostrar ? '' : 'none';
    if (q && match){ visibles++; total += Number(tr.getAttribute('data-pagar'))||0; }
    if (!q){ total += (!grupoCerrado ? (Number(tr.getAttribute('data-pagar'))||0) : 0); }
  });

  // Encabezados de grupo
  card.querySelectorAll('.tbl-group-row').forEach(gr => {
    const clave = gr.getAttribute('data-group');
    const cerrado = grupoColapsado[`${tablaId}|${clave}`];
    if (q){
      if (limitarAAbiertos && cerrado){
        // Grupo cerrado no participa en la búsqueda: mostrar encabezado atenuado
        gr.style.display = '';
        gr.classList.add('grupo-fuera-busqueda');
      } else {
        gr.classList.remove('grupo-fuera-busqueda');
        const hayVisibles = [...card.querySelectorAll(`tr[data-group-row="${cssEscapa(clave)}"]`)]
          .some(tr => tr.style.display !== 'none');
        gr.style.display = hayVisibles ? '' : 'none';
      }
    } else {
      gr.style.display = '';
      gr.classList.remove('grupo-fuera-busqueda');
    }
  });

  // Mensaje "sin resultados"
  const noRes = card.querySelector('.tbl-no-results');
  if (noRes) noRes.style.display = (q && visibles === 0 && filas.length) ? '' : 'none';

  // Total recalculado sobre lo visible
  const totEl = card.querySelector('.tbl-total-val');
  if (totEl) totEl.textContent = fmtCOP(total);

  // Contador "N de M"
  const cnt = card.querySelector('.ech-search-count');
  if (cnt) cnt.textContent = q ? `${visibles} de ${filas.length}` : '';

  // Botón limpiar visible solo con texto
  const x = card.querySelector('.ech-search-x');
  if (x) x.style.display = q ? '' : 'none';
};

window.limpiarBusquedaTabla = (tablaId) => {
  const inp = document.getElementById('busq-'+tablaId);
  if (inp) inp.value = '';
  filtrarTablaBusqueda(tablaId, '');
  if (inp) inp.focus();
};

/* ══ AGRUPAMIENTO POR MES ══ */
const grupoColapsado = {};   // { "tablaId|clave": true }  → colapsado

/* Persistencia del estado de carpetas (grupos por mes) en Firestore.
   Se guarda con debounce para no escribir en cada clic. */
let _grupoPersistTimer = null;
function persistirGrupoColapsado(){
  clearTimeout(_grupoPersistTimer);
  _grupoPersistTimer = setTimeout(() => {
    const soloCerrados = {};
    Object.keys(grupoColapsado).forEach(k => { if (grupoColapsado[k]) soloCerrados[k] = true; });
    setDoc(doc(db,'uiPrefs','egresosGrupos'), { colapsados: soloCerrados, updatedAt: serverTimestamp() })
      .catch(e => console.warn('No se pudo guardar estado de carpetas:', e));
  }, 500);
}

/* Carga el estado guardado al iniciar la sesión de UROEXPERTOS */
async function cargarGrupoColapsado(){
  try {
    const snap = await getDoc(doc(db,'uiPrefs','egresosGrupos'));
    if (snap.exists()){
      const data = snap.data()?.colapsados || {};
      Object.keys(grupoColapsado).forEach(k => delete grupoColapsado[k]);
      Object.keys(data).forEach(k => { grupoColapsado[k] = true; });
    }
  } catch(e){ console.warn('No se pudo cargar estado de carpetas:', e); }
}
const MESES_NOMBRE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/* Agrupa filas por mes (campo f.mes tipo "2026-03"). Orden descendente (más reciente primero). */
function agruparPorMes(filas){
  const map = new Map();
  filas.forEach(f => {
    const mes = (f.mes||'').trim();
    const clave = mes || 'sin-mes';
    if (!map.has(clave)) map.set(clave, []);
    map.get(clave).push(f);
  });
  const claves = [...map.keys()].sort((a,b)=>{
    if (a === 'sin-mes') return 1;
    if (b === 'sin-mes') return -1;
    return b.localeCompare(a);   // más reciente primero
  });
  return claves.map(clave => ({
    clave,
    etiqueta: etiquetaMes(clave),
    filas: map.get(clave),
  }));
}

/* "2026-03" → "Marzo 2026"; "sin-mes" → "Sin mes asignado" */
function etiquetaMes(clave){
  if (clave === 'sin-mes') return 'Sin mes asignado';
  const m = clave.match(/^(\d{4})-(\d{1,2})/);
  if (m){
    const idx = parseInt(m[2],10) - 1;
    if (idx >= 0 && idx < 12) return `${MESES_NOMBRE[idx]} ${m[1]}`;
  }
  return clave;
}

/* Expandir / contraer un grupo de mes */
window.toggleGrupoMes = (tablaId, clave, filaCab) => {
  const key = `${tablaId}|${clave}`;
  const colapsar = !grupoColapsado[key];
  grupoColapsado[key] = colapsar;
  persistirGrupoColapsado();

  const card = document.getElementById('tcard-'+tablaId) || filaCab.closest('.egr-custom-card, .egr-madre-wrap');
  if (!card) return;
  filaCab.classList.toggle('colapsado', colapsar);
  card.querySelectorAll(`tr[data-group-row="${cssEscapa(clave)}"]`).forEach(tr=>{
    tr.style.display = colapsar ? 'none' : '';
  });
};

/* Escapa comillas para selectores de atributo */
function cssEscapa(s){ return String(s||'').replace(/"/g,'\\"'); }

function renderCustomTables() {
  const box = document.getElementById('egresoCustomTables');
  if (!box) return;
  if (!tablasEgreso.length) { box.innerHTML=''; return; }

  box.innerHTML = tablasEgreso.map(t=>{
    // Filter by identificador(s) if selected
    const allFilas = t.filas||[];
    const selIds   = t._selectedIdents?.length ? t._selectedIdents
                   : (t._selectedIdent ? [t._selectedIdent] : []);
    const filas = selIds.length
      ? allFilas.filter(f=> selIds.includes(f.identId))
      : allFilas;
    const totalPagar = filas.reduce((s,f)=>s+(Number(f.valorPagar)||0),0);

    const filaHtml = (f)=>{
      const realIdx = allFilas.indexOf(f); // real index regardless of filter
      // Texto indexado para el buscador (factura, nombre, tipo de persona, mes)
      const blob = normBusq([f.factura, f.nombre, f.tipoPersona, f.mes].join(' '));
      return `
      <tr data-search="${escHtml(blob)}" data-pagar="${Number(f.valorPagar)||0}">
        <td>${escHtml(f.factura||'—')}</td>
        <td>${f.mes||'—'}</td>
        <td>${escHtml(f.nombre||'—')}</td>
        <td>${escHtml(f.tipoPersona||'—')}</td>
        <td class="td-money">${fmtCOP(f.valorFactura)}</td>
        <td class="td-money">${fmtCOP(f.abono)}</td>
        <td class="td-money">${fmtCOP(f.glosa)}</td>
        <td class="td-money">${fmtCOP(f.reteFuente)}</td>
        <td class="td-money">${fmtCOP(f.afc)}</td>
        <td class="td-money">${fmtCOP(f.residentes)}</td>
        <td class="td-money">${fmtCOP(f.tiquetes)}</td>
        <td class="td-money">${fmtCOP(f.hotel)}</td>
        <td class="td-money">${fmtCOP(f.transporte)}</td>
        <td class="col-pagar-val td-money ${Number(f.valorPagar)<0?'neg':''}">${fmtCOP(f.valorPagar)}</td>
        <td>
          <div class="tbl-actions">
            <button class="act-btn edit" onclick="openTablaRowModal('${t.id}',${realIdx})"><i class="fa-solid fa-pen"></i></button>
            <button class="act-btn" style="${f.correoEnviado?'background:#e8f5e9;color:#2e7d32':'background:var(--blue-pale);color:var(--blue)'}" title="${f.correoEnviado?'Correo enviado — reenviar':'Enviar por correo'}" onclick="openEnviarModal('${t.id}',${realIdx})"><i class="fa-solid ${f.correoEnviado?'fa-circle-check':'fa-paper-plane'}"></i></button>
            <button class="act-btn del" onclick="deleteTablaRow('${t.id}',${realIdx})"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
    };

    // ── Agrupar filas por mes (encabezados colapsables) ──
    const grupos = agruparPorMes(filas);
    const rows = grupos.map(g => {
      const colapsado = grupoColapsado[`${t.id}|${g.clave}`] ? 'colapsado' : '';
      const totalGrupo = g.filas.reduce((s,f)=>s+(Number(f.valorPagar)||0),0);
      const cab = `<tr class="tbl-group-row ${colapsado}" data-group="${escHtml(g.clave)}" onclick="toggleGrupoMes('${t.id}','${escHtml(g.clave)}',this)">
        <td colspan="14" class="tbl-group-cell">
          <i class="fa-solid fa-chevron-down tbl-group-chevron"></i>
          <i class="fa-solid fa-folder-open tbl-group-folder"></i>
          <span class="tbl-group-label">${escHtml(g.etiqueta)}</span>
          <span class="tbl-group-count">${g.filas.length} factura${g.filas.length!==1?'s':''}</span>
        </td>
        <td class="td-money tbl-group-total">${fmtCOP(totalGrupo)}</td>
      </tr>`;
      const cuerpo = g.filas.map(f => filaHtml(f).replace('<tr ', `<tr data-group-row="${escHtml(g.clave)}" `)).join('');
      return cab + cuerpo;
    }).join('');

    return `<div class="egr-custom-card" id="tcard-${t.id}">
      <div class="egr-custom-head">
        ${t.logoIzq?`<img src="${t.logoIzq}" class="egr-custom-logo" alt="logo"/>`:''}
        <div class="ech-nombre"><i class="fa-solid fa-table-columns" style="opacity:.6;margin-right:5px"></i>${escHtml(t.nombre)}</div>
        ${t.logoDer?`<img src="${t.logoDer}" class="egr-custom-logo" alt="logo"/>`:''}
        <div class="ech-divider"></div>
        <!-- Checklists -->
        <label class="ech-check" title="Revisado por Contabilidad">
          <input type="checkbox" ${t._chkContabilidad?'checked':''} onchange="toggleTablaCheck('${t.id}','contabilidad',event.target.checked)" style="accent-color:#4ade80"/>
          <span>Contabilidad</span>
        </label>
        <label class="ech-check" title="Facturación">
          <input type="checkbox" ${t._chkFacturacion?'checked':''} onchange="toggleTablaCheck('${t.id}','facturacion',event.target.checked)" style="accent-color:#60a5fa"/>
          <span>Facturación</span>
        </label>
        <div class="ech-divider"></div>
        <!-- Identificador -->
        <div class="ech-ident">
          <i class="fa-solid fa-tag" style="color:rgba(255,255,255,.5);font-size:10px"></i>
          <select class="egr-ident-sel" id="ident-${t.id}" multiple size="1"
            onchange="onIdentChange('${t.id}',this)"
            style="min-width:140px;cursor:pointer"
            title="Ctrl+clic para selección múltiple">
            ${egresos.map(e=>{
              const selIds = t._selectedIdents||[];
              const isSel  = selIds.includes(e.id);
              return `<option value="${e.id}" ${isSel?'selected':''}>${escHtml(e.factura||e.nombre||e.id)}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="ech-divider"></div>
        <!-- Buscador -->
        <div class="ech-search">
          <i class="fa-solid fa-magnifying-glass ech-search-ico"></i>
          <input type="text" class="ech-search-input" id="busq-${t.id}"
            placeholder="Buscar por factura"
            value="${escHtml(busquedaTablas[t.id]||'')}"
            oninput="filtrarTablaBusqueda('${t.id}', this.value)"/>
          <button class="ech-search-x" title="Limpiar" onclick="limpiarBusquedaTabla('${t.id}')">&times;</button>
          <span class="ech-search-count"></span>
        </div>
        <div class="ech-divider"></div>
        <!-- Acciones -->
        <div class="ech-actions">
          <button class="ech-btn" onclick="openTablaRowModal('${t.id}',null)" title="Nueva fila"><i class="fa-solid fa-plus"></i> Nueva fila</button>
          <button class="ech-btn ech-btn-green" onclick="exportarTablaExcel('${t.id}')" title="Exportar Excel"><i class="fa-solid fa-file-excel"></i> Excel</button>
          <button class="ech-btn-icon" onclick="editTabla('${t.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="ech-btn-icon ech-btn-red" onclick="deleteTabla('${t.id}')" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div class="egr-custom-table-wrap">
        <table class="egr-custom-table">
          <colgroup>
            <col class="cc-factura"/><col class="cc-mes"/><col class="cc-nombre"/><col class="cc-tipopersona"/>
            <col class="cc-money"/><col class="cc-money"/><col class="cc-money"/><col class="cc-money"/>
            <col class="cc-money"/><col class="cc-money"/><col class="cc-money"/><col class="cc-money"/>
            <col class="cc-money"/><col class="cc-pagar"/><col class="cc-acciones"/>
          </colgroup>
          <thead><tr>
            <th>FACTURA</th><th>MES</th><th>NOMBRE ESPECIALISTA</th><th>TIPO DE PERSONA</th>
            <th class="th-money">VALOR FACTURA</th><th class="th-money">ABONO</th><th class="th-money">GLOSA</th>
            <th class="th-money">RETE FUENTE</th><th class="th-money">AFC</th><th class="th-money">RESIDENTES</th>
            <th class="th-money">TIQUETES</th><th class="th-money">HOTEL</th><th class="th-money">TRANSPORTE</th>
            <th class="col-pagar th-money">VALOR A PAGAR</th><th></th>
          </tr></thead>
          <tbody>${rows||`<tr><td colspan="15" style="text-align:center;padding:20px;color:var(--gray-3)">Sin filas. Añade la primera.</td></tr>`}
            <tr class="tbl-no-results" style="display:none"><td colspan="15" style="text-align:center;padding:20px;color:var(--gray-3)"><i class="fa-solid fa-magnifying-glass" style="opacity:.5;margin-right:6px"></i>Sin resultados para la búsqueda.</td></tr>
          </tbody>
          ${filas.length?`<tfoot><tr>
            <td colspan="13" style="text-align:right;font-weight:800;padding:9px 12px;color:var(--gray-4);font-size:12px">TOTAL:</td>
            <td class="tbl-total-val" style="font-weight:800;color:var(--navy);background:#eef4ff;padding:9px 12px">${fmtCOP(totalPagar)}</td>
            <td></td>
          </tr></tfoot>`:''}
        </table>
      </div>
    </div>`;
  }).join('');

  // Aplicar el estado guardado de carpetas colapsadas (ocultar sus filas)
  // y re-aplicar cualquier búsqueda activa tras el re-render.
  tablasEgreso.forEach(t => {
    const card = document.getElementById('tcard-'+t.id);
    if (!card) return;
    card.querySelectorAll('.tbl-group-row').forEach(gr => {
      const clave = gr.getAttribute('data-group');
      if (grupoColapsado[`${t.id}|${clave}`]) {
        gr.classList.add('colapsado');
        card.querySelectorAll(`tr[data-group-row="${cssEscapa(clave)}"]`)
          .forEach(tr => tr.style.display = 'none');
      }
    });
    if (busquedaTablas[t.id]) filtrarTablaBusqueda(t.id, busquedaTablas[t.id]);
  });
}
window.openTablaRowModal = (tablaId, idx) => {
  editTablaRowTablaId = tablaId;
  editTablaRowIdx     = idx;
  const tabla = tablasEgreso.find(t=>t.id===tablaId);
  // Validate: need identificador to add new row
  if(idx===null && !(tabla?._selectedIdents?.length || tabla?._selectedIdent)) {
    toast('Debes seleccionar un Identificador antes de agregar filas.','error');
    return;
  }
  const f = (idx !== null && idx !== undefined) ? tabla?.filas?.[idx] : null;
  document.getElementById('tablaRowTitle').textContent = f?'Editar Fila':'Nueva Fila';
  document.getElementById('tablaRowTablaId').value = tablaId;
  document.getElementById('tablaRowId').value = idx??'';
  document.getElementById('trFactura').value     = f?.factura||'';
  document.getElementById('trMes').value         = f?.mes||'';

  // Poblar select de especialistas desde CLIENTES y restaurar selección
  const selNombre = document.getElementById('trNombre');
  const especialistas = [...new Set(doctors.filter(d=>d.especialista).map(d=>d.especialista))].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
  const savedNombre = f?.nombre||'';
  // Build options with 'selected' attribute directly on the matching option
  selNombre.innerHTML = '<option value="">— Seleccionar especialista —</option>'
    + especialistas.map(e=>`<option value="${escHtml(e)}" ${e===savedNombre?'selected':''}>${escHtml(e)}</option>`).join('')
    + (savedNombre && !especialistas.includes(savedNombre)
        ? `<option value="${escHtml(savedNombre)}" selected>${escHtml(savedNombre)}</option>` : '');
  // Force value after DOM update
  selNombre.value = savedNombre;

  const selTipoP = document.getElementById('trTipoPersona');
  if (selTipoP) selTipoP.value = f?.tipoPersona||'';

  document.getElementById('trValorFactura').value= f?.valorFactura||'';
  document.getElementById('trAbono').value       = f?.abono||'';
  document.getElementById('trGlosa').value       = f?.glosa||'';
  document.getElementById('trReteFuente').value  = f?.reteFuente||'';
  document.getElementById('trAfc').value         = f?.afc||'';
  document.getElementById('trResidentes').value  = f?.residentes||'';
  document.getElementById('trTiquetes').value    = f?.tiquetes||'';
  document.getElementById('trHotel').value       = f?.hotel||'';
  document.getElementById('trTransporte').value  = f?.transporte||'';
  // Cargar historial de pagos de la fila (o vacío para fila nueva)
  _pagosTmp = f?.pagos ? JSON.parse(JSON.stringify(f.pagos)) : [];
  renderPagos();
  calcValorPagar();
  document.getElementById('egresoAutoInfo').style.display='none';
  document.getElementById('tablaRowModal').classList.add('open');
};

window.closeTablaRowModal = () => {
  document.getElementById('tablaRowModal').classList.remove('open');
  editTablaRowTablaId = null; editTablaRowIdx = null;
};

/* Autocompletar desde EGRESO cuando se escribe la factura */
window.autocompletarDesdeEgreso = () => {
  const factura = document.getElementById('trFactura').value.trim().toLowerCase();
  if (!factura) return;

  const infoEl = document.getElementById('egresoAutoInfo');
  const msgEl  = document.getElementById('egresoAutoMsg');

  // 1. Buscar PRIMERO en facturas hijas — son los registros reales
  let foundHija = null;
  for (const e of egresos) {
    const hija = (e.hijas||[]).find(h => (h.factura||'').toLowerCase() === factura);
    if (hija) { foundHija = hija; break; }
  }

  if (foundHija) {
    document.getElementById('trMes').value          = foundHija.honorarioMes || '';
    // Set select value for nombre
    const sel = document.getElementById('trNombre');
    if (sel) sel.value = foundHija.nombre || '';
    document.getElementById('trValorFactura').value = foundHija.valorEspecialista || 0;
    calcValorPagar();
    infoEl.style.display = 'flex';
    msgEl.textContent = `✓ Factura hija encontrada: ${foundHija.factura} · ${foundHija.nombre}`;
    return;
  }

  if (foundMadre) {
    document.getElementById('trMes').value          = foundMadre.honorarioMes      || '';
    const sel = document.getElementById('trNombre');
    if (sel) sel.value = foundMadre.nombre || '';
    document.getElementById('trValorFactura').value = foundMadre.valorEspecialista || 0;
    calcValorPagar();
    infoEl.style.display = 'flex';
    msgEl.textContent = `✓ Factura madre encontrada: ${foundMadre.factura} · ${foundMadre.nombre}`;
    return;
  }

  infoEl.style.display = 'none';
};

/* Calcular VALOR A PAGAR */
window.calcValorPagar = () => {
  const g     = id => Number(document.getElementById(id)?.value)||0;
  const abono = g('trAbono');
  const descuentos = g('trGlosa') + g('trReteFuente') + g('trAfc')
                   + g('trResidentes') + g('trTiquetes')
                   + g('trHotel') + g('trTransporte');
  // Si ABONO > 0: base = ABONO. Si ABONO = 0: base = VALOR FACTURA
  const base  = abono > 0 ? abono : g('trValorFactura');
  const neto  = base - descuentos;                         // valor neto tras descuentos
  const pagado = (_pagosTmp||[]).reduce((s,p)=>s+(Number(p.monto)||0),0);
  const saldo = Math.max(0, neto - pagado);                // Valor a Pagar = saldo pendiente (nunca negativo)
  const el = document.getElementById('trValorPagar');
  if (el) { el.value = saldo; el.style.color = (neto < 0) ? 'var(--red)' : 'var(--navy)'; }
  calcSaldo();
};

/* ── PAGOS REALIZADOS (historial) y SALDO PENDIENTE ── */
let _pagosTmp = [];   // [{monto, fecha}] del modal activo (original)

window.addPagoRow = () => {
  _pagosTmp.push({ monto:0, fecha:new Date().toISOString().slice(0,10) });
  renderPagos();
};
window.removePagoRow = (i) => {
  _pagosTmp.splice(i,1);
  renderPagos();
};
window.onPagoChange = (i, campo, val) => {
  if (!_pagosTmp[i]) return;
  _pagosTmp[i][campo] = campo==='monto' ? (Number(val)||0) : val;
  calcValorPagar();
};
function renderPagos() {
  const list  = document.getElementById('pagosList');
  const empty = document.getElementById('pagosEmpty');
  if (!list) return;
  if (!_pagosTmp.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    calcValorPagar(); return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = _pagosTmp.map((p,i)=>`
    <div class="pago-row">
      <input type="date" class="pago-fecha" value="${p.fecha||''}"
        onchange="onPagoChange(${i},'fecha',this.value)"/>
      <input type="number" class="pago-monto" value="${p.monto||''}" placeholder="Monto" min="0"
        oninput="onPagoChange(${i},'monto',this.value)"/>
      <button type="button" class="pago-del" onclick="removePagoRow(${i})" title="Eliminar pago"><i class="fa-solid fa-trash"></i></button>
    </div>`).join('');
  calcValorPagar();
}
/* Calcula neto, total pagado, saldo y actualiza alerta/estado */
function calcSaldo() {
  // Calcular el NETO directamente (no leer trValorPagar, que ahora es el saldo)
  const g = id => Number(document.getElementById(id)?.value)||0;
  const abono = g('trAbono');
  const descuentos = g('trGlosa') + g('trReteFuente') + g('trAfc')
                   + g('trResidentes') + g('trTiquetes')
                   + g('trHotel') + g('trTransporte');
  const base = abono > 0 ? abono : g('trValorFactura');
  const neto = base - descuentos;
  const pagado = _pagosTmp.reduce((s,p)=>s+(Number(p.monto)||0),0);
  const saldo = Math.max(0, neto - pagado);

  const setTxt = (id,val) => { const el=document.getElementById(id); if(el) el.textContent = fmtCOP(val); };
  setTxt('prNeto', neto);
  setTxt('prPagado', pagado);
  setTxt('prSaldo', saldo);

  const estadoEl = document.getElementById('prEstado');
  const saldoEl  = document.getElementById('prSaldo');
  if (!estadoEl) return;

  if (saldo <= 0 && neto > 0) {
    estadoEl.className = 'pr-estado pr-pagada';
    estadoEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> PAGADO';
    if (saldoEl) saldoEl.style.color = '#1a7a3d';
  } else if (neto > 0 && saldo <= neto * 0.10) {
    estadoEl.className = 'pr-estado pr-proximo';
    estadoEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Pago próximo a completarse — saldo ${fmtCOP(saldo)}`;
    if (saldoEl) saldoEl.style.color = '#b35900';
  } else {
    estadoEl.className = 'pr-estado';
    estadoEl.innerHTML = '';
    if (saldoEl) saldoEl.style.color = 'var(--navy)';
  }
}

let _guardandoFila = false;   // candado anti-reentrada (doble clic / doble evento)
window.saveTablaRow = async () => {
  // Si ya hay un guardado en curso, ignorar (evita doble ejecución)
  if (_guardandoFila) return;

  const tablaId = editTablaRowTablaId;
  const tabla   = tablasEgreso.find(t=>t.id===tablaId);
  if (!tabla) return;

  // Guardar identIds actuales de la tabla (soporte múltiple)
  const tablaForIdent  = tablasEgreso.find(t=>t.id===tablaId);
  const currentIdentIds = tablaForIdent?._selectedIdents?.length
    ? tablaForIdent._selectedIdents
    : (tablaForIdent?._selectedIdent ? [tablaForIdent._selectedIdent] : []);
  const currentIdentId  = currentIdentIds[0]||'';

  const esEdicion = (editTablaRowIdx !== null && editTablaRowIdx !== undefined);

  const fila = {
    // ID único estable por fila (para editar/eliminar sin ambigüedad y detectar duplicados)
    rowId:        esEdicion ? (tabla.filas?.[editTablaRowIdx]?.rowId || genRowId()) : genRowId(),
    identId:      currentIdentId,   // primary (backward compat)
    identIds:     currentIdentIds,  // all selected
    factura:      document.getElementById('trFactura').value.trim(),
    mes:          document.getElementById('trMes').value,
    nombre:       document.getElementById('trNombre').value.trim(),
    tipoPersona:  document.getElementById('trTipoPersona')?.value||'',
    valorFactura: Number(document.getElementById('trValorFactura').value)||0,
    abono:        Number(document.getElementById('trAbono').value)||0,
    glosa:        Number(document.getElementById('trGlosa').value)||0,
    reteFuente:   Number(document.getElementById('trReteFuente').value)||0,
    afc:          Number(document.getElementById('trAfc').value)||0,
    residentes:   Number(document.getElementById('trResidentes').value)||0,
    tiquetes:     Number(document.getElementById('trTiquetes').value)||0,
    hotel:        Number(document.getElementById('trHotel').value)||0,
    transporte:   Number(document.getElementById('trTransporte').value)||0,
    valorPagar:   Number(document.getElementById('trValorPagar').value)||0,
    pagos:        JSON.parse(JSON.stringify(_pagosTmp||[])),
  };

  const filas = [...(tabla.filas||[])];

  // ── Validación anti-duplicados: la factura no puede existir ya en esta tabla ──
  const facturaNueva = (fila.factura||'').trim().toLowerCase();
  if (facturaNueva) {
    const duplicada = filas.some((f, i) => {
      // Al editar, ignorar la propia fila que se está editando
      if (esEdicion && i === editTablaRowIdx) return false;
      return (f.factura||'').trim().toLowerCase() === facturaNueva;
    });
    if (duplicada) {
      toast(`La factura "${fila.factura}" ya existe en esta tabla. No se puede duplicar.`, 'error');
      return;
    }
  }

  // Activar candado y deshabilitar el botón ANTES del await
  _guardandoFila = true;
  const btnGuardar = document.querySelector('#tablaRowModal .btn-primary');
  const btnHtmlPrev = btnGuardar?.innerHTML;
  if (btnGuardar) { btnGuardar.disabled = true; btnGuardar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...'; }

  if (esEdicion) {
    filas[editTablaRowIdx] = fila;
  } else {
    filas.push(fila);
  }

  try {
    await updateDoc(doc(db,'tablasEgreso',tablaId),{filas, updatedAt:serverTimestamp()});
    toast('Fila guardada.','success');
    closeTablaRowModal();
  } catch(e) {
    toast('Error: '+e.message,'error');
  } finally {
    // Liberar candado y restaurar botón siempre
    _guardandoFila = false;
    if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.innerHTML = btnHtmlPrev; }
  }
};

/* Genera un ID único para cada fila (timestamp + aleatorio) */
function genRowId(){
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

window.deleteTablaRow = async (tablaId, idx) => {
  if (!confirm('¿Eliminar esta fila?')) return;
  const tabla = tablasEgreso.find(t=>t.id===tablaId);
  if (!tabla) return;
  const filas = [...(tabla.filas||[])];
  filas.splice(idx,1);
  try {
    await updateDoc(doc(db,'tablasEgreso',tablaId),{filas});
    toast('Fila eliminada.');
  } catch(e) { toast('Error: '+e.message,'error'); }
};

/* ══ LIQUIDACIÓN / VISTA PDF ══ */
window.openLiquidacion = (tablaId, idx) => {
  const tabla = tablasEgreso.find(t=>t.id===tablaId);
  const f     = tabla?.filas?.[idx];
  if (!f) return;

  const descuentos = [
    {lbl:'Abono',       val:f.abono},
    {lbl:'Glosa',       val:f.glosa},
    {lbl:'Rete Fuente', val:f.reteFuente},
    {lbl:'AFC',         val:f.afc},
    {lbl:'Residentes',  val:f.residentes},
    {lbl:'Tiquetes',    val:f.tiquetes},
    {lbl:'Hotel',       val:f.hotel},
    {lbl:'Transporte',  val:f.transporte},
  ].filter(d=>Number(d.val)>0);

  const totalDesc = descuentos.reduce((s,d)=>s+Number(d.val),0);
  const mesLabel  = f.mes ? new Date(f.mes+'-15').toLocaleDateString('es-CO',{month:'long',year:'numeric'}) : '—';

  document.getElementById('liquidacionContent').innerHTML = `
    <div class="liq-wrap">
      <div class="liq-header">
        <div>
          <div class="liq-title">Liquidación de Honorarios</div>
          <div class="liq-sub">${escHtml(tabla.nombre)}</div>
        </div>
        <div style="text-align:right;font-size:12px;opacity:.6">
          Generado: ${new Date().toLocaleDateString('es-CO')}<br/>
          Factura: <strong style="opacity:1;font-size:14px">${escHtml(f.factura||'—')}</strong>
        </div>
      </div>

      <div class="liq-info-grid">
        <div class="liq-info-box">
          <div class="liq-info-lbl">Especialista</div>
          <div class="liq-info-val">${escHtml(f.nombre||'—')}</div>
        </div>
        <div class="liq-info-box">
          <div class="liq-info-lbl">Mes de gestión</div>
          <div class="liq-info-val" style="text-transform:capitalize">${mesLabel}</div>
        </div>
        <div class="liq-info-box">
          <div class="liq-info-lbl">Valor Factura</div>
          <div class="liq-info-val" style="color:var(--navy)">${fmtCOP(f.valorFactura)}</div>
        </div>
      </div>

      ${descuentos.length?`
      <table class="liq-table">
        <thead><tr><th>Concepto de descuento</th><th style="text-align:right">Valor</th></tr></thead>
        <tbody>
          ${descuentos.map(d=>`
            <tr>
              <td>${d.lbl}</td>
              <td class="desc" style="text-align:right">(${fmtCOP(d.val)})</td>
            </tr>`).join('')}
          <tr style="font-weight:700;background:var(--gray-0)">
            <td>Total descuentos</td>
            <td class="desc" style="text-align:right">(${fmtCOP(totalDesc)})</td>
          </tr>
        </tbody>
      </table>`:'<p style="color:var(--gray-3);margin-bottom:16px;font-size:13px">Sin descuentos aplicados.</p>'}

      <div class="liq-total-row">
        <div class="liq-total-lbl">VALOR A PAGAR</div>
        <div class="liq-total-val">${fmtCOP(f.valorPagar)}</div>
      </div>
    </div>`;

  document.getElementById('liquidacionModal').classList.add('open');
};

window.closeLiquidacionModal = () =>
  document.getElementById('liquidacionModal').classList.remove('open');

window.initEgresos = initEgresos;

/* ══════════════════════════════════════════════════
   COMPROBANTE DE EGRESO
══════════════════════════════════════════════════ */

let compLogoBase64 = '';

const MESES_COMP = {
  '01':'ENERO','02':'FEBRERO','03':'MARZO','04':'ABRIL','05':'MAYO','06':'JUNIO',
  '07':'JULIO','08':'AGOSTO','09':'SEPTIEMBRE','10':'OCTUBRE','11':'NOVIEMBRE','12':'DICIEMBRE'
};

/* ── Abrir modal ── */
window.openComprobanteModal = () => {
  // Poblar IPS primero — especialista se llenará dinámicamente
  const selIPS = document.getElementById('compIPS');
  selIPS.innerHTML = '<option value="">— Seleccionar —</option>'
    + tablasEgreso.map(t=>`<option value="${t.id}">${escHtml(t.nombre)}</option>`).join('');

  // Especialista vacío hasta que se seleccione IPS
  document.getElementById('compEspecialista').innerHTML = '<option value="">— Primero selecciona IPS —</option>';
  document.getElementById('compMes').innerHTML = '<option value="">— Seleccionar —</option>';

  // Fecha hoy
  const hoy = new Date().toISOString().slice(0,10);
  document.getElementById('compFecha').value = hoy;
  onCompFechaChange();

  // Logo guardado
  if (compLogoBase64) {
    document.getElementById('compLogoImg').src = compLogoBase64;
    document.getElementById('compLogoImg').style.display = 'block';
    document.getElementById('compLogoPlaceholder').style.display = 'none';
  }

  // Limpiar campos
  ['compNombre','compDocumento','compProveedor','compCorreo',
   'compIPSVal','compMesVal','compFactura','compValorFactura',
   'compAbono','compReteFuente','compGlosa','compAfc','compResidentes','compTiquetes','compHotel','compTransporte',
   'compBanco','compNCuenta','compTipoCuenta','compTitular',
   ].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('compFirma1').value = 'Angela Paredes';
  document.getElementById('compFirma2').value = 'Rosa Castellanos';
  document.getElementById('compFirma3').value = 'Angela Paredes';
  document.getElementById('compMedioPago').value = 'TRANSFERENCIA BANCARIA';
  document.getElementById('compNetoDisplay').textContent = '0';

  document.getElementById('comprobanteModal').classList.add('open');
};

window.closeComprobanteModal = () =>
  document.getElementById('comprobanteModal').classList.remove('open');

/* ── Logo ── */
window.handleCompLogo = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    compLogoBase64 = ev.target.result;
    document.getElementById('compLogoImg').src = compLogoBase64;
    document.getElementById('compLogoImg').style.display = 'block';
    document.getElementById('compLogoPlaceholder').style.display = 'none';
  };
  r.readAsDataURL(file);
};

/* ── Fecha → Consecutivo ── */
window.onCompFechaChange = () => {
  const fecha = document.getElementById('compFecha').value;
  if (!fecha) return;
  const [,, dd] = fecha.split('-');
  const mm = fecha.slice(5,7);
  document.getElementById('compConsecutivo').value = `${dd}-${mm}`;
};

/* ── Especialista seleccionado → autocompletar datos beneficiario y pago ── */
window.onCompEspecialistaChange = () => {
  const esp = document.getElementById('compEspecialista').value;
  if (!esp) return;
  // Buscar cliente por especialista o por nombre (para compatibilidad)
  const cliente = doctors.find(d => d.especialista === esp) || doctors.find(d => d.nombre === esp);
  if (!cliente) { autocompletarFinanciero(); return; }
  document.getElementById('compNombre').value    = cliente.especialista || '';
  document.getElementById('compDocumento').value = cliente.nit          || '';
  document.getElementById('compProveedor').value = cliente.nombre       || '';
  document.getElementById('compCorreo').value    = cliente.correo       || '';
  // Datos de pago
  document.getElementById('compBanco').value     = cliente.banco        || '';
  document.getElementById('compNCuenta').value   = cliente.nCuenta      || '';
  document.getElementById('compTipoCuenta').value= cliente.tipoCuenta   || '';
  document.getElementById('compTitular').value   = cliente.especialista  || '';

  // Si ya hay IPS y mes, intentar autocompletar financiero
  autocompletarFinanciero();
};

/* ── IPS seleccionado → cargar meses disponibles ── */
window.onCompIPSChange = () => {
  const tablaId = document.getElementById('compIPS').value;
  const selMes  = document.getElementById('compMes');
  const selEsp  = document.getElementById('compEspecialista');
  selMes.innerHTML = '<option value="">— Seleccionar —</option>';
  selEsp.innerHTML = '<option value="">— Seleccionar —</option>';

  if (!tablaId) {
    selEsp.innerHTML = '<option value="">— Primero selecciona IPS —</option>';
    return;
  }
  const tabla = tablasEgreso.find(t=>t.id===tablaId);
  if (!tabla) return;

  // Extraer especialistas únicos de las filas de esta tabla
  const esps = [...new Set((tabla.filas||[]).map(f=>f.nombre).filter(Boolean))].sort();
  selEsp.innerHTML = '<option value="">— Seleccionar —</option>'
    + esps.map(e=>`<option value="${escHtml(e)}">${escHtml(e)}</option>`).join('');

  // Extraer meses únicos de las filas
  const meses = [...new Set((tabla.filas||[]).map(f=>f.mes).filter(Boolean))].sort();
  selMes.innerHTML = '<option value="">— Seleccionar —</option>'
    + meses.map(m=>{
        const label = MESES_COMP[m.slice(5,7)] || m;
        return `<option value="${m}">${label}</option>`;
      }).join('');

  // Nombre IPS en el doc
  document.getElementById('compIPSVal').value = tabla.nombre || '';
  // Limpiar selección anterior
  document.getElementById('compEspecialista').value = '';
  autocompletarFinanciero();
};

/* ── Mes seleccionado → autocompletar financiero ── */
window.onCompMesChange = () => {
  const mes = document.getElementById('compMes').value;
  if (mes) {
    const label = MESES_COMP[mes.slice(5,7)] || mes;
    document.getElementById('compMesVal').value = label;
  }
  autocompletarFinanciero();
};

/* ── Autocompletar detalle financiero ── */
function autocompletarFinanciero() {
  const tablaId = document.getElementById('compIPS').value;
  const mes     = document.getElementById('compMes').value;
  const esp     = document.getElementById('compEspecialista').value;
  if (!tablaId || !mes || !esp) return;

  const tabla = tablasEgreso.find(t=>t.id===tablaId);
  if (!tabla) return;

  // Buscar fila que coincida con mes Y nombre especialista
  const fila = (tabla.filas||[]).find(f =>
    f.mes === mes && f.nombre === esp
  );
  if (!fila) return;

  document.getElementById('compFactura').value     = fila.factura      || '';
  document.getElementById('compValorFactura').value= fila.valorFactura || 0;
  document.getElementById('compAbono').value       = fila.abono        || 0;
  document.getElementById('compReteFuente').value  = fila.reteFuente   || 0;
  document.getElementById('compGlosa').value       = fila.glosa        || 0;
  document.getElementById('compAfc').value         = fila.afc          || 0;
  document.getElementById('compResidentes').value  = fila.residentes  || 0;
  document.getElementById('compTiquetes').value    = fila.tiquetes    || 0;
  document.getElementById('compHotel').value       = fila.hotel       || 0;
  document.getElementById('compTransporte').value  = fila.transporte  || 0;
  calcCompNeto();
}

/* ── Calcular neto ── */
window.calcCompNeto = () => {
  const g    = id => Number(document.getElementById(id)?.value)||0;
  const abono = g('compAbono');
  const base  = abono > 0 ? abono : g('compValorFactura');
  const neto  = base - g('compGlosa') - g('compReteFuente') - g('compAfc')
              - g('compResidentes') - g('compTiquetes')
              - g('compHotel') - g('compTransporte');
  document.getElementById('compNetoDisplay').textContent =
    neto.toLocaleString('es-CO');
};

/* ── Imprimir ── */
window.imprimirComprobante = () => {
  const modal = document.getElementById('comprobanteModal');
  if (!modal.classList.contains('open')) return;
  document.body.classList.add('printing-comprobante');
  window.print();
  window.onafterprint = () => {
    document.body.classList.remove('printing-comprobante');
    window.onafterprint = null;
  };
  // Fallback
  setTimeout(() => document.body.classList.remove('printing-comprobante'), 3000);
};

/* ══════════════════════════════════════════════════
   CUADRO DE TURNOS
══════════════════════════════════════════════════ */

let turnos = [];      // turnos de la vista activa
let turnosCurrentDate = new Date();
let editTurnoId = null;

const DIAS_SEMANA = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DIAS_FULL   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES_TURN  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/* ═══════════════════════════════════════════════════════════════
   UROEXPERTOS 2 — copia independiente de UROEXPERTOS
   Colecciones propias: egresos_v2, tablasEgreso_v2 (empiezan vacías)
   Funciones cl_*, IDs *V2, estado cl_*. Helpers de formato compartidos.
═══════════════════════════════════════════════════════════════ */
let cl_egresos = [];
let cl_tablasEgreso = [];
let cl_localHijas = [];
let cl_editEgresoId = null;
let cl_editTablaRowTablaId = null;
let cl_editTablaRowIdx = null;
let cl__guardandoFila = false;
let cl__envContext = null;
const cl_busquedaTablas = {};
const cl_grupoColapsado = {};

function cl_initEgresos() {
  // UROEXPERTOS 2 usa su propio estado de carpetas (cl_grupoColapsado)
  cl_renderEgresoTable();
  cl_renderCustomTables();
}

function cl_renderEgresoTable() {
  const tbody = document.getElementById('egresoBodyV2');
  const empty = document.getElementById('egresoEmptyV2');
  if (!tbody) return;
  if (!cl_egresos.length) {
    tbody.innerHTML=''; empty.style.display='flex'; return;
  }
  empty.style.display='none';

  // Construye el HTML de una factura madre + sus hijas
  const madreHtml = (e, claveGrupo) => {
    const hijas = e.hijas||[];
    const totalHijas = hijas.reduce((s,h)=>s+(Number(h.valorEspecialista)||0),0);
    const totalEntidadHijas = hijas.reduce((s,h)=>s+(Number(h.valorEntidad)||0),0);
    const totalAdminHijas   = hijas.reduce((s,h)=>s+(Number(h.administracion)||0),0);
    const entidadMadre = Number(e.valorEntidad)||0;
    const difEntidad = entidadMadre - totalEntidadHijas;
    const hayDif = hijas.length && Math.abs(difEntidad) > 0.5;
    let h = '';

    // ── FILA MADRE ──
    h += `<tr class="egr-madre" data-mgroup-row="${escHtml(claveGrupo)}" onclick="cl_toggleHijas('${e.id}')">
      <td class="egr-expand-cell">
        <i class="fa-solid fa-chevron-right egr-expand-icon" id="icon-${e.id}"></i>
      </td>
      <td>${e.honorarioMes||'—'}</td>
      <td>${escHtml(e.concepto||'—')}</td>
      <td><strong>${escHtml(e.nombre||'—')}</strong></td>
      <td>${fmtCOP(e.valorEntidad)}</td>
      <td>${fmtCOP(e.administracion)}</td>
      <td class="egr-val-esp">${fmtCOP(e.valorEspecialista)}</td>
      <td><span class="egr-factura-badge">${escHtml(e.factura||'—')}</span></td>
      <td>
        <div class="tbl-actions">
          ${e.fechaPago
            ? `<span class="pago-badge pagada" title="Pagada el ${fmtFechaLegible(e.fechaPago)}"><i class="fa-solid fa-circle-check"></i></span>`
            : `<span class="pago-badge pendiente" title="Pendiente de pago"><i class="fa-solid fa-clock"></i></span>`}
          <button class="act-btn edit" onclick="event.stopPropagation();cl_openEgresoModal('${e.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="act-btn del"  onclick="event.stopPropagation();cl_deleteEgreso('${e.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`;

    // ── FILAS HIJAS ──
    hijas.forEach((hj) => {
      h += `<tr class="egr-hija-row" data-parent="${e.id}" data-mgroup-row="${escHtml(claveGrupo)}" style="display:none">
        <td class="egr-expand-cell egr-hija-indent">
          <i class="fa-solid fa-corner-down-right egr-hija-icon"></i>
        </td>
        <td>${hj.honorarioMes||'—'}</td>
        <td>${escHtml(hj.concepto||'—')}</td>
        <td>${escHtml(hj.nombre||'—')}</td>
        <td>${fmtCOP(hj.valorEntidad)}</td>
        <td>${fmtCOP(hj.administracion)}</td>
        <td class="egr-val-esp">${fmtCOP(hj.valorEspecialista)}</td>
        <td><span class="egr-factura-badge egr-hija-badge">${escHtml(hj.factura||'—')}</span></td>
        <td></td>
      </tr>`;
    });

    // ── FILA TOTAL HIJAS (Entidad, Administración, Especialista por separado) ──
    if (hijas.length) {
      h += `<tr class="egr-total-row" data-parent="${e.id}" data-mgroup-row="${escHtml(claveGrupo)}" style="display:none">
        <td colspan="4" class="egr-total-lbl">Total hijas (${hijas.length}):</td>
        <td class="egr-total-val">${fmtCOP(totalEntidadHijas)}</td>
        <td class="egr-total-val">${fmtCOP(totalAdminHijas)}</td>
        <td class="egr-total-val egr-val-esp">${fmtCOP(totalHijas)}</td>
        <td colspan="2"></td>
      </tr>`;
      if (hayDif) {
        const signo = difEntidad > 0 ? 'Faltan' : 'Sobran';
        h += `<tr class="egr-alerta-row" data-parent="${e.id}" data-mgroup-row="${escHtml(claveGrupo)}" style="display:none">
          <td colspan="9" class="egr-alerta-dif">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <strong>ALERTA:</strong> El valor entidad de las hijas (${fmtCOP(totalEntidadHijas)}) no coincide con el de la madre (${fmtCOP(entidadMadre)}). ${signo} ${fmtCOP(Math.abs(difEntidad))}.
          </td>
        </tr>`;
      } else {
        h += `<tr class="egr-ok-row" data-parent="${e.id}" data-mgroup-row="${escHtml(claveGrupo)}" style="display:none">
          <td colspan="9" class="egr-ok-conciliado">
            <i class="fa-solid fa-circle-check"></i> Valor entidad conciliado: hijas y madre coinciden (${fmtCOP(entidadMadre)}).
          </td>
        </tr>`;
      }
    }
    return h;
  };

  // ── Agrupar facturas madre por mes (campo honorarioMes tipo "2026-03") ──
  const grupos = cl_agruparPorMesMadre(cl_egresos);
  let html = '';
  grupos.forEach(g => {
    const colapsado = cl_grupoColapsado[`madre|${g.clave}`] ? 'colapsado' : '';
    const totalGrupo = g.items.reduce((s,e)=>s+(Number(e.valorEspecialista)||0),0);
    html += `<tr class="tbl-group-row egr-group-row ${colapsado}" data-group="${escHtml(g.clave)}" onclick="cl_toggleGrupoMadre('${escHtml(g.clave)}',this)">
      <td colspan="7" class="tbl-group-cell">
        <i class="fa-solid fa-chevron-down tbl-group-chevron"></i>
        <i class="fa-solid fa-folder-open tbl-group-folder"></i>
        <span class="tbl-group-label">${escHtml(g.etiqueta)}</span>
        <span class="tbl-group-count">${g.items.length} factura${g.items.length!==1?'s':''}</span>
      </td>
      <td class="tbl-group-total">${fmtCOP(totalGrupo)}</td>
      <td></td>
    </tr>`;
    g.items.forEach(e => { html += madreHtml(e, g.clave); });
  });

  tbody.innerHTML = html;

  // Aplicar estado colapsado inicial de los grupos
  grupos.forEach(g => {
    if (cl_grupoColapsado[`madre|${g.clave}`]) {
      tbody.querySelectorAll(`tr[data-mgroup-row="${cssEscapa(g.clave)}"]`).forEach(tr=>tr.style.display='none');
    }
  });
}

function cl_agruparPorMesMadre(items){
  const map = new Map();
  items.forEach(e => {
    const clave = (e.honorarioMes||'').trim() || 'sin-mes';
    if (!map.has(clave)) map.set(clave, []);
    map.get(clave).push(e);
  });
  const claves = [...map.keys()].sort((a,b)=>{
    if (a === 'sin-mes') return 1;
    if (b === 'sin-mes') return -1;
    return b.localeCompare(a);
  });
  return claves.map(clave => ({ clave, etiqueta: etiquetaMes(clave), items: map.get(clave) }));
}

window.cl_toggleGrupoMadre = (clave, filaCab) => {
  const key = `madre|${clave}`;
  const colapsar = !cl_grupoColapsado[key];
  cl_grupoColapsado[key] = colapsar;
  persistirGrupoColapsado();
  filaCab.classList.toggle('colapsado', colapsar);
  const tbody = document.getElementById('egresoBodyV2');
  if (!tbody) return;
  tbody.querySelectorAll(`tr[data-mgroup-row="${cssEscapa(clave)}"]`).forEach(tr=>{
    if (colapsar) {
      tr.style.display = 'none';
    } else {
      // Al expandir el grupo: mostrar madres; hijas quedan ocultas hasta abrir cada madre
      if (tr.classList.contains('egr-madre')) tr.style.display = '';
      else tr.style.display = 'none';
      // reset del ícono de expansión de cada madre
      if (tr.classList.contains('egr-madre')) {
        const ic = tr.querySelector('.egr-expand-icon');
        ic?.classList.remove('open');
      }
    }
  });
}

window.cl_toggleHijas = (id) => {
  const icon = document.getElementById('icon-'+id);
  const rows = document.querySelectorAll(`[data-parent="${id}"]`);
  const open = [...rows].some(r => r.style.display !== 'none');
  rows.forEach(r => r.style.display = open ? 'none' : 'table-row');
  icon?.classList.toggle('open', !open);
};

window.cl_openEgresoModal = (id=null) => {
  cl_editEgresoId = id;
  const e = id ? cl_egresos.find(x=>x.id===id) : null;
  document.getElementById('egresoModalTitleV2').textContent = id?'Editar Egreso':'Nuevo Egreso';
  document.getElementById('egresoIdV2').value = id||'';
  document.getElementById('eFechaFacturacionV2').value = e?.fechaFacturacion||'';
  document.getElementById('eHonorarioMesV2').value = e?.honorarioMes||'';
  document.getElementById('eConceptoV2').value = e?.concepto||'';
  document.getElementById('eNombreV2').value = e?.nombre||'';
  document.getElementById('eFacturaV2').value = e?.factura||'';
  document.getElementById('eValorEntidadV2').value = e?.valorEntidad||'';
  document.getElementById('eNotaCreditoV2').value = e?.notaCredito||'';
  document.getElementById('eAdministracionV2').value = e?.administracion||'';
  document.getElementById('eValorEspecialistaV2').value = e?.valorEspecialista||'';
  document.getElementById('eFechaPagoV2').value = e?.fechaPago||'';
  document.getElementById('eNotasV2').value = e?.notas||'';
  // Editar: respetar ICA/Rete guardados (pueden ser manuales). Nuevo: auto-calcular.
  if (e) {
    document.getElementById('eIcaV2').value = (e.ica ?? '') === '' ? '' : e.ica;
    document.getElementById('eReteHonorariosV2').value = (e.reteHonorarios ?? '') === '' ? '' : e.reteHonorarios;
    cl_calcEgresoNeto(true);   // recalcula solo el neto, sin tocar ICA/Rete
  } else {
    cl_calcEgresoNeto();       // egreso nuevo: ICA y Rete automáticos
  }
  cl_localHijas = e?.hijas ? JSON.parse(JSON.stringify(e.hijas)) : [];
  cl_renderHijasTable();
  document.getElementById('egresoModalV2').classList.add('open');
};

window.cl_calcEgresoNeto = (edicionManual) => {
  const entidad = Number(document.getElementById('eValorEntidadV2')?.value)||0;
  const nota    = Number(document.getElementById('eNotaCreditoV2')?.value)||0;
  const elIca = document.getElementById('eIcaV2');
  const elRet = document.getElementById('eReteHonorariosV2');

  // Si NO es edición manual de ICA/Rete, recalcular desde Valor Entidad:
  //   ICA = REDONDEAR(Valor Entidad × 10 / 1000)   (10 x mil)
  //   Retención por Honorarios = Valor Entidad × 11%
  if (!edicionManual) {
    if (elIca) elIca.value = Math.round(entidad * 10 / 1000);
    if (elRet) elRet.value = Math.round(entidad * 0.11);
  }

  const ica     = Number(elIca?.value)||0;
  const reteHon = Number(elRet?.value)||0;

  // Valor Entidad Neto = Valor Entidad − Nota Crédito − ICA − Retención
  const neto = entidad - nota - ica - reteHon;
  const el = document.getElementById('eValorEntidadNetoV2');
  if(el) el.value = neto;
};

window.cl_closeEgresoModal = () => {
  document.getElementById('egresoModalV2').classList.remove('open');
  cl_editEgresoId = null; cl_localHijas = [];
};

window.cl_addHijaRow = () => {
  cl_localHijas.push({factura:'', concepto:'', valor:0});
  cl_renderHijasTable();
};

window.cl_removeHijaRow = (i) => {
  cl_localHijas.splice(i,1);
  cl_renderHijasTable();
};

function cl_renderHijasTable() {
  const tbody  = document.getElementById('hijasBodyV2');
  const emptyEl= document.getElementById('hijasEmptyV2');
  const tableEl= document.getElementById('hijasTableElV2');
  if (!tbody) return;
  if (!cl_localHijas.length) {
    tbody.innerHTML='';
    if(emptyEl) emptyEl.style.display='block';
    if(tableEl) tableEl.querySelector('thead').style.display='none';
    cl_updateHijasTotal(); return;
  }
  if(emptyEl) emptyEl.style.display='none';
  if(tableEl) tableEl.querySelector('thead').style.display='';

  tbody.innerHTML = cl_localHijas.map((h,i)=>`
    <tr>
      <td><input type="date"   class="hija-fecha"    value="${h.fechaFacturacion||''}"/></td>
      <td><input type="month"  class="hija-mes"       value="${h.honorarioMes||''}"/></td>
      <td><input type="text"   class="hija-concepto" value="${escHtml(h.concepto||'')}"  placeholder="Descripción del servicio…"/></td>
      <td>
        <select class="hija-nombre" style="width:100%;border:1.5px solid var(--gray-1);border-radius:8px;padding:8px 10px;font-size:13px;outline:none;font-family:'Nunito',sans-serif;background:white;color:var(--navy);font-weight:600;cursor:pointer;transition:border-color .2s"
          onchange="cl_autoProveedorFromNombre(this,${i})">
          <option value="">— Seleccionar especialista —</option>
          ${doctors.filter(d=>d.especialista).slice().sort((a,b)=>a.especialista.localeCompare(b.especialista,'es',{sensitivity:'base'})).map(d=>`<option value="${escHtml(d.especialista)}" ${h.nombre===d.especialista?'selected':''}>${escHtml(d.especialista)}</option>`).join('')}
          ${h.nombre && !doctors.some(d=>d.especialista===h.nombre)?`<option value="${escHtml(h.nombre)}" selected>${escHtml(h.nombre)}</option>`:''}
        </select>
      </td>
      <td>
        <select class="hija-tipopersona" style="width:100%;border:1.5px solid var(--gray-1);border-radius:8px;padding:8px 10px;font-size:13px;outline:none;font-family:'Nunito',sans-serif;background:white;color:var(--navy);font-weight:600;cursor:pointer">
          <option value="">— Tipo —</option>
          <option value="Persona Natural" ${h.tipoPersona==='Persona Natural'?'selected':''}>Persona Natural</option>
          <option value="SAS" ${h.tipoPersona==='SAS'?'selected':''}>SAS</option>
        </select>
      </td>
      <td><input type="text" class="hija-proveedor" value="${escHtml(h.proveedor||'')}" placeholder="Nombre empresa…" style="border:1.5px solid var(--gray-1);border-radius:8px;padding:8px 10px;font-size:13px;outline:none;font-family:'Nunito',sans-serif;background:#f8faff;color:var(--navy);font-weight:600;width:100%;transition:border-color .2s" readonly/></td>
      <td><input type="text"   class="hija-factura"  value="${escHtml(h.factura||'')}"  placeholder="FE-001-H"/></td>
      <td><input type="number" class="hija-entidad"  value="${h.valorEntidad||''}"       placeholder="0" min="0"
        oninput="cl_recalcHijaRow(this)"/></td>
      <td>
        <div class="hija-admin-cell">
          <div class="hija-admin-fila1">
            <select class="hija-admin-modo" onchange="cl_recalcHijaRow(this)" title="Cómo se calcula la administración">
              <option value="directo" ${h.adminModo!=='pct'?'selected':''}>Valor $</option>
              <option value="pct" ${h.adminModo==='pct'?'selected':''}>Porcentaje %</option>
            </select>
            <input type="number" class="hija-admin-pct" value="${h.adminPct||''}" placeholder="%" min="0" max="100" step="0.01"
              oninput="cl_recalcHijaRow(this)" title="Porcentaje de administración"
              style="${h.adminModo==='pct'?'':'display:none'}"/>
            <input type="number" class="hija-admin-directo" value="${h.adminModo!=='pct'?(h.administracion||''):''}" placeholder="0" min="0"
              oninput="cl_recalcHijaRow(this)" title="Valor de administración"
              style="width:100px;text-align:right;${h.adminModo==='pct'?'display:none':''}"/>
          </div>
          <div class="hija-admin-resultado">
            <span class="lbl">Admin.</span>
            <input type="number" class="hija-admin" value="${h.administracion||''}" readonly tabindex="-1"
              style="border:none;background:transparent;width:100%;text-align:right;font-weight:800;color:var(--navy);padding:0"/>
          </div>
        </div>
      </td>
      <td><input type="number" class="hija-valor"    value="${h.valorEspecialista||''}"  placeholder="0" min="0"
        oninput="cl_updateHijasTotal()"/></td>
      <td><button class="accesos-del-btn" onclick="cl_removeHijaRow(${i})"><i class="fa-solid fa-trash"></i></button></td>
    </tr>`).join('');
  cl_updateHijasTotal();
}

window.cl_autoProveedorFromNombre = (selectEl, rowIdx) => {
  const esp = selectEl.value;
  const row = selectEl.closest('tr');
  const provInput = row?.querySelector('.hija-proveedor');
  if (!provInput) return;
  const cliente = doctors.find(d => d.especialista === esp);
  provInput.value = cliente?.nombre || '';
};

function cl_updateHijasTotal() {
  const total = [...document.querySelectorAll('.hija-valor')]
    .reduce((s,el)=>s+(Number(el.value)||0),0);
  const el = document.getElementById('hijasTotalV2');
  if (el) el.textContent = fmtCOP(total);
}

/* Recalcula fila hija en UROEXPERTOS 2: modo admin (%/directo), admin y especialista.
   Valor Especialista = Valor Entidad − Administración (autocalculado, editable después). */
window.cl_recalcHijaRow = (triggerEl) => {
  const row = triggerEl.closest('tr');
  if (!row) return;
  const entidadEl = row.querySelector('.hija-entidad');
  const modoEl    = row.querySelector('.hija-admin-modo');
  const pctEl     = row.querySelector('.hija-admin-pct');
  const directoEl = row.querySelector('.hija-admin-directo');
  const adminEl   = row.querySelector('.hija-admin');       // resultado (readonly, siempre visible)
  const espEl     = row.querySelector('.hija-valor');
  if (!entidadEl || !adminEl) return;

  const entidad = Number(entidadEl.value)||0;
  const modo    = modoEl?.value || 'directo';
  let admin = 0;

  if (modo === 'pct') {
    if (pctEl) pctEl.style.display = '';
    if (directoEl) directoEl.style.display = 'none';
    let pct = Number(pctEl?.value)||0;
    if (pct < 0) pct = 0; if (pct > 100) pct = 100;
    if (pctEl) pctEl.value = pct || '';
    admin = Math.round(entidad * pct / 100);
  } else {
    if (pctEl) pctEl.style.display = 'none';
    if (directoEl) directoEl.style.display = '';
    admin = Number(directoEl?.value)||0;
  }

  if (admin > entidad) {
    admin = entidad;
    if (modo!=='pct' && directoEl) directoEl.value = admin;
    adminEl.style.color = 'var(--red, #e74c3c)';
    setTimeout(()=>{ adminEl.style.color=''; }, 1200);
  }

  adminEl.value = admin;
  if (espEl) espEl.value = Math.max(0, entidad - admin);
  cl_updateHijasTotal();
};

window.cl_saveEgreso = async () => {
  const factura = document.getElementById('eFacturaV2').value.trim();
  const nombre  = document.getElementById('eNombreV2').value.trim();
  if (!nombre||!factura) { toast('Nombre y Factura son obligatorios.','error'); return; }

  // Leer hijas del DOM — todos los campos iguales a la madre
  const hijas = [];
  document.querySelectorAll('#hijasBodyV2 tr').forEach(row=>{
    const honorarioMes     = row.querySelector('.hija-mes')?.value||'';
    const concepto         = row.querySelector('.hija-concepto')?.value.trim()||'';
    const nombre           = row.querySelector('.hija-nombre')?.value||'';
    const tipoPersona      = row.querySelector('.hija-tipopersona')?.value||'';
    const proveedor        = row.querySelector('.hija-proveedor')?.value.trim()||'';
    const factura          = row.querySelector('.hija-factura')?.value.trim()||'';
    const fechaFacturacion = row.querySelector('.hija-fecha')?.value||'';
    const valorEntidad     = Number(row.querySelector('.hija-entidad')?.value)||0;
    const administracion   = Number(row.querySelector('.hija-admin')?.value)||0;
    const valorEspecialista= Number(row.querySelector('.hija-valor')?.value)||0;
    const adminModo        = row.querySelector('.hija-admin-modo')?.value||'directo';
    const adminPct         = Number(row.querySelector('.hija-admin-pct')?.value)||0;
    if (factura||nombre||concepto) hijas.push({fechaFacturacion,honorarioMes,concepto,nombre,tipoPersona,proveedor,factura,valorEntidad,administracion,valorEspecialista,adminModo,adminPct});
  });

  const data = {
    fechaFacturacion: document.getElementById('eFechaFacturacionV2').value,
    honorarioMes: document.getElementById('eHonorarioMesV2').value,
    concepto:     document.getElementById('eConceptoV2').value.trim(),
    nombre,
    factura,
    valorEntidad:      Number(document.getElementById('eValorEntidadV2').value)||0,
    ica:               Number(document.getElementById('eIcaV2').value)||0,
    reteHonorarios:    Number(document.getElementById('eReteHonorariosV2').value)||0,
    notaCredito:       Number(document.getElementById('eNotaCreditoV2').value)||0,
    valorEntidadNeto:  Number(document.getElementById('eValorEntidadNetoV2').value)||0,
    administracion:    Number(document.getElementById('eAdministracionV2').value)||0,
    valorEspecialista: Number(document.getElementById('eValorEspecialistaV2').value)||0,
    fechaPago:         document.getElementById('eFechaPagoV2').value||'',
    notas:        document.getElementById('eNotasV2').value.trim(),
    hijas,
    updatedAt: serverTimestamp()
  };
  try {
    if (cl_editEgresoId) {
      await updateDoc(doc(db,'egresos_v2',cl_editEgresoId),data);
      toast('Registro actualizado.','success');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db,'egresos_v2'),data);
      toast('Registro creado.','success');
    }
    cl_closeEgresoModal();
  } catch(e) { toast('Error: '+e.message,'error'); }
};

window.cl_deleteEgreso = async (id) => {
  if (!confirm('¿Eliminar este egreso?')) return;
  try { await deleteDoc(doc(db,'egresos_v2',id)); toast('Eliminado.'); }
  catch(e) { toast('Error: '+e.message,'error'); }
};

window.cl_openTablaModal = (id=null) => {
  const t = id ? cl_tablasEgreso.find(x=>x.id===id) : null;
  document.getElementById('tablaModalTitleV2').textContent = id ? 'Editar Tabla' : 'Nueva Tabla';
  document.getElementById('tablaEditIdV2').value  = id||'';
  document.getElementById('tablaNameV2').value    = t?.nombre||'';
  // Logos
  cl__setTablaLogoPreview('izq', t?.logoIzq||'');
  cl__setTablaLogoPreview('der', t?.logoDer||'');
  document.getElementById('tablaLogoIzqV2').value = t?.logoIzq||'';
  document.getElementById('tablaLogoDerV2').value = t?.logoDer||'';
  document.getElementById('tablaModalV2').classList.add('open');
};

window.cl_closeTablaModal = () => {
  document.getElementById('tablaModalV2').classList.remove('open');
  document.getElementById('tablaEditIdV2').value = '';
};

window.cl_editTabla = (id) => cl_openTablaModal(id);

function cl__setTablaLogoPreview(side, b64) {
  const prev = document.getElementById(`tablaLogo${side==='izq'?'Izq':'Der'}PrevV2`);
  if (!prev) return;
  if (b64) {
    prev.innerHTML = `<img src="${b64}" style="max-height:46px;max-width:80px;object-fit:contain"/>`;
  } else {
    prev.innerHTML = '<i class="fa-solid fa-image" style="color:var(--gray-2);font-size:18px"></i>';
  }
}

window.cl_handleTablaLogo = (e, side) => {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    const b64 = ev.target.result;
    document.getElementById(side==='izq'?'tablaLogoIzqV2':'tablaLogoDerV2').value = b64;
    cl__setTablaLogoPreview(side, b64);
  };
  r.readAsDataURL(file);
};

window.cl_clearTablaLogo = (side) => {
  document.getElementById(side==='izq'?'tablaLogoIzqV2':'tablaLogoDerV2').value = '';
  cl__setTablaLogoPreview(side, '');
  document.getElementById(side==='izq'?'tablaLogoIzqFile':'tablaLogoDerFile').value = '';
};

window.cl_saveTabla = async () => {
  const nombre  = document.getElementById('tablaNameV2').value.trim();
  if (!nombre) { toast('Ponle un nombre a la tabla.','error'); return; }
  const editId  = document.getElementById('tablaEditIdV2').value;
  const logoIzq = document.getElementById('tablaLogoIzqV2').value||'';
  const logoDer = document.getElementById('tablaLogoDerV2').value||'';
  try {
    if (editId) {
      await updateDoc(doc(db,'tablasEgreso_v2',editId),{nombre,logoIzq,logoDer,updatedAt:serverTimestamp()});
      toast('Tabla actualizada.','success');
    } else {
      await addDoc(collection(db,'tablasEgreso_v2'),{nombre,logoIzq,logoDer,filas:[],createdAt:serverTimestamp()});
      toast('Tabla creada.','success');
    }
    cl_closeTablaModal();
  } catch(e){ toast('Error: '+e.message,'error'); }
};

window.cl_toggleTablaCheck = (tablaId, field, val) => {
  const idx = cl_tablasEgreso.findIndex(t=>t.id===tablaId);
  if(idx===-1) return;
  if(field==='contabilidad') cl_tablasEgreso[idx]._chkContabilidad = val;
  if(field==='facturacion')  cl_tablasEgreso[idx]._chkFacturacion  = val;
  // persist to Firestore
  const upd = {};
  upd[field==='contabilidad'?'chkContabilidad':'chkFacturacion'] = val;
  updateDoc(doc(db,'tablasEgreso_v2',tablaId), upd).catch(()=>{});
};

window.cl_onIdentChange = async (tablaId, selectEl) => {
  const idx = cl_tablasEgreso.findIndex(t=>t.id===tablaId);
  if (idx===-1) return;
  const selectedIds = [...selectEl.selectedOptions].map(o=>o.value).filter(Boolean);
  cl_tablasEgreso[idx]._selectedIdents = selectedIds;
  cl_tablasEgreso[idx]._selectedIdent  = selectedIds[0]||'';
  cl_renderCustomTables();

  if (!selectedIds.length) return;
  const tabla = cl_tablasEgreso[idx];
  const filasActuales = tabla.filas||[];

  // ── Clave de RELACIÓN interna: madre + índice de la hija (no depende del nombre/factura) ──
  const hijaKeyDe = (egresoId, i, h) => `${egresoId}::${i}`;
  const yaVinculadas = new Set();
  filasActuales.forEach(f => {
    if (f.hijaKey) yaVinculadas.add(f.hijaKey);
  });

  // ── Traer los datos FRESCOS del array de cl_egresos vigente ──
  const nuevas = [];
  let totalHijasAsociadas = 0;
  selectedIds.forEach(egresoId => {
    const egreso = cl_egresos.find(e=>e.id===egresoId);
    if (!egreso) return;
    const hijas = egreso.hijas||[];
    totalHijasAsociadas += hijas.length;

    hijas.forEach((h, i) => {
      const hijaKey = hijaKeyDe(egresoId, i, h);
      if (yaVinculadas.has(hijaKey)) return;
      const factKey = (h.factura||'').trim().toLowerCase();
      if (factKey) {
        const yaPorFactura = filasActuales.some(f =>
          !f.hijaKey && f.identId===egresoId && (f.factura||'').trim().toLowerCase()===factKey);
        if (yaPorFactura) return;
      }
      yaVinculadas.add(hijaKey);

      const valorFactura = Number(h.valorEspecialista)||0;
      nuevas.push({
        rowId:        genRowId(),
        hijaKey,
        identId:      egresoId,
        identIds:     [egresoId],
        factura:      h.factura||'',
        mes:          h.honorarioMes||egreso.honorarioMes||'',
        nombre:       h.nombre||egreso.nombre||'',
        tipoPersona:  h.tipoPersona||'',
        valorFactura,
        abono:        0,
        glosa:        0,
        reteFuente:   0,
        afc:          0,
        residentes:   0,
        tiquetes:     0,
        hotel:        0,
        transporte:   0,
        valorPagar:   valorFactura,
        pagos:        [],
      });
    });
  });

  if (!nuevas.length) {
    toast(`Sin hijas nuevas por traer. Ya están las ${totalHijasAsociadas} asociadas.`, 'info');
    return;
  }

  try {
    const filasActualizadas = [...filasActuales, ...nuevas];
    await updateDoc(doc(db,'tablasEgreso_v2',tablaId), {
      filas: filasActualizadas,
      updatedAt: serverTimestamp()
    });
    toast(`${nuevas.length} fila${nuevas.length>1?'s':''} traída${nuevas.length>1?'s':''} (de ${totalHijasAsociadas} hija${totalHijasAsociadas>1?'s':''} asociada${totalHijasAsociadas>1?'s':''}).`, 'success');
  } catch(e) {
    toast('Error al autocargar filas: '+e.message, 'error');
  }
};

window.cl_deleteTabla = async (id) => {
  if (!confirm('¿Eliminar esta tabla y todas sus filas?')) return;
  try { await deleteDoc(doc(db,'tablasEgreso_v2',id)); toast('Tabla eliminada.'); }
  catch(e) { toast('Error: '+e.message,'error'); }
};

window.cl_filtrarTablaBusqueda = (tablaId, texto) => {
  cl_busquedaTablas[tablaId] = texto || '';
  const q    = normBusq(texto);
  const card = document.getElementById('tcard-'+tablaId);
  if (!card) return;

  const filas = card.querySelectorAll('.egr-custom-table tbody tr[data-search]');
  let visibles = 0, total = 0;

  // ¿Cuántos grupos hay y cuántos están abiertos? Si TODOS abiertos → buscar en todo.
  const grupos = [...card.querySelectorAll('.tbl-group-row')];
  const totalGrupos = grupos.length;
  const gruposAbiertos = grupos.filter(gr => {
    const clave = gr.getAttribute('data-group');
    return !cl_grupoColapsado[`${tablaId}|${clave}`];
  }).length;
  // Si hay grupos y no todos están abiertos, la búsqueda se limita a los abiertos
  const limitarAAbiertos = totalGrupos > 0 && gruposAbiertos < totalGrupos;

  filas.forEach(tr => {
    const clave = tr.getAttribute('data-group-row');
    const grupoCerrado = clave && cl_grupoColapsado[`${tablaId}|${clave}`];
    // Con búsqueda: si limitamos a abiertos, las filas de grupos cerrados NO participan
    const participa = !(limitarAAbiertos && grupoCerrado);
    const match = participa && (!q || (tr.getAttribute('data-search')||'').includes(q));
    // Sin búsqueda: respetar el colapso normal
    const mostrar = q ? match : !grupoCerrado;
    tr.style.display = mostrar ? '' : 'none';
    if (q && match){ visibles++; total += Number(tr.getAttribute('data-pagar'))||0; }
    if (!q){ total += (!grupoCerrado ? (Number(tr.getAttribute('data-pagar'))||0) : 0); }
  });

  // Encabezados de grupo
  card.querySelectorAll('.tbl-group-row').forEach(gr => {
    const clave = gr.getAttribute('data-group');
    const cerrado = cl_grupoColapsado[`${tablaId}|${clave}`];
    if (q){
      if (limitarAAbiertos && cerrado){
        // Grupo cerrado no participa en la búsqueda: mostrar encabezado atenuado
        gr.style.display = '';
        gr.classList.add('grupo-fuera-busqueda');
      } else {
        gr.classList.remove('grupo-fuera-busqueda');
        const hayVisibles = [...card.querySelectorAll(`tr[data-group-row="${cssEscapa(clave)}"]`)]
          .some(tr => tr.style.display !== 'none');
        gr.style.display = hayVisibles ? '' : 'none';
      }
    } else {
      gr.style.display = '';
      gr.classList.remove('grupo-fuera-busqueda');
    }
  });

  // Mensaje "sin resultados"
  const noRes = card.querySelector('.tbl-no-results');
  if (noRes) noRes.style.display = (q && visibles === 0 && filas.length) ? '' : 'none';

  // Total recalculado sobre lo visible
  const totEl = card.querySelector('.tbl-total-val');
  if (totEl) totEl.textContent = fmtCOP(total);

  // Contador "N de M"
  const cnt = card.querySelector('.ech-search-count');
  if (cnt) cnt.textContent = q ? `${visibles} de ${filas.length}` : '';

  // Botón limpiar visible solo con texto
  const x = card.querySelector('.ech-search-x');
  if (x) x.style.display = q ? '' : 'none';
};

window.cl_limpiarBusquedaTabla = (tablaId) => {
  const inp = document.getElementById('busq-'+tablaId);
  if (inp) inp.value = '';
  cl_filtrarTablaBusqueda(tablaId, '');
  if (inp) inp.focus();
};

window.cl_toggleGrupoMes = (tablaId, clave, filaCab) => {
  const key = `${tablaId}|${clave}`;
  const colapsar = !cl_grupoColapsado[key];
  cl_grupoColapsado[key] = colapsar;
  persistirGrupoColapsado();

  const card = document.getElementById('tcard-'+tablaId) || filaCab.closest('.egr-custom-card, .egr-madre-wrap');
  if (!card) return;
  filaCab.classList.toggle('colapsado', colapsar);
  card.querySelectorAll(`tr[data-group-row="${cssEscapa(clave)}"]`).forEach(tr=>{
    tr.style.display = colapsar ? 'none' : '';
  });
};

function cl_renderCustomTables() {
  const box = document.getElementById('egresoCustomTablesV2');
  if (!box) return;
  if (!cl_tablasEgreso.length) { box.innerHTML=''; return; }

  box.innerHTML = cl_tablasEgreso.map(t=>{
    // Filter by identificador(s) if selected
    const allFilas = t.filas||[];
    const selIds   = t._selectedIdents?.length ? t._selectedIdents
                   : (t._selectedIdent ? [t._selectedIdent] : []);
    const filas = selIds.length
      ? allFilas.filter(f=> selIds.includes(f.identId))
      : allFilas;
    const totalPagar = filas.reduce((s,f)=>s+(Number(f.valorPagar)||0),0);

    const filaHtml = (f)=>{
      const realIdx = allFilas.indexOf(f); // real index regardless of filter
      // Texto indexado para el buscador (factura, nombre, tipo de persona, mes)
      const blob = normBusq([f.factura, f.nombre, f.tipoPersona, f.mes].join(' '));
      return `
      <tr data-search="${escHtml(blob)}" data-pagar="${Number(f.valorPagar)||0}">
        <td>${escHtml(f.factura||'—')}</td>
        <td>${f.mes||'—'}</td>
        <td>${escHtml(f.nombre||'—')}</td>
        <td>${escHtml(f.tipoPersona||'—')}</td>
        <td class="td-money">${fmtCOP(f.valorFactura)}</td>
        <td class="td-money">${fmtCOP(f.abono)}</td>
        <td class="td-money">${fmtCOP(f.glosa)}</td>
        <td class="td-money">${fmtCOP(f.reteFuente)}</td>
        <td class="td-money">${fmtCOP(f.afc)}</td>
        <td class="td-money">${fmtCOP(f.residentes)}</td>
        <td class="td-money">${fmtCOP(f.tiquetes)}</td>
        <td class="td-money">${fmtCOP(f.hotel)}</td>
        <td class="td-money">${fmtCOP(f.transporte)}</td>
        <td class="col-pagar-val td-money ${Number(f.valorPagar)<0?'neg':''}">${fmtCOP(f.valorPagar)}</td>
        <td>
          <div class="tbl-actions">
            <button class="act-btn edit" onclick="cl_openTablaRowModal('${t.id}',${realIdx})"><i class="fa-solid fa-pen"></i></button>
            <button class="act-btn" style="${f.correoEnviado?'background:#e8f5e9;color:#2e7d32':'background:var(--blue-pale);color:var(--blue)'}" title="${f.correoEnviado?'Correo enviado — reenviar':'Enviar por correo'}" onclick="cl_openEnviarModal('${t.id}',${realIdx})"><i class="fa-solid ${f.correoEnviado?'fa-circle-check':'fa-paper-plane'}"></i></button>
            <button class="act-btn del" onclick="cl_deleteTablaRow('${t.id}',${realIdx})"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
    };

    // ── Agrupar filas por mes (encabezados colapsables) ──
    const grupos = agruparPorMes(filas);
    const rows = grupos.map(g => {
      const colapsado = cl_grupoColapsado[`${t.id}|${g.clave}`] ? 'colapsado' : '';
      const totalGrupo = g.filas.reduce((s,f)=>s+(Number(f.valorPagar)||0),0);
      const cab = `<tr class="tbl-group-row ${colapsado}" data-group="${escHtml(g.clave)}" onclick="cl_toggleGrupoMes('${t.id}','${escHtml(g.clave)}',this)">
        <td colspan="14" class="tbl-group-cell">
          <i class="fa-solid fa-chevron-down tbl-group-chevron"></i>
          <i class="fa-solid fa-folder-open tbl-group-folder"></i>
          <span class="tbl-group-label">${escHtml(g.etiqueta)}</span>
          <span class="tbl-group-count">${g.filas.length} factura${g.filas.length!==1?'s':''}</span>
        </td>
        <td class="td-money tbl-group-total">${fmtCOP(totalGrupo)}</td>
      </tr>`;
      const cuerpo = g.filas.map(f => filaHtml(f).replace('<tr ', `<tr data-group-row="${escHtml(g.clave)}" `)).join('');
      return cab + cuerpo;
    }).join('');

    return `<div class="egr-custom-card" id="tcard-${t.id}">
      <div class="egr-custom-head">
        ${t.logoIzq?`<img src="${t.logoIzq}" class="egr-custom-logo" alt="logo"/>`:''}
        <div class="ech-nombre"><i class="fa-solid fa-table-columns" style="opacity:.6;margin-right:5px"></i>${escHtml(t.nombre)}</div>
        ${t.logoDer?`<img src="${t.logoDer}" class="egr-custom-logo" alt="logo"/>`:''}
        <div class="ech-divider"></div>
        <!-- Checklists -->
        <label class="ech-check" title="Revisado por Contabilidad">
          <input type="checkbox" ${t._chkContabilidad?'checked':''} onchange="cl_toggleTablaCheck('${t.id}','contabilidad',event.target.checked)" style="accent-color:#4ade80"/>
          <span>Contabilidad</span>
        </label>
        <label class="ech-check" title="Facturación">
          <input type="checkbox" ${t._chkFacturacion?'checked':''} onchange="cl_toggleTablaCheck('${t.id}','facturacion',event.target.checked)" style="accent-color:#60a5fa"/>
          <span>Facturación</span>
        </label>
        <div class="ech-divider"></div>
        <!-- Identificador -->
        <div class="ech-ident">
          <i class="fa-solid fa-tag" style="color:rgba(255,255,255,.5);font-size:10px"></i>
          <select class="egr-ident-sel" id="ident-${t.id}" multiple size="1"
            onchange="cl_onIdentChange('${t.id}',this)"
            style="min-width:140px;cursor:pointer"
            title="Ctrl+clic para selección múltiple">
            ${cl_egresos.map(e=>{
              const selIds = t._selectedIdents||[];
              const isSel  = selIds.includes(e.id);
              return `<option value="${e.id}" ${isSel?'selected':''}>${escHtml(e.factura||e.nombre||e.id)}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="ech-divider"></div>
        <!-- Buscador -->
        <div class="ech-search">
          <i class="fa-solid fa-magnifying-glass ech-search-ico"></i>
          <input type="text" class="ech-search-input" id="busq-${t.id}"
            placeholder="Buscar por factura"
            value="${escHtml(cl_busquedaTablas[t.id]||'')}"
            oninput="cl_filtrarTablaBusqueda('${t.id}', this.value)"/>
          <button class="ech-search-x" title="Limpiar" onclick="cl_limpiarBusquedaTabla('${t.id}')">&times;</button>
          <span class="ech-search-count"></span>
        </div>
        <div class="ech-divider"></div>
        <!-- Acciones -->
        <div class="ech-actions">
          <button class="ech-btn" onclick="cl_openTablaRowModal('${t.id}',null)" title="Nueva fila"><i class="fa-solid fa-plus"></i> Nueva fila</button>
          <button class="ech-btn ech-btn-green" onclick="cl_exportarTablaExcel('${t.id}')" title="Exportar Excel"><i class="fa-solid fa-file-excel"></i> Excel</button>
          <button class="ech-btn-icon" onclick="cl_editTabla('${t.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
          <button class="ech-btn-icon ech-btn-red" onclick="cl_deleteTabla('${t.id}')" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <div class="egr-custom-table-wrap">
        <table class="egr-custom-table">
          <colgroup>
            <col class="cc-factura"/><col class="cc-mes"/><col class="cc-nombre"/><col class="cc-tipopersona"/>
            <col class="cc-money"/><col class="cc-money"/><col class="cc-money"/><col class="cc-money"/>
            <col class="cc-money"/><col class="cc-money"/><col class="cc-money"/><col class="cc-money"/>
            <col class="cc-money"/><col class="cc-pagar"/><col class="cc-acciones"/>
          </colgroup>
          <thead><tr>
            <th>FACTURA</th><th>MES</th><th>NOMBRE ESPECIALISTA</th><th>TIPO DE PERSONA</th>
            <th class="th-money">VALOR FACTURA</th><th class="th-money">ABONO</th><th class="th-money">GLOSA</th>
            <th class="th-money">RETE FUENTE</th><th class="th-money">AFC</th><th class="th-money">RESIDENTES</th>
            <th class="th-money">TIQUETES</th><th class="th-money">HOTEL</th><th class="th-money">TRANSPORTE</th>
            <th class="col-pagar th-money">VALOR A PAGAR</th><th></th>
          </tr></thead>
          <tbody>${rows||`<tr><td colspan="15" style="text-align:center;padding:20px;color:var(--gray-3)">Sin filas. Añade la primera.</td></tr>`}
            <tr class="tbl-no-results" style="display:none"><td colspan="15" style="text-align:center;padding:20px;color:var(--gray-3)"><i class="fa-solid fa-magnifying-glass" style="opacity:.5;margin-right:6px"></i>Sin resultados para la búsqueda.</td></tr>
          </tbody>
          ${filas.length?`<tfoot><tr>
            <td colspan="13" style="text-align:right;font-weight:800;padding:9px 12px;color:var(--gray-4);font-size:12px">TOTAL:</td>
            <td class="tbl-total-val" style="font-weight:800;color:var(--navy);background:#eef4ff;padding:9px 12px">${fmtCOP(totalPagar)}</td>
            <td></td>
          </tr></tfoot>`:''}
        </table>
      </div>
    </div>`;
  }).join('');

  // Aplicar el estado guardado de carpetas colapsadas (ocultar sus filas)
  // y re-aplicar cualquier búsqueda activa tras el re-render.
  cl_tablasEgreso.forEach(t => {
    const card = document.getElementById('tcard-'+t.id);
    if (!card) return;
    card.querySelectorAll('.tbl-group-row').forEach(gr => {
      const clave = gr.getAttribute('data-group');
      if (cl_grupoColapsado[`${t.id}|${clave}`]) {
        gr.classList.add('colapsado');
        card.querySelectorAll(`tr[data-group-row="${cssEscapa(clave)}"]`)
          .forEach(tr => tr.style.display = 'none');
      }
    });
    if (cl_busquedaTablas[t.id]) cl_filtrarTablaBusqueda(t.id, cl_busquedaTablas[t.id]);
  });
}

window.cl_openTablaRowModal = (tablaId, idx) => {
  cl_editTablaRowTablaId = tablaId;
  cl_editTablaRowIdx     = idx;
  const tabla = cl_tablasEgreso.find(t=>t.id===tablaId);
  // Validate: need identificador to add new row
  if(idx===null && !(tabla?._selectedIdents?.length || tabla?._selectedIdent)) {
    toast('Debes seleccionar un Identificador antes de agregar filas.','error');
    return;
  }
  const f = (idx !== null && idx !== undefined) ? tabla?.filas?.[idx] : null;
  document.getElementById('tablaRowTitleV2').textContent = f?'Editar Fila':'Nueva Fila';
  document.getElementById('tablaRowTablaIdV2').value = tablaId;
  document.getElementById('tablaRowIdV2').value = idx??'';
  document.getElementById('trFacturaV2').value     = f?.factura||'';
  document.getElementById('trMesV2').value         = f?.mes||'';

  // Poblar select de especialistas desde CLIENTES y restaurar selección
  const selNombre = document.getElementById('trNombreV2');
  const especialistas = [...new Set(doctors.filter(d=>d.especialista).map(d=>d.especialista))].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'}));
  const savedNombre = f?.nombre||'';
  // Build options with 'selected' attribute directly on the matching option
  selNombre.innerHTML = '<option value="">— Seleccionar especialista —</option>'
    + especialistas.map(e=>`<option value="${escHtml(e)}" ${e===savedNombre?'selected':''}>${escHtml(e)}</option>`).join('')
    + (savedNombre && !especialistas.includes(savedNombre)
        ? `<option value="${escHtml(savedNombre)}" selected>${escHtml(savedNombre)}</option>` : '');
  // Force value after DOM update
  selNombre.value = savedNombre;

  const selTipoP = document.getElementById('trTipoPersonaV2');
  if (selTipoP) selTipoP.value = f?.tipoPersona||'';

  document.getElementById('trValorFacturaV2').value= f?.valorFactura||'';
  document.getElementById('trAbonoV2').value       = f?.abono||'';
  document.getElementById('trGlosaV2').value       = f?.glosa||'';
  document.getElementById('trReteFuenteV2').value  = f?.reteFuente||'';
  document.getElementById('trAfcV2').value         = f?.afc||'';
  document.getElementById('trResidentesV2').value  = f?.residentes||'';
  document.getElementById('trTiquetesV2').value    = f?.tiquetes||'';
  document.getElementById('trHotelV2').value       = f?.hotel||'';
  document.getElementById('trTransporteV2').value  = f?.transporte||'';
  cl__pagosTmp = f?.pagos ? JSON.parse(JSON.stringify(f.pagos)) : [];
  cl_renderPagos();
  cl_calcValorPagar();
  document.getElementById('egresoAutoInfoV2').style.display='none';
  document.getElementById('tablaRowModalV2').classList.add('open');
};

window.cl_closeTablaRowModal = () => {
  document.getElementById('tablaRowModalV2').classList.remove('open');
  cl_editTablaRowTablaId = null; cl_editTablaRowIdx = null;
};

window.cl_autocompletarDesdeEgreso = () => {
  const factura = document.getElementById('trFacturaV2').value.trim().toLowerCase();
  if (!factura) return;

  const infoEl = document.getElementById('egresoAutoInfoV2');
  const msgEl  = document.getElementById('egresoAutoMsgV2');

  // 1. Buscar PRIMERO en facturas hijas — son los registros reales
  let foundHija = null;
  for (const e of cl_egresos) {
    const hija = (e.hijas||[]).find(h => (h.factura||'').toLowerCase() === factura);
    if (hija) { foundHija = hija; break; }
  }

  if (foundHija) {
    document.getElementById('trMesV2').value          = foundHija.honorarioMes || '';
    // Set select value for nombre
    const sel = document.getElementById('trNombreV2');
    if (sel) sel.value = foundHija.nombre || '';
    document.getElementById('trValorFacturaV2').value = foundHija.valorEspecialista || 0;
    cl_calcValorPagar();
    infoEl.style.display = 'flex';
    msgEl.textContent = `✓ Factura hija encontrada: ${foundHija.factura} · ${foundHija.nombre}`;
    return;
  }

  if (foundMadre) {
    document.getElementById('trMesV2').value          = foundMadre.honorarioMes      || '';
    const sel = document.getElementById('trNombreV2');
    if (sel) sel.value = foundMadre.nombre || '';
    document.getElementById('trValorFacturaV2').value = foundMadre.valorEspecialista || 0;
    cl_calcValorPagar();
    infoEl.style.display = 'flex';
    msgEl.textContent = `✓ Factura madre encontrada: ${foundMadre.factura} · ${foundMadre.nombre}`;
    return;
  }

  infoEl.style.display = 'none';
};

window.cl_calcValorPagar = () => {
  const g     = id => Number(document.getElementById(id)?.value)||0;
  const abono = g('trAbonoV2');
  const descuentos = g('trGlosaV2') + g('trReteFuenteV2') + g('trAfcV2')
                   + g('trResidentesV2') + g('trTiquetesV2')
                   + g('trHotelV2') + g('trTransporteV2');
  // Si ABONO > 0: base = ABONO. Si ABONO = 0: base = VALOR FACTURA
  const base  = abono > 0 ? abono : g('trValorFacturaV2');
  const neto  = base - descuentos;
  const pagado = (cl__pagosTmp||[]).reduce((s,p)=>s+(Number(p.monto)||0),0);
  const saldo = Math.max(0, neto - pagado);                // Valor a Pagar = saldo pendiente (nunca negativo)
  const el = document.getElementById('trValorPagarV2');
  if (el) { el.value = saldo; el.style.color = (neto < 0) ? 'var(--red)' : 'var(--navy)'; }
  cl_calcSaldo();
};

/* ── PAGOS REALIZADOS (historial) y SALDO PENDIENTE — UROEXPERTOS 2 ── */
let cl__pagosTmp = [];

window.cl_addPagoRow = () => {
  cl__pagosTmp.push({ monto:0, fecha:new Date().toISOString().slice(0,10) });
  cl_renderPagos();
};
window.cl_removePagoRow = (i) => {
  cl__pagosTmp.splice(i,1);
  cl_renderPagos();
};
window.cl_onPagoChange = (i, campo, val) => {
  if (!cl__pagosTmp[i]) return;
  cl__pagosTmp[i][campo] = campo==='monto' ? (Number(val)||0) : val;
  cl_calcValorPagar();
};
function cl_renderPagos() {
  const list  = document.getElementById('pagosListV2');
  const empty = document.getElementById('pagosEmptyV2');
  if (!list) return;
  if (!cl__pagosTmp.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    cl_calcValorPagar(); return;
  }
  if (empty) empty.style.display = 'none';
  list.innerHTML = cl__pagosTmp.map((p,i)=>`
    <div class="pago-row">
      <input type="date" class="pago-fecha" value="${p.fecha||''}"
        onchange="cl_onPagoChange(${i},'fecha',this.value)"/>
      <input type="number" class="pago-monto" value="${p.monto||''}" placeholder="Monto" min="0"
        oninput="cl_onPagoChange(${i},'monto',this.value)"/>
      <button type="button" class="pago-del" onclick="cl_removePagoRow(${i})" title="Eliminar pago"><i class="fa-solid fa-trash"></i></button>
    </div>`).join('');
  cl_calcValorPagar();
}
function cl_calcSaldo() {
  const g = id => Number(document.getElementById(id)?.value)||0;
  const abono = g('trAbonoV2');
  const descuentos = g('trGlosaV2') + g('trReteFuenteV2') + g('trAfcV2')
                   + g('trResidentesV2') + g('trTiquetesV2')
                   + g('trHotelV2') + g('trTransporteV2');
  const base = abono > 0 ? abono : g('trValorFacturaV2');
  const neto = base - descuentos;
  const pagado = cl__pagosTmp.reduce((s,p)=>s+(Number(p.monto)||0),0);
  const saldo = Math.max(0, neto - pagado);

  const setTxt = (id,val) => { const el=document.getElementById(id); if(el) el.textContent = fmtCOP(val); };
  setTxt('prNetoV2', neto);
  setTxt('prPagadoV2', pagado);
  setTxt('prSaldoV2', saldo);

  const estadoEl = document.getElementById('prEstadoV2');
  const saldoEl  = document.getElementById('prSaldoV2');
  if (!estadoEl) return;

  if (saldo <= 0 && neto > 0) {
    estadoEl.className = 'pr-estado pr-pagada';
    estadoEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> PAGADO';
    if (saldoEl) saldoEl.style.color = '#1a7a3d';
  } else if (neto > 0 && saldo <= neto * 0.10) {
    estadoEl.className = 'pr-estado pr-proximo';
    estadoEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Pago próximo a completarse — saldo ${fmtCOP(saldo)}`;
    if (saldoEl) saldoEl.style.color = '#b35900';
  } else {
    estadoEl.className = 'pr-estado';
    estadoEl.innerHTML = '';
    if (saldoEl) saldoEl.style.color = 'var(--navy)';
  }
}

window.cl_saveTablaRow = async () => {
  // Si ya hay un guardado en curso, ignorar (evita doble ejecución)
  if (cl__guardandoFila) return;

  const tablaId = cl_editTablaRowTablaId;
  const tabla   = cl_tablasEgreso.find(t=>t.id===tablaId);
  if (!tabla) return;

  // Guardar identIds actuales de la tabla (soporte múltiple)
  const tablaForIdent  = cl_tablasEgreso.find(t=>t.id===tablaId);
  const currentIdentIds = tablaForIdent?._selectedIdents?.length
    ? tablaForIdent._selectedIdents
    : (tablaForIdent?._selectedIdent ? [tablaForIdent._selectedIdent] : []);
  const currentIdentId  = currentIdentIds[0]||'';

  const esEdicion = (cl_editTablaRowIdx !== null && cl_editTablaRowIdx !== undefined);

  const fila = {
    // ID único estable por fila (para editar/eliminar sin ambigüedad y detectar duplicados)
    rowId:        esEdicion ? (tabla.filas?.[cl_editTablaRowIdx]?.rowId || genRowId()) : genRowId(),
    identId:      currentIdentId,   // primary (backward compat)
    identIds:     currentIdentIds,  // all selected
    factura:      document.getElementById('trFacturaV2').value.trim(),
    mes:          document.getElementById('trMesV2').value,
    nombre:       document.getElementById('trNombreV2').value.trim(),
    tipoPersona:  document.getElementById('trTipoPersonaV2')?.value||'',
    valorFactura: Number(document.getElementById('trValorFacturaV2').value)||0,
    abono:        Number(document.getElementById('trAbonoV2').value)||0,
    glosa:        Number(document.getElementById('trGlosaV2').value)||0,
    reteFuente:   Number(document.getElementById('trReteFuenteV2').value)||0,
    afc:          Number(document.getElementById('trAfcV2').value)||0,
    residentes:   Number(document.getElementById('trResidentesV2').value)||0,
    tiquetes:     Number(document.getElementById('trTiquetesV2').value)||0,
    hotel:        Number(document.getElementById('trHotelV2').value)||0,
    transporte:   Number(document.getElementById('trTransporteV2').value)||0,
    valorPagar:   Number(document.getElementById('trValorPagarV2').value)||0,
    pagos:        JSON.parse(JSON.stringify(cl__pagosTmp||[])),
  };

  const filas = [...(tabla.filas||[])];

  // ── Validación anti-duplicados: la factura no puede existir ya en esta tabla ──
  const facturaNueva = (fila.factura||'').trim().toLowerCase();
  if (facturaNueva) {
    const duplicada = filas.some((f, i) => {
      // Al editar, ignorar la propia fila que se está editando
      if (esEdicion && i === cl_editTablaRowIdx) return false;
      return (f.factura||'').trim().toLowerCase() === facturaNueva;
    });
    if (duplicada) {
      toast(`La factura "${fila.factura}" ya existe en esta tabla. No se puede duplicar.`, 'error');
      return;
    }
  }

  // Activar candado y deshabilitar el botón ANTES del await
  cl__guardandoFila = true;
  const btnGuardar = document.querySelector('#tablaRowModalV2 .btn-primary');
  const btnHtmlPrev = btnGuardar?.innerHTML;
  if (btnGuardar) { btnGuardar.disabled = true; btnGuardar.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...'; }

  if (esEdicion) {
    filas[cl_editTablaRowIdx] = fila;
  } else {
    filas.push(fila);
  }

  try {
    await updateDoc(doc(db,'tablasEgreso_v2',tablaId),{filas, updatedAt:serverTimestamp()});
    toast('Fila guardada.','success');
    cl_closeTablaRowModal();
  } catch(e) {
    toast('Error: '+e.message,'error');
  } finally {
    // Liberar candado y restaurar botón siempre
    cl__guardandoFila = false;
    if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.innerHTML = btnHtmlPrev; }
  }
};

window.cl_deleteTablaRow = async (tablaId, idx) => {
  if (!confirm('¿Eliminar esta fila?')) return;
  const tabla = cl_tablasEgreso.find(t=>t.id===tablaId);
  if (!tabla) return;
  const filas = [...(tabla.filas||[])];
  filas.splice(idx,1);
  try {
    await updateDoc(doc(db,'tablasEgreso_v2',tablaId),{filas});
    toast('Fila eliminada.');
  } catch(e) { toast('Error: '+e.message,'error'); }
};

window.cl_openLiquidacion = (tablaId, idx) => {
  const tabla = cl_tablasEgreso.find(t=>t.id===tablaId);
  const f     = tabla?.filas?.[idx];
  if (!f) return;

  const descuentos = [
    {lbl:'Abono',       val:f.abono},
    {lbl:'Glosa',       val:f.glosa},
    {lbl:'Rete Fuente', val:f.reteFuente},
    {lbl:'AFC',         val:f.afc},
    {lbl:'Residentes',  val:f.residentes},
    {lbl:'Tiquetes',    val:f.tiquetes},
    {lbl:'Hotel',       val:f.hotel},
    {lbl:'Transporte',  val:f.transporte},
  ].filter(d=>Number(d.val)>0);

  const totalDesc = descuentos.reduce((s,d)=>s+Number(d.val),0);
  const mesLabel  = f.mes ? new Date(f.mes+'-15').toLocaleDateString('es-CO',{month:'long',year:'numeric'}) : '—';

  document.getElementById('liquidacionContentV2').innerHTML = `
    <div class="liq-wrap">
      <div class="liq-header">
        <div>
          <div class="liq-title">Liquidación de Honorarios</div>
          <div class="liq-sub">${escHtml(tabla.nombre)}</div>
        </div>
        <div style="text-align:right;font-size:12px;opacity:.6">
          Generado: ${new Date().toLocaleDateString('es-CO')}<br/>
          Factura: <strong style="opacity:1;font-size:14px">${escHtml(f.factura||'—')}</strong>
        </div>
      </div>

      <div class="liq-info-grid">
        <div class="liq-info-box">
          <div class="liq-info-lbl">Especialista</div>
          <div class="liq-info-val">${escHtml(f.nombre||'—')}</div>
        </div>
        <div class="liq-info-box">
          <div class="liq-info-lbl">Mes de gestión</div>
          <div class="liq-info-val" style="text-transform:capitalize">${mesLabel}</div>
        </div>
        <div class="liq-info-box">
          <div class="liq-info-lbl">Valor Factura</div>
          <div class="liq-info-val" style="color:var(--navy)">${fmtCOP(f.valorFactura)}</div>
        </div>
      </div>

      ${descuentos.length?`
      <table class="liq-table">
        <thead><tr><th>Concepto de descuento</th><th style="text-align:right">Valor</th></tr></thead>
        <tbody>
          ${descuentos.map(d=>`
            <tr>
              <td>${d.lbl}</td>
              <td class="desc" style="text-align:right">(${fmtCOP(d.val)})</td>
            </tr>`).join('')}
          <tr style="font-weight:700;background:var(--gray-0)">
            <td>Total descuentos</td>
            <td class="desc" style="text-align:right">(${fmtCOP(totalDesc)})</td>
          </tr>
        </tbody>
      </table>`:'<p style="color:var(--gray-3);margin-bottom:16px;font-size:13px">Sin descuentos aplicados.</p>'}

      <div class="liq-total-row">
        <div class="liq-total-lbl">VALOR A PAGAR</div>
        <div class="liq-total-val">${fmtCOP(f.valorPagar)}</div>
      </div>
    </div>`;

  document.getElementById('liquidacionModalV2').classList.add('open');
};

window.cl_closeLiquidacionModal = () =>
  document.getElementById('liquidacionModalV2').classList.remove('open');

window.cl_initEgresos = cl_initEgresos;

/* ══════════════════════════════════════════════════
   COMPROBANTE DE EGRESO
══════════════════════════════════════════════════ */

let cl_compLogoBase64 = '';

const cl_MESES_COMP = {
  '01':'ENERO','02':'FEBRERO','03':'MARZO','04':'ABRIL','05':'MAYO','06':'JUNIO',
  '07':'JULIO','08':'AGOSTO','09':'SEPTIEMBRE','10':'OCTUBRE','11':'NOVIEMBRE','12':'DICIEMBRE'
};

window.cl_openComprobanteModal = () => {
  // Poblar IPS primero — especialista se llenará dinámicamente
  const selIPS = document.getElementById('compIPSV2');
  selIPS.innerHTML = '<option value="">— Seleccionar —</option>'
    + cl_tablasEgreso.map(t=>`<option value="${t.id}">${escHtml(t.nombre)}</option>`).join('');

  // Especialista vacío hasta que se seleccione IPS
  document.getElementById('compEspecialistaV2').innerHTML = '<option value="">— Primero selecciona IPS —</option>';
  document.getElementById('compMesV2').innerHTML = '<option value="">— Seleccionar —</option>';

  // Fecha hoy
  const hoy = new Date().toISOString().slice(0,10);
  document.getElementById('compFechaV2').value = hoy;
  cl_onCompFechaChange();

  // Logo guardado
  if (cl_compLogoBase64) {
    document.getElementById('compLogoImgV2').src = cl_compLogoBase64;
    document.getElementById('compLogoImgV2').style.display = 'block';
    document.getElementById('compLogoPlaceholderV2').style.display = 'none';
  }

  // Limpiar campos
  ['compNombreV2','compDocumentoV2','compProveedorV2','compCorreoV2',
   'compIPSValV2','compMesValV2','compFacturaV2','compValorFacturaV2',
   'compAbonoV2','compReteFuenteV2','compGlosaV2','compAfcV2','compResidentesV2','compTiquetesV2','compHotelV2','compTransporteV2',
   'compBancoV2','compNCuentaV2','compTipoCuentaV2','compTitularV2',
   ].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('compFirma1V2').value = 'Angela Paredes';
  document.getElementById('compFirma2V2').value = 'Rosa Castellanos';
  document.getElementById('compFirma3V2').value = 'Angela Paredes';
  document.getElementById('compMedioPagoV2').value = 'TRANSFERENCIA BANCARIA';
  document.getElementById('compNetoDisplayV2').textContent = '0';

  document.getElementById('comprobanteModalV2').classList.add('open');
};

window.cl_closeComprobanteModal = () =>
  document.getElementById('comprobanteModalV2').classList.remove('open');

/* ── Logo ── */
window.cl_handleCompLogo = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = ev => {
    cl_compLogoBase64 = ev.target.result;
    document.getElementById('compLogoImgV2').src = cl_compLogoBase64;
    document.getElementById('compLogoImgV2').style.display = 'block';
    document.getElementById('compLogoPlaceholderV2').style.display = 'none';
  };
  r.readAsDataURL(file);
};

window.cl_onCompFechaChange = () => {
  const fecha = document.getElementById('compFechaV2').value;
  if (!fecha) return;
  const [,, dd] = fecha.split('-');
  const mm = fecha.slice(5,7);
  document.getElementById('compConsecutivoV2').value = `${dd}-${mm}`;
};

window.cl_onCompEspecialistaChange = () => {
  const esp = document.getElementById('compEspecialistaV2').value;
  if (!esp) return;
  // Buscar cliente por especialista o por nombre (para compatibilidad)
  const cliente = doctors.find(d => d.especialista === esp) || doctors.find(d => d.nombre === esp);
  if (!cliente) { cl_autocompletarFinanciero(); return; }
  document.getElementById('compNombreV2').value    = cliente.especialista || '';
  document.getElementById('compDocumentoV2').value = cliente.nit          || '';
  document.getElementById('compProveedorV2').value = cliente.nombre       || '';
  document.getElementById('compCorreoV2').value    = cliente.correo       || '';
  // Datos de pago
  document.getElementById('compBancoV2').value     = cliente.banco        || '';
  document.getElementById('compNCuentaV2').value   = cliente.nCuenta      || '';
  document.getElementById('compTipoCuentaV2').value= cliente.tipoCuenta   || '';
  document.getElementById('compTitularV2').value   = cliente.especialista  || '';

  // Si ya hay IPS y mes, intentar autocompletar financiero
  cl_autocompletarFinanciero();
};

window.cl_onCompIPSChange = () => {
  const tablaId = document.getElementById('compIPSV2').value;
  const selMes  = document.getElementById('compMesV2');
  const selEsp  = document.getElementById('compEspecialistaV2');
  selMes.innerHTML = '<option value="">— Seleccionar —</option>';
  selEsp.innerHTML = '<option value="">— Seleccionar —</option>';

  if (!tablaId) {
    selEsp.innerHTML = '<option value="">— Primero selecciona IPS —</option>';
    return;
  }
  const tabla = cl_tablasEgreso.find(t=>t.id===tablaId);
  if (!tabla) return;

  // Extraer especialistas únicos de las filas de esta tabla
  const esps = [...new Set((tabla.filas||[]).map(f=>f.nombre).filter(Boolean))].sort();
  selEsp.innerHTML = '<option value="">— Seleccionar —</option>'
    + esps.map(e=>`<option value="${escHtml(e)}">${escHtml(e)}</option>`).join('');

  // Extraer meses únicos de las filas
  const meses = [...new Set((tabla.filas||[]).map(f=>f.mes).filter(Boolean))].sort();
  selMes.innerHTML = '<option value="">— Seleccionar —</option>'
    + meses.map(m=>{
        const label = cl_MESES_COMP[m.slice(5,7)] || m;
        return `<option value="${m}">${label}</option>`;
      }).join('');

  // Nombre IPS en el doc
  document.getElementById('compIPSValV2').value = tabla.nombre || '';
  // Limpiar selección anterior
  document.getElementById('compEspecialistaV2').value = '';
  cl_autocompletarFinanciero();
};

window.cl_onCompMesChange = () => {
  const mes = document.getElementById('compMesV2').value;
  if (mes) {
    const label = cl_MESES_COMP[mes.slice(5,7)] || mes;
    document.getElementById('compMesValV2').value = label;
  }
  cl_autocompletarFinanciero();
};

function cl_autocompletarFinanciero() {
  const tablaId = document.getElementById('compIPSV2').value;
  const mes     = document.getElementById('compMesV2').value;
  const esp     = document.getElementById('compEspecialistaV2').value;
  if (!tablaId || !mes || !esp) return;

  const tabla = cl_tablasEgreso.find(t=>t.id===tablaId);
  if (!tabla) return;

  // Buscar fila que coincida con mes Y nombre especialista
  const fila = (tabla.filas||[]).find(f =>
    f.mes === mes && f.nombre === esp
  );
  if (!fila) return;

  document.getElementById('compFacturaV2').value     = fila.factura      || '';
  document.getElementById('compValorFacturaV2').value= fila.valorFactura || 0;
  document.getElementById('compAbonoV2').value       = fila.abono        || 0;
  document.getElementById('compReteFuenteV2').value  = fila.reteFuente   || 0;
  document.getElementById('compGlosaV2').value       = fila.glosa        || 0;
  document.getElementById('compAfcV2').value         = fila.afc          || 0;
  document.getElementById('compResidentesV2').value  = fila.residentes  || 0;
  document.getElementById('compTiquetesV2').value    = fila.tiquetes    || 0;
  document.getElementById('compHotelV2').value       = fila.hotel       || 0;
  document.getElementById('compTransporteV2').value  = fila.transporte  || 0;
  cl_calcCompNeto();
}

window.cl_calcCompNeto = () => {
  const g    = id => Number(document.getElementById(id)?.value)||0;
  const abono = g('compAbonoV2');
  const base  = abono > 0 ? abono : g('compValorFacturaV2');
  const neto  = base - g('compGlosaV2') - g('compReteFuenteV2') - g('compAfcV2')
              - g('compResidentesV2') - g('compTiquetesV2')
              - g('compHotelV2') - g('compTransporteV2');
  document.getElementById('compNetoDisplayV2').textContent =
    neto.toLocaleString('es-CO');
};

window.cl_imprimirComprobante = () => {
  const modal = document.getElementById('comprobanteModalV2');
  if (!modal.classList.contains('open')) return;
  document.body.classList.add('printing-comprobante');
  window.print();
  window.onafterprint = () => {
    document.body.classList.remove('printing-comprobante');
    window.onafterprint = null;
  };
  // Fallback
  setTimeout(() => document.body.classList.remove('printing-comprobante'), 3000);
};

window.cl_exportarFacturacionMensualExcel = () => {
  if (!window.XLSX) { toast('SheetJS no disponible.','error'); return; }
  if (!cl_egresos.length) { toast('Sin datos para exportar.','error'); return; }

  const fmtNum = v => v ? Number(v) : 0;
  const rows = [];

  cl_egresos.forEach(e => {
    // Fila madre
    rows.push([
      e.honorarioMes||'', e.concepto||'', e.nombre||'',
      fmtNum(e.valorEntidad), fmtNum(e.administracion),
      fmtNum(e.valorEspecialista), e.factura||'', 'MADRE', ''
    ]);
    // Filas hijas
    (e.hijas||[]).forEach(h => {
      rows.push([
        h.honorarioMes||'', h.concepto||'', h.nombre||'',
        fmtNum(h.valorEntidad), fmtNum(h.administracion),
        fmtNum(h.valorEspecialista), h.factura||'', 'HIJA', e.factura||''
      ]);
    });
  });

  const headers = [
    'HONORARIO MES','CONCEPTO','NOMBRE',
    'VALOR ENTIDAD','ADMINISTRACIÓN','VALOR ESPECIALISTA',
    'FACTURA','TIPO','FACTURA MADRE'
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{wch:12},{wch:28},{wch:22},{wch:14},{wch:14},{wch:16},{wch:14},{wch:8},{wch:14}];
  // Negrita encabezado
  const range = XLSX.utils.decode_range(ws['!ref']||'A1');
  for(let C=range.s.c;C<=range.e.c;C++){
    const cell = XLSX.utils.encode_cell({r:0,c:C});
    if(ws[cell]) ws[cell].s = {font:{bold:true}};
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Facturación Mensual');
  XLSX.writeFile(wb, `Facturacion_Mensual_${new Date().toISOString().slice(0,7)}.xlsx`);
  toast('✅ Excel exportado.','success');
};

window.cl_exportarTablaExcel = (tablaId) => {
  if (!window.XLSX) { toast('SheetJS no disponible. Recarga la página.','error'); return; }

  const tabla = cl_tablasEgreso.find(t=>t.id===tablaId);
  if (!tabla) { toast('Tabla no encontrada.','error'); return; }

  const allFilas = tabla.filas||[];
  const selIdent = tabla._selectedIdent||'';
  const filas = selIdent ? allFilas.filter(f=>f.identId===selIdent) : allFilas;
  if (!filas.length) { toast('La tabla no tiene filas para exportar.','error'); return; }

  const fmtNum = v => v ? Number(v) : 0;

  // Encabezados
  const headers = [
    'FACTURA','MES','NOMBRE ESPECIALISTA','TIPO DE PERSONA','VALOR FACTURA',
    'ABONO','GLOSA','RETE FUENTE','AFC','RESIDENTES',
    'TIQUETES','HOTEL','TRANSPORTE','VALOR A PAGAR'
  ];

  // Filas de datos
  const rows = filas.map(f=>[
    f.factura     || '',
    f.mes         || '',
    f.nombre      || '',
    f.tipoPersona || '',
    fmtNum(f.valorFactura),
    fmtNum(f.abono),
    fmtNum(f.glosa),
    fmtNum(f.reteFuente),
    fmtNum(f.afc),
    fmtNum(f.residentes),
    fmtNum(f.tiquetes),
    fmtNum(f.hotel),
    fmtNum(f.transporte),
    fmtNum(f.valorPagar),
  ]);

  // Fila de totales
  const totales = [
    'TOTAL','','',
    filas.reduce((s,f)=>s+fmtNum(f.valorFactura),0),
    filas.reduce((s,f)=>s+fmtNum(f.abono),0),
    filas.reduce((s,f)=>s+fmtNum(f.glosa),0),
    filas.reduce((s,f)=>s+fmtNum(f.reteFuente),0),
    filas.reduce((s,f)=>s+fmtNum(f.afc),0),
    filas.reduce((s,f)=>s+fmtNum(f.residentes),0),
    filas.reduce((s,f)=>s+fmtNum(f.tiquetes),0),
    filas.reduce((s,f)=>s+fmtNum(f.hotel),0),
    filas.reduce((s,f)=>s+fmtNum(f.transporte),0),
    filas.reduce((s,f)=>s+fmtNum(f.valorPagar),0),
  ];

  const wsData = [headers, ...rows, totales];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Estilo de anchos de columna
  ws['!cols'] = [
    {wch:14},{wch:10},{wch:22},{wch:14},
    {wch:12},{wch:12},{wch:13},{wch:10},{wch:12},
    {wch:12},{wch:12},{wch:14},{wch:14}
  ];

  // Aplicar negrita al encabezado y totales via estilos si están disponibles
  const range = XLSX.utils.decode_range(ws['!ref']);
  // Encabezado (fila 0) — bold
  for(let C=range.s.c; C<=range.e.c; C++){
    const hCell = XLSX.utils.encode_cell({r:0,c:C});
    if(!ws[hCell]) continue;
    ws[hCell].s = {font:{bold:true}, fill:{fgColor:{rgb:'1A3A6B'}}, alignment:{horizontal:'center'}};
  }
  // Fila de totales — bold
  const lastRow = wsData.length - 1;
  for(let C=range.s.c; C<=range.e.c; C++){
    const tCell = XLSX.utils.encode_cell({r:lastRow,c:C});
    if(!ws[tCell]) continue;
    ws[tCell].s = {font:{bold:true}, fill:{fgColor:{rgb:'EEF4FF'}}};
  }

  // Crear workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tabla.nombre.slice(0,31));

  // Nombre del archivo dinámico
  const nombreLimpio = tabla.nombre.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g,'').replace(/\s+/g,'_').toUpperCase();
  const fecha = new Date().toISOString().slice(0,7); // YYYY-MM
  const fileName = `${nombreLimpio}_${fecha}.xlsx`;

  XLSX.writeFile(wb, fileName);
  toast(`✅ Exportado: ${fileName}`,'success');
};

window.cl_openEnviarModal = (tablaId, idx) => {
  const tabla = cl_tablasEgreso.find(t=>t.id===tablaId);
  const fila  = tabla?.filas?.[idx];
  if (!fila) { toast('No se encontró el registro.','error'); return; }

  // Validar: información en la fila
  if (!fila.nombre) {
    toast('No es posible enviar el correo, falta información requerida (especialista).','error');
    return;
  }

  // Buscar especialista en Clientes y su correo
  const doctor = doctors.find(d => d.especialista === fila.nombre);
  const correo = doctor?.correo?.trim() || '';

  if (!correo) {
    toast(`No es posible enviar: ${fila.nombre} no tiene correo registrado en Clientes.`,'error');
    return;
  }

  cl__envContext = { tablaId, idx, fila, especialista: fila.nombre, correo, tablaNombre: tabla.nombre||'', mesLabel: mesFilaLabel(fila.mes) };

  document.getElementById('envEspecialistaV2').textContent = fila.nombre;
  document.getElementById('envCorreoV2').textContent = correo;

  // Fecha de hoy como valor predeterminado
  const hoy = new Date();
  const fechaStr = hoy.toISOString().slice(0,10);
  const nombreLimpio = fila.nombre.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g,'').replace(/\s+/g,'_');

  document.getElementById('envAdjuntoV2').textContent = `Comprobante_Egreso_${nombreLimpio}_${fechaStr}.pdf`;
  // Fecha del archivo — editable, predeterminada hoy
  const fechaInput = document.getElementById('envFechaArchivoV2');
  if (fechaInput) fechaInput.value = fechaStr;
  // Selector de abono — predeterminado "No"
  const abonoSel = document.getElementById('envEsAbonoV2');
  if (abonoSel) abonoSel.value = 'no';

  document.getElementById('envAsuntoV2').value = `Notificación de pago de honorarios profesionales — ${cl__envContext.mesLabel}`;
  // Componer el mensaje con la fecha y el estado de abono actuales
  cl_envActualizarMensaje();

  document.getElementById('enviarModalV2').classList.add('open');
};

window.cl_envActualizarMensaje = () => {
  if (!cl__envContext) return;
  const fechaISO = document.getElementById('envFechaArchivoV2')?.value || new Date().toISOString().slice(0,10);
  const fechaTxt = fechaLegibleLarga(fechaISO);
  const esAbono  = document.getElementById('envEsAbonoV2')?.value === 'si';
  const mesLabel = cl__envContext.mesLabel;
  const nombre   = cl__envContext.especialista;

  const parrafoPago = esAbono
    ? `Nos permitimos informar que se ha realizado un abono correspondiente a sus honorarios profesionales del periodo ${mesLabel}, efectuado en la fecha ${fechaTxt}.`
    : `Nos permitimos informar que el pago correspondiente a sus honorarios profesionales del periodo ${mesLabel} ha sido realizado exitosamente en la fecha ${fechaTxt}.`;

  document.getElementById('envMensajeV2').value =
`Estimado Dr. ${nombre}, cordial saludo.

${parrafoPago}

Adjunto remitimos el comprobante de egreso con la información correspondiente para su validación y control.

Agradecemos su compromiso, profesionalismo y valioso apoyo en la prestación de servicios.`;
};

window.cl_envActualizarNombreAdjunto = () => {
  if (!cl__envContext) return;
  const fecha = document.getElementById('envFechaArchivoV2')?.value || new Date().toISOString().slice(0,10);
  const nombreLimpio = cl__envContext.especialista.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g,'').replace(/\s+/g,'_');
  document.getElementById('envAdjuntoV2').textContent = `Comprobante_Egreso_${nombreLimpio}_${fecha}.pdf`;
  // La fecha también debe reflejarse en el mensaje (sincronización total)
  cl_envActualizarMensaje();
};

function cl_generarAdjuntoFila(fila, tablaNombre, fechaEmisionISO) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('jsPDF no disponible. Recarga la página.');

  const fmtV = v => '$ ' + (Number(v)||0).toLocaleString('es-CO');
  const navy = [26, 58, 107];

  const pdf = new jsPDF({ unit:'mm', format:'letter' });
  const W = 216, M = 14;
  let y = 16;

  // ── Encabezado ──
  // Logo UROEXPERTOS — esquina superior izquierda (título queda a la derecha)
  try {
    const logoW = 46, logoH = logoW / 3.05; // mantiene proporción
    pdf.addImage(UROEXPERTOS_LOGO_B64, 'JPEG', M, 8, logoW, logoH);
  } catch(e) { /* si falla el logo, el PDF sigue generándose */ }
  pdf.setFont('courier','bold'); pdf.setFontSize(13); pdf.setTextColor(...navy);
  pdf.text('COMPROBANTE DE EGRESO', W-M, y, {align:'right'});
  y += 6;
  pdf.setFontSize(9); pdf.setFont('courier','normal'); pdf.setTextColor(60);
  // Fecha de Emisión: usa la fecha del formulario de envío (campo "Fecha del archivo adjunto").
  // Si no se provee, usa la fecha de hoy. Se formatea "YYYY-MM-DD" → "DD/MM/YYYY".
  const fechaEmisionTxt = fechaEmisionISO
    ? fmtFechaLegible(fechaEmisionISO)
    : new Date().toLocaleDateString('es-CO');
  pdf.text(`Fecha de Emisión: ${fechaEmisionTxt}`, W-M, y, {align:'right'});
  y += 4;
  pdf.setDrawColor(...navy); pdf.setLineWidth(0.8);
  pdf.line(M, y, W-M, y);
  y += 8;

  // Helper: section header bar
  const secHead = (titulo) => {
    pdf.setFillColor(...navy);
    pdf.rect(M, y-4.5, W-2*M, 6.5, 'F');
    pdf.setFont('courier','bold'); pdf.setFontSize(8.5); pdf.setTextColor(255);
    pdf.text(titulo, M+2, y);
    y += 7;
  };
  // Helper: field row
  const fieldRow = (label, value, bold=false) => {
    pdf.setFont('courier', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(40);
    pdf.text(label, M+2, y);
    pdf.setFont('courier', bold?'bold':'normal'); pdf.setTextColor(17);
    pdf.text(String(value||'—'), M+58, y);
    pdf.setDrawColor(190); pdf.setLineWidth(0.2);
    pdf.line(M+56, y+1, W-M-2, y+1);
    y += 6;
  };
  // Helper: money row (right aligned)
  const moneyRow = (label, value) => {
    pdf.setFont('courier','normal'); pdf.setFontSize(8.5); pdf.setTextColor(40);
    pdf.text(label, M+2, y);
    pdf.setTextColor(17);
    pdf.text(fmtV(value), W-M-2, y, {align:'right'});
    pdf.setDrawColor(220); pdf.setLineWidth(0.2);
    pdf.line(M+2, y+1.5, W-M-2, y+1.5);
    y += 6;
  };

  // ── Información del beneficiario ──
  secHead('INFORMACIÓN DEL BENEFICIARIO');
  fieldRow('Nombre:', fila.nombre, true);
  y += 2;

  // ── Información del servicio ──
  secHead('INFORMACIÓN DEL SERVICIO');
  fieldRow('IPS:', tablaNombre);
  fieldRow('Mes del Servicio:', mesFilaLabel(fila.mes));
  fieldRow('N. Factura:', fila.factura);
  y += 2;

  // ── Detalle financiero ──
  secHead('DETALLE FINANCIERO');
  moneyRow('VALOR FACTURA:', fila.valorFactura);
  moneyRow('(-) ABONO', fila.abono);
  moneyRow('(-) GLOSA', fila.glosa);
  moneyRow('(-) RETE FUENTE', fila.reteFuente);
  moneyRow('(-) AFC', fila.afc);
  moneyRow('(-) RESIDENTES', fila.residentes);
  moneyRow('(-) TIQUETES', fila.tiquetes);
  moneyRow('(-) HOTEL', fila.hotel);
  moneyRow('(-) TRANSPORTE', fila.transporte);

  // ── Valor neto a pagar (barra azul) ──
  y += 1;
  pdf.setFillColor(...navy);
  pdf.rect(M, y-4.5, W-2*M, 8, 'F');
  pdf.setFont('courier','bold'); pdf.setFontSize(10); pdf.setTextColor(255);
  pdf.text('VALOR NETO A PAGAR', M+2, y+0.5);
  pdf.text(fmtV(fila.valorPagar), W-M-2, y+0.5, {align:'right'});
  y += 14;

  // ── Firmas ──
  y = Math.max(y, 200);
  const firmaW = (W-2*M-20)/3;
  const firmas = [
    ['Angela Paredes','APROBADO POR'],
    ['Rosa Castellanos','REVISADO POR'],
    ['Angela Paredes','AUTORIZÓ PAGO'],
  ];
  firmas.forEach((f,i) => {
    const fx = M + i*(firmaW+10);
    pdf.setFont('courier','normal'); pdf.setFontSize(8); pdf.setTextColor(17);
    pdf.text(f[0], fx+firmaW/2, y, {align:'center'});
    pdf.setDrawColor(50); pdf.setLineWidth(0.4);
    pdf.line(fx, y+1.5, fx+firmaW, y+1.5);
    pdf.setFontSize(7); pdf.setTextColor(90); pdf.setFont('courier','bold');
    pdf.text(f[1], fx+firmaW/2, y+5.5, {align:'center'});
  });

  // Footer
  pdf.setFont('courier','normal'); pdf.setFontSize(7); pdf.setTextColor(150);
  pdf.text('Documento generado automáticamente — Sistema BOE UroExpertos', W/2, 268, {align:'center'});

  // Return base64 (without the data: prefix)
  return pdf.output('datauristring').split(',')[1];
}

window.cl_enviarCorreoFila = async () => {
  if (!cl__envContext) return;
  const { fila, especialista, correo, tablaNombre } = cl__envContext;

  const asunto  = document.getElementById('envAsuntoV2').value.trim();
  const mensaje = document.getElementById('envMensajeV2').value.trim();
  if (!asunto) { toast('El asunto es obligatorio.','error'); return; }

  const btn = document.getElementById('btnEnviarCorreoV2');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

  try {
    // Fecha del formulario: única fuente para el nombre del archivo Y la Fecha de Emisión del PDF
    const fechaStr = document.getElementById('envFechaArchivoV2')?.value || new Date().toISOString().slice(0,10);
    // Generar adjunto usando esa misma fecha como Fecha de Emisión
    const base64 = cl_generarAdjuntoFila(fila, tablaNombre, fechaStr);
    const nombreLimpio = especialista.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g,'').replace(/\s+/g,'_');
    const attachmentName = `Comprobante_Egreso_${nombreLimpio}_${fechaStr}.pdf`;

    // Llamar a la función serverless
    const resp = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: correo,
        subject: asunto,
        message: mensaje,
        attachmentBase64: base64,
        attachmentName,
      }),
    });

    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || 'Error desconocido');

    // Marcar la fila como enviada en Firestore (botón pasa a verde)
    try {
      const { tablaId, idx } = cl__envContext;
      const tabla = cl_tablasEgreso.find(t=>t.id===tablaId);
      if (tabla) {
        const filas = [...(tabla.filas||[])];
        if (filas[idx]) {
          filas[idx] = { ...filas[idx], correoEnviado: true, correoFecha: new Date().toISOString() };
          await updateDoc(doc(db,'tablasEgreso_v2',tablaId), { filas, updatedAt: serverTimestamp() });
        }
      }
    } catch(e2) { console.warn('No se pudo marcar fila como enviada:', e2); }

    toast('Correo enviado correctamente al especialista.','success');
    closeEnviarModal();
  } catch(e) {
    toast('Error al enviar correo, validar configuración o datos. ('+e.message+')','error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar correo';
  }
};

/* ── Suscripción Firestore UROEXPERTOS 2 (colecciones _v2, empiezan vacías) ── */
let _cl_subscrito = false;
function cl_subscribeEgresos() {
  if (_cl_subscrito) return;
  _cl_subscrito = true;
  onSnapshot(collection(db,'egresos_v2'), snap => {
    cl_egresos = snap.docs.map(d=>({id:d.id,...d.data()}));
    if(document.getElementById('view-uroexpertos2')?.classList.contains('active')){
      cl_renderEgresoTable(); cl_renderCustomTables();
    }
  });
  onSnapshot(collection(db,'tablasEgreso_v2'), snap => {
    const prev = cl_tablasEgreso;
    cl_tablasEgreso = snap.docs.map(d=>{
      const ex = prev.find(t=>t.id===d.id);
      return { id:d.id,...d.data(),
        _selectedIdent: ex?._selectedIdent||'', _selectedIdents: ex?._selectedIdents||[],
        _chkContabilidad: d.data().chkContabilidad||false, _chkFacturacion: d.data().chkFacturacion||false };
    });
    if(document.getElementById('view-uroexpertos2')?.classList.contains('active')){
      cl_renderCustomTables();
    }
  });
}


/* ── Suscripción Firestore ── */
function subscribeTurnos() {
  onSnapshot(collection(db,'turnos'), snap => {
    turnos = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.fecha?.localeCompare(b.fecha));
    if(document.getElementById('view-turnos')?.classList.contains('active')){
      renderTurnos();
      renderTurnosTabla();
    }
  });
}

/* ── Inicializar ── */
function initTurnos() {
  turnosCurrentDate = new Date();
  renderTurnos();
  renderTurnosTabla();
  populateTurnosFilters();
}

function populateTurnosFilters() {
  // Especialistas
  const selEsp = document.getElementById('tfEsp');
  if (selEsp) {
    const esps = [...new Set(doctors.filter(d=>d.especialista).map(d=>d.especialista))].sort();
    selEsp.innerHTML = '<option value="">Todos los especialistas</option>'
      + esps.map(e=>`<option value="${escHtml(e)}">${escHtml(e)}</option>`).join('');
  }
  // Meses
  const selMes = document.getElementById('tfMes');
  if (selMes) {
    selMes.innerHTML = '<option value="">Todos los meses</option>'
      + MESES_TURN.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('');
  }
}

/* ── Navegación — solo mensual ── */
window.turnosNav = (dir) => {
  turnosCurrentDate = new Date(turnosCurrentDate.getFullYear(), turnosCurrentDate.getMonth()+dir, 1);
  renderTurnos();
};
window.turnosHoy = () => { turnosCurrentDate = new Date(); renderTurnos(); };

/* ── Render principal — solo mensual ── */
window.renderTurnos = () => { renderCalMes(); };

/* ── Vista mensual ── */
function renderCalMes() {
  const lbl = document.getElementById('turnosNavLabel');
  const wrap = document.getElementById('turnosCalWrap');
  if (!wrap) return;

  const y = turnosCurrentDate.getFullYear();
  const m = turnosCurrentDate.getMonth();
  if (lbl) lbl.textContent = `${MESES_TURN[m]} ${y}`;

  const firstDay = new Date(y,m,1).getDay();
  const daysInMonth = new Date(y,m+1,0).getDate();
  const today = new Date().toISOString().slice(0,10);

  let html = `<div class="turnos-cal-grid">`;
  DIAS_SEMANA.forEach(d => { html += `<div class="turnos-cal-dow">${d}</div>`; });

  // Días del mes anterior
  const prevDays = new Date(y,m,0).getDate();
  for(let i=firstDay-1; i>=0; i--) {
    html += `<div class="turnos-cal-day other-month"><div class="turnos-day-num">${prevDays-i}</div></div>`;
  }

  // Días del mes actual
  for(let d=1; d<=daysInMonth; d++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === today;
    // Include turnos whose range covers this day
    // On the last day (HASTA), only show REGRESO — not the spanning IDA record
    const covering = turnos.filter(t=>{
      const start = t.fecha||'';
      const end   = t.fechaHasta||t.fecha||'';
      return dateStr >= start && dateStr <= end;
    });
    // If there's a REGRESO record on this exact date, exclude IDA records that merely span through
    const hasRegresoHere = covering.some(t => t.fecha === dateStr && t.trayecto === 'REGRESO');
    const dayTurnos = hasRegresoHere
      ? covering.filter(t => !(t.trayecto === 'IDA' && t.fecha !== dateStr))
      : covering;

    const events = dayTurnos.map(t=>{
      const cls = t.trayecto==='IDA'?'ida':t.trayecto==='REGRESO'?'regreso':'default';
      // Mostrar SOLO nombre del especialista
      const nombre = (t.especialista||'—');
      return `<div class="turnos-cal-event ${cls}"
        onclick="event.stopPropagation();openTurnoModal('${t.id}')"
        title="${escHtml(t.especialista||'')} · ${t.trayecto||''}">
        <span class="cal-ev-name">${escHtml(nombre)}</span>
      </div>`;
    }).join('');

    html += `<div class="turnos-cal-day ${isToday?'today':''}" onclick="openTurnoModal(null,'${dateStr}')">
      <div class="turnos-day-num">${d}</div>
      ${events}
    </div>`;
  }

  // Días del mes siguiente
  const totalCells = firstDay + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for(let d=1; d<=remaining; d++) {
    html += `<div class="turnos-cal-day other-month"><div class="turnos-day-num">${d}</div></div>`;
  }

  html += '</div>';
  wrap.innerHTML = html;
}

/* ── Vista semanal — diseño moderno tipo calendario ejecutivo ── */
function renderCalSemana() {
  const wrap = document.getElementById('turnosCalWrap');
  const lbl  = document.getElementById('turnosNavLabel');
  if (!wrap) return;

  // Inicio de semana (lunes)
  const d0 = new Date(turnosCurrentDate);
  const dow = d0.getDay();
  const diff = d0.getDate() - dow + (dow===0?-6:1);
  d0.setDate(diff);
  const weekStart = new Date(d0);
  const weekEnd   = new Date(d0); weekEnd.setDate(weekEnd.getDate()+6);
  if (lbl) lbl.textContent = `${weekStart.getDate()} ${MESES_TURN[weekStart.getMonth()]} — ${weekEnd.getDate()} ${MESES_TURN[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;

  const days = [];
  for(let i=0;i<7;i++){ const nd=new Date(weekStart); nd.setDate(nd.getDate()+i); days.push(nd); }
  const today = new Date().toISOString().slice(0,10);
  const DIAS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  // Leyenda
  let html = `<div class="wsem-legend">
    <span class="wsem-leg-item"><span class="wsem-dot" style="background:#fb923c"></span> Proceso pendiente</span>
    <span class="wsem-leg-item"><span class="wsem-dot" style="background:#fbbf24"></span> En revisión</span>
    <span class="wsem-leg-item"><span class="wsem-dot" style="background:#4ade80"></span> Listo</span>
    <span class="wsem-leg-item"><span class="wsem-dot" style="background:#60a5fa"></span> Tarea</span>
    <span class="wsem-leg-item"><span class="wsem-dot" style="background:#f87171"></span> Vencido</span>
  </div>`;

  // Grid de columnas
  html += `<div class="wsem-grid">`;

  days.forEach(d=>{
    const ds = d.toISOString().slice(0,10);
    const isT = ds === today;
    const dayNum = d.getDate();
    const dayName = DIAS_SHORT[d.getDay()].toUpperCase();
    const dayTurnos = turnos.filter(t=>t.fecha===ds);

    const eventos = dayTurnos.map(t=>{
      // Color según trayecto o tipo
      const clr = t.trayecto==='REGRESO' ? '#bbf7d0' :
                  t.tipo==='Residente'    ? '#dbeafe' : '#fee2e2';
      const txtClr = t.trayecto==='REGRESO' ? '#166534' :
                     t.tipo==='Residente'   ? '#1e40af' : '#991b1b';
      const badgeClr = t.trayecto==='IDA'    ? '#f97316' :
                       t.trayecto==='REGRESO' ? '#22c55e' : '#94a3b8';
      const badgeTxt = t.trayecto || t.tipo || '';
      return `<div class="wsem-event" style="background:${clr};border-left:3px solid ${badgeClr}"
          onclick="event.stopPropagation();openTurnoModal('${t.id}')"
          title="${escHtml(t.especialista||'')} · ${t.sede||''} · ${t.trayecto||''}">
        <div class="wsem-ev-name" style="color:${txtClr}">${escHtml(t.especialista||'—')}</div>
        ${t.sede?`<div class="wsem-ev-sub">${escHtml(t.sede)}</div>`:''}
        <span class="wsem-ev-badge" style="background:${badgeClr}">${badgeTxt}</span>
      </div>`;
    }).join('');

    const sinEv = !dayTurnos.length ? `<div class="wsem-empty">Sin eventos</div>` : '';

    html += `<div class="wsem-col ${isT?'wsem-today':''}">
      <div class="wsem-col-head ${isT?'wsem-head-today':''}">
        <div class="wsem-day-name">${dayName}</div>
        <div class="wsem-day-num ${isT?'wsem-num-today':''}">${dayNum}</div>
      </div>
      <div class="wsem-col-body" onclick="openTurnoModal(null,'${ds}')">
        ${eventos}${sinEv}
      </div>
    </div>`;
  });

  html += `</div>`;
  wrap.innerHTML = html;
}

/* ── Tabla de registros ── */
window.renderTurnosTabla = () => {
  const container = document.getElementById('turnosCardsContainer');
  const empty     = document.getElementById('turnosEmpty');
  if(!container) return;

  const fEsp   = document.getElementById('tfEsp')?.value||'';
  const fMes   = document.getElementById('tfMes')?.value||'';
  const fHotel = document.getElementById('tfHotel')?.value||'';
  const fTipo  = document.getElementById('tfTipo')?.value||'';
  const fTray  = document.getElementById('tfTray')?.value||'';

  let list = turnos.filter(t =>
    (!fEsp   || t.especialista===fEsp) &&
    (!fMes   || (t.fecha&&new Date(t.fecha+'T12:00').getMonth()+1===Number(fMes))) &&
    (!fHotel || t.hotel===fHotel) &&
    (!fTipo  || t.tipo===fTipo) &&
    (!fTray  || t.trayecto===fTray)
  ).sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||''));

  if(!list.length){ container.innerHTML=''; empty.style.display='flex'; return; }
  empty.style.display='none';

  const fmtV = v => v ? '$ '+Number(v).toLocaleString('es-CO') : '—';

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="turnos-erp-table">
        <thead>
          <!-- Fila de grupos -->
          <tr class="erp-grp-row">
            <th colspan="6" class="erp-grp erp-grp-info">Información del Turno</th>
            <th colspan="9" class="erp-grp erp-grp-tiq">Descuento al Especialista — Tiquetes y Hoteles</th>
            <th colspan="3" class="erp-grp erp-grp-trans">Auditoría y Pago Transporte — Juan Aguirre</th>
            <th colspan="1" class="erp-grp"></th>
          </tr>
          <!-- Fila de columnas -->
          <tr class="erp-col-row">
            <th>Fecha</th><th>Mes</th><th>Día</th>
            <th>Especialista</th><th>Tipo</th><th>Sede</th>
            <th class="col-tiq">Tiquetes</th>
            <th class="col-tiq">Checklist</th>
            <th class="col-tiq">Concepto</th>
            <th class="col-tiq">Vr. Tiquete</th>
            <th class="col-tiq">Hotel</th>
            <th class="col-tiq">Checklist 2</th>
            <th class="col-tiq">Vr. Hotel</th>
            <th class="col-tiq">Residente</th>
            <th class="col-tiq">Vr. Residente</th>
            <th class="col-trans">Trayecto</th>
            <th class="col-trans">Transporte</th>
            <th class="col-trans">Vr. Transporte</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${list.map((t,i)=>{
            const tray = t.trayecto||'';
            const trayCls = tray==='IDA'?'tray-ida':tray==='REGRESO'?'tray-reg':'';
            return `<tr class="erp-row ${i%2===0?'':'erp-row-alt'}">
              <td class="erp-td-date">${t.fecha||'—'}</td>
              <td>${t.mes||'—'}</td>
              <td>${t.dia||'—'}</td>
              <td class="erp-td-esp">${escHtml(t.especialista||'—')}</td>
              <td><span class="erp-badge erp-tipo">${t.tipo||'—'}</span></td>
              <td>${escHtml(t.sede||'—')}</td>
              <td class="col-tiq">${escHtml(t.tiquetes||'—')}</td>
              <td class="col-tiq erp-small">${escHtml(t.checklist1||'—')}</td>
              <td class="col-tiq">${escHtml(t.concepto||'—')}</td>
              <td class="col-tiq erp-money">${fmtV(t.valorTiquete)}</td>
              <td class="col-tiq">${escHtml(t.hotel||'—')}</td>
              <td class="col-tiq erp-small">${escHtml(t.checklist2||'—')}</td>
              <td class="col-tiq erp-money">${fmtV(t.valorHotel)}</td>
              <td class="col-tiq">${escHtml(t.residente||'—')}</td>
              <td class="col-tiq erp-money">${fmtV(t.valorResidente)}</td>
              <td class="col-trans"><span class="erp-tray ${trayCls}">${tray||'—'}</span></td>
              <td class="col-trans erp-small">${escHtml(t.transporte||'—')}</td>
              <td class="col-trans erp-money">${fmtV(t.valorTransporte)}</td>
              <td>
                <div class="tbl-actions">
                  <button class="act-btn edit" onclick="openTurnoModal('${t.id}')"><i class="fa-solid fa-pen"></i></button>
                  <button class="act-btn del"  onclick="deleteTurno('${t.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
};

/* ── Modal ── */
/* ── Multi-picker especialistas ── */
window._selectedEsps = [];

function buildEspPicker(selectedEsps=[]) {
  window._selectedEsps = [...selectedEsps];
  const picker = document.getElementById('turnoEspPicker');
  const tags   = document.getElementById('turnoEspTags');
  if (!picker) return;
  const esps = [...new Set(doctors.filter(d=>d.especialista).map(d=>d.especialista))].sort();
  picker.innerHTML = esps.map(e=>`
    <label class="turno-esp-item ${selectedEsps.includes(e)?'selected':''}">
      <input type="checkbox" value="${escHtml(e)}" ${selectedEsps.includes(e)?'checked':''}
        onchange="toggleEspPick('${escHtml(e)}',this.checked)"/>
      <span>${escHtml(e)}</span>
    </label>`).join('');
  renderEspTags();
}

window.toggleEspPick = (esp, checked) => {
  if (checked) { if (!window._selectedEsps.includes(esp)) window._selectedEsps.push(esp); }
  else { window._selectedEsps = window._selectedEsps.filter(e=>e!==esp); }
  document.querySelectorAll('#turnoEspPicker .turno-esp-item').forEach(el=>{
    const cb = el.querySelector('input');
    el.classList.toggle('selected', window._selectedEsps.includes(cb.value));
  });
  renderEspTags();
};

function renderEspTags() {
  const el = document.getElementById('turnoEspTags');
  if (!el) return;
  el.innerHTML = window._selectedEsps.map(e=>`
    <span class="resp-tag">
      ${escHtml(e.split(' ')[0])}
      <span class="resp-tag-x" onclick="toggleEspPick('${escHtml(e)}',false)">✕</span>
    </span>`).join('');
}

window.openTurnoModal = (id=null, dateStr=null) => {
  editTurnoId = id;
  const t = id ? turnos.find(x=>x.id===id) : null;
  document.getElementById('turnoModalTitle').textContent = id?'Editar Turno':'Nuevo Turno';
  document.getElementById('turnoId').value = id||'';

  const isEdit = !!id;
  // Show multi or single depending on mode
  document.getElementById('espMultiWrap').style.display  = isEdit ? 'none'  : '';
  document.getElementById('espSingleWrap').style.display = isEdit ? ''      : 'none';

  if (isEdit) {
    // Single select for editing
    const selEsp = document.getElementById('tEspecialista');
    const esps = [...new Set(doctors.filter(d=>d.especialista).map(d=>d.especialista))].sort();
    selEsp.innerHTML = '<option value="">— Seleccionar —</option>'
      + esps.map(e=>`<option value="${escHtml(e)}">${escHtml(e)}</option>`).join('');
    selEsp.value = t?.especialista||'';
  } else {
    // Multi-picker for new
    buildEspPicker([]);
  }

  // DESDE / HASTA
  const fecha = t?.fecha || dateStr || new Date().toISOString().slice(0,10);
  document.getElementById('tDesde').value = fecha;
  document.getElementById('tHasta').value = t?.fechaHasta||'';
  onTurnoFechaChange(fecha);

  // Resto de campos
  document.getElementById('tTipo').value          = t?.tipo||'Especialista';
  document.getElementById('tSede').value          = t?.sede||'';
  document.getElementById('tTiquetes').value      = t?.tiquetes||'';
  document.getElementById('tChecklist1').value    = t?.checklist1||'';
  document.getElementById('tConcepto').value      = t?.concepto||'';
  document.getElementById('tValorTiquete').value  = t?.valorTiquete||'';
  document.getElementById('tHotel').value         = t?.hotel||'';
  document.getElementById('tChecklist2').value    = t?.checklist2||'';
  document.getElementById('tValorHotel').value    = t?.valorHotel||'';
  document.getElementById('tResidente').value     = t?.residente||'';
  document.getElementById('tValorResidente').value= t?.valorResidente||'';
  document.getElementById('tTransporte').value    = t?.transporte||'JUAN AGUIRRE / UROEXPERTOS';
  document.getElementById('tValorTransporte').value = t?.valorTransporte||'';
  document.getElementById('tTrayecto').value      = t?.trayecto||'';

  // Observación
  document.getElementById('tObservacion').value = t?.observacion||'';

  // Residente
  const esRes = !!(t?.esResidente);
  document.getElementById('tEsResidente').checked = esRes;
  document.getElementById('tResidenteClienteWrap').style.display = esRes ? 'block' : 'none';
  if (esRes) {
    const sel = document.getElementById('tResidenteCliente');
    const opts = doctors.filter(d=>d.especialista).map(d =>
      `<option value="${escHtml(d.id)}" ${t?.residenteClienteId===d.id?'selected':''}>${escHtml(d.especialista)}</option>`
    ).join('');
    sel.innerHTML = '<option value="">— Seleccionar cliente —</option>' + opts;
    sel.value = t?.residenteClienteId||'';
  }

  document.getElementById('turnoModal').classList.add('open');
};

window.closeTurnoModal = () => document.getElementById('turnoModal').classList.remove('open');

/* ── Residente toggle ── */
window.onTurnoResidenteChange = () => {
  const checked = document.getElementById('tEsResidente').checked;
  const wrap    = document.getElementById('tResidenteClienteWrap');
  const sel     = document.getElementById('tResidenteCliente');
  if (!wrap) return;
  wrap.style.display = checked ? 'block' : 'none';
  if (checked && sel) {
    // Populate with clients
    const opts = doctors.filter(d=>d.especialista).map(d =>
      `<option value="${escHtml(d.id)}">${escHtml(d.especialista)}</option>`
    ).join('');
    sel.innerHTML = '<option value="">— Seleccionar cliente —</option>' + opts;
  }
};

/* ── Fecha → Mes/Día auto ── */
function onTurnoFechaChange(fStr) {
  const desde = fStr || document.getElementById('tDesde').value;
  if (!desde) return;
  const d = new Date(desde+'T12:00');
  document.getElementById('tMes').value = MESES_TURN[d.getMonth()];
  renderTurnoRangeStrip();
}

window.onTurnoHastaChange = () => renderTurnoRangeStrip();

function renderTurnoRangeStrip() {
  const strip = document.getElementById('turnoRangeStrip');
  if (!strip) return;
  const desde = document.getElementById('tDesde').value;
  const hasta = document.getElementById('tHasta').value;
  if (!desde) { strip.innerHTML = '<span style="color:var(--gray-3);font-size:12px">Selecciona Desde y Hasta para ver el rango</span>'; return; }

  const DIAS_SHORT = ['D','L','M','M','J','V','S'];
  const DIAS_NOM   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const start = new Date(desde+'T12:00');
  const end   = hasta ? new Date(hasta+'T12:00') : start;

  // Build list of days in range
  const days = [];
  let cur = new Date(start);
  while (cur <= end && days.length < 35) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate()+1);
  }

  strip.innerHTML = days.map((d,i) => {
    const isFirst = i===0;
    const isLast  = i===days.length-1 && days.length>1;
    const cls = isFirst ? 'range-day-start' : isLast ? 'range-day-end' : 'range-day-mid';
    const label = isFirst ? 'IDA' : isLast ? 'REG' : '';
    return `<div class="range-day ${cls}" title="${d.toLocaleDateString('es-CO')}">
      <div class="range-dow">${DIAS_SHORT[d.getDay()]}</div>
      <div class="range-num">${d.getDate()}</div>
      ${label?`<div class="range-tag">${label}</div>`:''}
    </div>`;
  }).join('');
}

/* ── Especialista → trayecto auto ── */
window.onTurnoEspChange = () => {
  // no-op for now — trayecto set via DESDE/HASTA
};

/* ── Hotel → valor auto ── */
window.onTurnoHotelChange = () => {
  const hotel = document.getElementById('tHotel').value;
  if (hotel === 'BARBACOA') document.getElementById('tValorHotel').value = 82000;
};

/* ── Calcular trayecto (IDA / REGRESO) ── */
function calcTrayecto(especialista, fecha) {
  if (!especialista || !fecha) return 'IDA';
  // Obtener todos los turnos del especialista ordenados por fecha
  const myTurnos = turnos
    .filter(t => t.especialista===especialista && t.id !== editTurnoId)
    .map(t => t.fecha)
    .sort();

  if (!myTurnos.length) return 'IDA';

  // Buscar el turno anterior más cercano
  const prev = myTurnos.filter(f=>f<fecha).pop();
  if (!prev) return 'IDA';

  // Si el anterior fue IDA → este es REGRESO, y viceversa
  const prevTurno = turnos.find(t=>t.especialista===especialista && t.fecha===prev);
  if (!prevTurno) return 'IDA';
  return prevTurno.trayecto === 'IDA' ? 'REGRESO' : 'IDA';
}

/* ── Guardar ── */
window.saveTurno = async () => {
  const desde  = document.getElementById('tDesde').value;
  const hasta  = document.getElementById('tHasta').value;
  if (!desde) { toast('La fecha Desde es obligatoria.','error'); return; }

  // Build base data
  const baseData = () => ({
    tipo:   document.getElementById('tTipo').value,
    sede:   document.getElementById('tSede').value.trim(),
    observacion:        document.getElementById('tObservacion')?.value.trim()||'',
    esResidente:        document.getElementById('tEsResidente')?.checked||false,
    residenteClienteId: document.getElementById('tResidenteCliente')?.value||'',
    tiquetes:       document.getElementById('tTiquetes').value.trim(),
    checklist1:     document.getElementById('tChecklist1').value,
    concepto:       document.getElementById('tConcepto').value.trim(),
    valorTiquete:   Number(document.getElementById('tValorTiquete').value)||0,
    hotel:          document.getElementById('tHotel').value,
    checklist2:     document.getElementById('tChecklist2').value,
    valorHotel:     Number(document.getElementById('tValorHotel').value)||0,
    residente:      document.getElementById('tResidente').value.trim(),
    valorResidente: Number(document.getElementById('tValorResidente').value)||0,
    transporte:     document.getElementById('tTransporte').value.trim(),
    valorTransporte: document.getElementById('tValorTransporte').value
                       ? Number(document.getElementById('tValorTransporte').value) : null,
    updatedAt:      serverTimestamp(),
  });

  const fmtMesFromDate = d => { const dt=new Date(d+'T12:00'); return MESES_TURN[dt.getMonth()]; };
  const fmtDiaFromDate = d => { const dt=new Date(d+'T12:00'); return DIAS_FULL[dt.getDay()]; };

  try {
    if (editTurnoId) {
      // Edit: single record
      const esp = document.getElementById('tEspecialista').value;
      if (!esp) { toast('Selecciona un especialista.','error'); return; }
      const data = {...baseData(), fecha:desde, fechaHasta:hasta, especialista:esp,
        trayecto: document.getElementById('tTrayecto').value };
      await updateDoc(doc(db,'turnos',editTurnoId), data);
      toast('Turno actualizado.','success');
    } else {
      // New: multi-especialista × IDA + REGRESO
      const esps = window._selectedEsps||[];
      if (!esps.length) { toast('Selecciona al menos un especialista.','error'); return; }
      // Create IDA + REGRESO records per especialista
      const records = [];
      esps.forEach(esp => {
        // IDA = DESDE
        records.push({...baseData(), createdAt:serverTimestamp(),
          fecha:desde, fechaHasta:hasta||desde, especialista:esp,
          trayecto:'IDA', mes:fmtMesFromDate(desde), dia:fmtDiaFromDate(desde),
        });
        // REGRESO = HASTA (only if different date)
        if (hasta && hasta !== desde) {
          records.push({...baseData(), createdAt:serverTimestamp(),
            fecha:hasta, fechaHasta:hasta, especialista:esp,
            trayecto:'REGRESO', mes:fmtMesFromDate(hasta), dia:fmtDiaFromDate(hasta),
          });
        }
      });
      await Promise.all(records.map(r => addDoc(collection(db,'turnos'),r)));
      const n = records.length;
      toast(`${n} registro${n>1?'s creados':' creado'}.`,'success');
    }
    closeTurnoModal();
  } catch(e) { toast('Error: '+e.message,'error'); }
};

window.deleteTurno = async (id) => {
  if (!confirm('¿Eliminar este turno?')) return;
  try { await deleteDoc(doc(db,'turnos',id)); toast('Turno eliminado.'); }
  catch(e) { toast('Error: '+e.message,'error'); }
};

window.initTurnos = initTurnos;

/* ══════════════════════════════════════════════════
   TURNOS — Imprimir con selección de meses
══════════════════════════════════════════════════ */

window.openPrintTurnosModal = () => {
  // Marcar mes actual por defecto
  const now = new Date();
  document.querySelectorAll('#printMonthsGrid input[type=checkbox]').forEach(cb=>{
    cb.checked = parseInt(cb.value) === now.getMonth()+1;
  });
  document.getElementById('printTurnosAnio').value = String(now.getFullYear());
  document.getElementById('printTurnosModal').classList.add('open');
};

window.closePrintTurnosModal = () =>
  document.getElementById('printTurnosModal').classList.remove('open');

window.imprimirTurnosMesActual = () => {
  const d    = new Date(turnosCurrentDate);
  const anio = d.getFullYear();
  const mes  = d.getMonth() + 1; // 1-12
  const mesesNombres = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const diasSem = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const fmtV  = v => v ? '$ '+Number(v).toLocaleString('es-CO') : '—';

  const firstDay    = new Date(anio, mes-1, 1).getDay();
  const daysInMonth = new Date(anio, mes, 0).getDate();
  const today       = new Date().toISOString().slice(0,10);

  // ── Construir HTML del calendario ──
  let calHtml = `<div class="tp-head">${mesesNombres[mes].toUpperCase()} ${anio} — CUADRO DE TURNOS</div>
  <div class="tp-grid">`;

  diasSem.forEach(d => { calHtml += `<div class="tp-dow">${d}</div>`; });

  for(let i=0;i<firstDay;i++) calHtml += `<div class="tp-day tp-other"></div>`;

  for(let dd=1;dd<=daysInMonth;dd++){
    const ds = `${anio}-${String(mes).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
    // Range filter: show turno on every day it covers
    const coveringT = turnos.filter(t=>{
      const s=t.fecha||'', e=t.fechaHasta||t.fecha||'';
      return ds>=s && ds<=e;
    }).sort((a,b)=>(a.especialista||'').localeCompare(b.especialista||''));
    // On HASTA day: only show REGRESO, not the spanning IDA
    const hasRegT = coveringT.some(t=>t.fecha===ds&&t.trayecto==='REGRESO');
    const dayT = hasRegT
      ? coveringT.filter(t=>!(t.trayecto==='IDA'&&t.fecha!==ds))
      : coveringT;
    const isToday = ds === today;
    const evHtml = dayT.map(t=>{
      const cls = t.trayecto==='REGRESO'?'tp-ev-reg':'tp-ev-ida';
      const info = t.especialista || '';
      return `<div class="tp-ev ${cls}">${escHtml(info)}</div>`;
    }).join('');
    calHtml += `<div class="tp-day${isToday?' tp-today':''}">
      <div class="tp-num">${dd}</div>${evHtml}
    </div>`;
  }

  const total = firstDay + daysInMonth;
  const rem   = (7-(total%7))%7;
  for(let i=0;i<rem;i++) calHtml += `<div class="tp-day tp-other"></div>`;
  calHtml += `</div>`;

  // ── Construir tabla de registros del mes ──
  const mesT = turnos.filter(t=>t.fecha&&
    new Date(t.fecha+'T12:00').getFullYear()===anio&&
    new Date(t.fecha+'T12:00').getMonth()===mes-1
  ).sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||''));

  let tablaHtml = '';
  if(mesT.length){
    tablaHtml = `<div class="tp-rec-title">REGISTROS DE TURNOS — ${mesesNombres[mes].toUpperCase()} ${anio}</div>
    <table class="tp-table">
      <thead>
        <tr>
          <th>Fecha</th><th>Especialista</th><th>Tipo</th><th>Sede</th>
          <th>Hotel</th><th>Vr. Hotel</th><th>Vr. Tiquete</th>
          <th>Trayecto</th><th>Transporte</th><th>Vr. Transporte</th>
        </tr>
      </thead>
      <tbody>
        ${mesT.map((t,i)=>`<tr class="${i%2===0?'':'tp-alt'}">
          <td>${t.fecha||'—'}</td>
          <td style="font-weight:700">${escHtml(t.especialista||'—')}</td>
          <td>${t.tipo||'—'}</td>
          <td>${escHtml(t.sede||'—')}</td>
          <td>${escHtml(t.hotel||'—')}</td>
          <td class="tp-money">${fmtV(t.valorHotel)}</td>
          <td class="tp-money">${fmtV(t.valorTiquete)}</td>
          <td style="font-weight:700;color:${t.trayecto==='IDA'?'#1565c0':'#2e7d32'}">${t.trayecto||'—'}</td>
          <td>${escHtml(t.transporte||'—')}</td>
          <td class="tp-money">${fmtV(t.valorTransporte)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }

  // ── Insertar en zona imprimible del DOM ──
  const zone = document.getElementById('turnosPrintZone');
  zone.innerHTML = calHtml;

  if (!zone.innerHTML.trim()) {
    toast('No se generó contenido para imprimir.', 'error');
    return;
  }

  // ── Imprimir con clase de scope ──
  document.body.classList.add('printing-turnos');
  setTimeout(() => {
    window.print();
  }, 300);
  window.onafterprint = () => {
    document.body.classList.remove('printing-turnos');
    zone.innerHTML = '';
    window.onafterprint = null;
  };
  // Fallback limpieza
  setTimeout(() => {
    document.body.classList.remove('printing-turnos');
    zone.innerHTML = '';
  }, 5000);
};


/* ══ EXPORTAR FACTURACIÓN MENSUAL ══ */
window.exportarFacturacionMensualExcel = () => {
  if (!window.XLSX) { toast('SheetJS no disponible.','error'); return; }
  if (!egresos.length) { toast('Sin datos para exportar.','error'); return; }

  const fmtNum = v => v ? Number(v) : 0;
  const rows = [];

  egresos.forEach(e => {
    // Fila madre
    rows.push([
      e.honorarioMes||'', e.concepto||'', e.nombre||'',
      fmtNum(e.valorEntidad), fmtNum(e.administracion),
      fmtNum(e.valorEspecialista), e.factura||'', 'MADRE', ''
    ]);
    // Filas hijas
    (e.hijas||[]).forEach(h => {
      rows.push([
        h.honorarioMes||'', h.concepto||'', h.nombre||'',
        fmtNum(h.valorEntidad), fmtNum(h.administracion),
        fmtNum(h.valorEspecialista), h.factura||'', 'HIJA', e.factura||''
      ]);
    });
  });

  const headers = [
    'HONORARIO MES','CONCEPTO','NOMBRE',
    'VALOR ENTIDAD','ADMINISTRACIÓN','VALOR ESPECIALISTA',
    'FACTURA','TIPO','FACTURA MADRE'
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = [{wch:12},{wch:28},{wch:22},{wch:14},{wch:14},{wch:16},{wch:14},{wch:8},{wch:14}];
  // Negrita encabezado
  const range = XLSX.utils.decode_range(ws['!ref']||'A1');
  for(let C=range.s.c;C<=range.e.c;C++){
    const cell = XLSX.utils.encode_cell({r:0,c:C});
    if(ws[cell]) ws[cell].s = {font:{bold:true}};
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Facturación Mensual');
  XLSX.writeFile(wb, `Facturacion_Mensual_${new Date().toISOString().slice(0,7)}.xlsx`);
  toast('✅ Excel exportado.','success');
};
/* ══════════════════════════════════════════════════
   EXPORTAR TABLA HIJA A EXCEL
══════════════════════════════════════════════════ */
window.exportarTablaExcel = (tablaId) => {
  if (!window.XLSX) { toast('SheetJS no disponible. Recarga la página.','error'); return; }

  const tabla = tablasEgreso.find(t=>t.id===tablaId);
  if (!tabla) { toast('Tabla no encontrada.','error'); return; }

  const allFilas = tabla.filas||[];
  const selIdent = tabla._selectedIdent||'';
  const filas = selIdent ? allFilas.filter(f=>f.identId===selIdent) : allFilas;
  if (!filas.length) { toast('La tabla no tiene filas para exportar.','error'); return; }

  const fmtNum = v => v ? Number(v) : 0;

  // Encabezados
  const headers = [
    'FACTURA','MES','NOMBRE ESPECIALISTA','TIPO DE PERSONA','VALOR FACTURA',
    'ABONO','GLOSA','RETE FUENTE','AFC','RESIDENTES',
    'TIQUETES','HOTEL','TRANSPORTE','VALOR A PAGAR'
  ];

  // Filas de datos
  const rows = filas.map(f=>[
    f.factura     || '',
    f.mes         || '',
    f.nombre      || '',
    f.tipoPersona || '',
    fmtNum(f.valorFactura),
    fmtNum(f.abono),
    fmtNum(f.glosa),
    fmtNum(f.reteFuente),
    fmtNum(f.afc),
    fmtNum(f.residentes),
    fmtNum(f.tiquetes),
    fmtNum(f.hotel),
    fmtNum(f.transporte),
    fmtNum(f.valorPagar),
  ]);

  // Fila de totales
  const totales = [
    'TOTAL','','','',
    filas.reduce((s,f)=>s+fmtNum(f.valorFactura),0),
    filas.reduce((s,f)=>s+fmtNum(f.abono),0),
    filas.reduce((s,f)=>s+fmtNum(f.glosa),0),
    filas.reduce((s,f)=>s+fmtNum(f.reteFuente),0),
    filas.reduce((s,f)=>s+fmtNum(f.afc),0),
    filas.reduce((s,f)=>s+fmtNum(f.residentes),0),
    filas.reduce((s,f)=>s+fmtNum(f.tiquetes),0),
    filas.reduce((s,f)=>s+fmtNum(f.hotel),0),
    filas.reduce((s,f)=>s+fmtNum(f.transporte),0),
    filas.reduce((s,f)=>s+fmtNum(f.valorPagar),0),
  ];

  const wsData = [headers, ...rows, totales];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Estilo de anchos de columna
  ws['!cols'] = [
    {wch:14},{wch:10},{wch:22},{wch:14},
    {wch:14},{wch:12},{wch:12},{wch:13},{wch:10},{wch:12},
    {wch:12},{wch:12},{wch:14},{wch:14}
  ];

  // Aplicar negrita al encabezado y totales via estilos si están disponibles
  const range = XLSX.utils.decode_range(ws['!ref']);
  // Encabezado (fila 0) — bold
  for(let C=range.s.c; C<=range.e.c; C++){
    const hCell = XLSX.utils.encode_cell({r:0,c:C});
    if(!ws[hCell]) continue;
    ws[hCell].s = {font:{bold:true}, fill:{fgColor:{rgb:'1A3A6B'}}, alignment:{horizontal:'center'}};
  }
  // Fila de totales — bold
  const lastRow = wsData.length - 1;
  for(let C=range.s.c; C<=range.e.c; C++){
    const tCell = XLSX.utils.encode_cell({r:lastRow,c:C});
    if(!ws[tCell]) continue;
    ws[tCell].s = {font:{bold:true}, fill:{fgColor:{rgb:'EEF4FF'}}};
  }

  // Crear workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tabla.nombre.slice(0,31));

  // Nombre del archivo dinámico
  const nombreLimpio = tabla.nombre.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g,'').replace(/\s+/g,'_').toUpperCase();
  const fecha = new Date().toISOString().slice(0,7); // YYYY-MM
  const fileName = `${nombreLimpio}_${fecha}.xlsx`;

  XLSX.writeFile(wb, fileName);
  toast(`✅ Exportado: ${fileName}`,'success');
};

/* ══════════════════════════════════════════════════
   CHECKLIST MENSUAL — INFORMES Y SEGURIDAD SOCIAL
══════════════════════════════════════════════════ */

const CHK_COLS  = ['dayana','santiago','envios','ibc'];
const MESES_CHK = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

let chkMesActual = '';
let chkUnsubscribe = null;

/* ── Helpers ── */
function chkMesLabel(key) {
  if (!key) return '';
  const [y,m] = key.split('-');
  return `${MESES_CHK[parseInt(m)-1]} ${y}`;
}
function chkMesAnterior() {
  const d = new Date();
  d.setDate(1); d.setMonth(d.getMonth()-1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function chkKey(nombre) {
  return nombre.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'_').slice(0,40);
}
/* ═══════════════════════════════════════════════════════════════
   CUADRO DE TURNOS 2 — copia independiente de Cuadro de Turnos
   Colección propia: turnos_v2 (empieza vacía)
   Funciones ct_*, IDs *T2, estado ct_*.
═══════════════════════════════════════════════════════════════ */
let ct_turnos = [];
let ct_turnosCurrentDate = new Date();
let ct_editTurnoId = null;
let ct_sedes = [];   // [{id, nombre, ciudad, logo(base64), sigla}] — catálogo propio de la vista copia

/* Festivos de Colombia (fijos + calculados). Clave: 'MM-DD' o fecha exacta 'YYYY-MM-DD'. */
const CT_FESTIVOS_FIJOS = {
  '01-01':'Año Nuevo', '05-01':'Día del Trabajo', '07-20':'Día de la Independencia',
  '08-07':'Batalla de Boyacá', '12-08':'Inmaculada Concepción', '12-25':'Navidad',
};
/* Festivos que se trasladan al lunes (Ley Emiliani) y móviles por año — tabla 2026 */
const CT_FESTIVOS_POR_ANIO = {
  2026: {
    '01-01':'Año Nuevo','01-12':'Día de los Reyes Magos','03-23':'Día de San José',
    '03-29':'Domingo de Ramos','04-02':'Jueves Santo','04-03':'Viernes Santo',
    '05-01':'Día del Trabajo','05-18':'Día de la Ascensión','06-08':'Corpus Christi',
    '06-15':'Sagrado Corazón','06-29':'San Pedro y San Pablo','07-20':'Día de la Independencia',
    '08-07':'Batalla de Boyacá','08-17':'Asunción de la Virgen','10-12':'Día de la Raza',
    '11-02':'Todos los Santos','11-16':'Independencia de Cartagena','12-08':'Inmaculada Concepción',
    '12-25':'Navidad',
  },
};
/* Devuelve el nombre del festivo para una fecha 'YYYY-MM-DD', o null */
function ct_festivoDe(dateStr){
  const [y,mm,dd] = dateStr.split('-');
  const anio = Number(y);
  const md = `${mm}-${dd}`;
  if (CT_FESTIVOS_POR_ANIO[anio] && CT_FESTIVOS_POR_ANIO[anio][md]) return CT_FESTIVOS_POR_ANIO[anio][md];
  return null;
}

async function ct_cargarSedes(){
  try {
    const snap = await getDocs(collection(db,'sedes_v2'));
    ct_sedes = snap.docs.map(d=>({id:d.id,...d.data()}));
  } catch(e){ ct_sedes = []; }
}
function ct_sedePorNombre(nombre){
  if (!nombre) return null;
  const n = nombre.trim().toLowerCase();
  return ct_sedes.find(s => (s.nombre||'').trim().toLowerCase() === n) || null;
}
function ct_siglaDe(nombre){
  if (!nombre) return '';
  return nombre.trim().split(/\s+/).map(w=>w[0]).join('').slice(0,3).toUpperCase();
}

/* ── GESTIÓN DE SEDES (catálogo con logo, ciudad) ── */
window.ct_openSedesModal = () => {
  ct_renderSedesList();
  document.getElementById('ctSedesModal')?.classList.add('open');
};
window.ct_closeSedesModal = () => document.getElementById('ctSedesModal')?.classList.remove('open');

function ct_renderSedesList(){
  const cont = document.getElementById('ctSedesList');
  if (!cont) return;
  if (!ct_sedes.length){
    cont.innerHTML = '<div style="color:var(--gray-3);font-size:13px;padding:12px">Sin sedes. Agrega la primera.</div>';
    return;
  }
  const sedesOrd = ct_sedes.slice().sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es',{sensitivity:'base'}));
  cont.innerHTML = sedesOrd.map(s=>`
    <div class="ct-sede-item">
      <div class="ct-sede-logo">${s.logo?`<img src="${s.logo}" alt=""/>`:`<span class="ct-sede-sigla">${escHtml(s.sigla||ct_siglaDe(s.nombre))}</span>`}</div>
      <div class="ct-sede-info">
        <div class="ct-sede-nombre">${escHtml(s.nombre||'')}</div>
        <div class="ct-sede-ciudad">${escHtml(s.ciudad||'—')}</div>
      </div>
      <div class="ct-sede-acts">
        <label class="ct-sede-upload" title="Subir logo"><i class="fa-solid fa-image"></i>
          <input type="file" accept="image/*" style="display:none" onchange="ct_subirLogoSede('${s.id}',this)"/>
        </label>
        <button onclick="ct_editarSede('${s.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
        <button onclick="ct_eliminarSede('${s.id}')" title="Eliminar" class="del"><i class="fa-solid fa-trash"></i></button>
      </div>
    </div>`).join('');
}

window.ct_agregarSede = async () => {
  const nombre = document.getElementById('ctSedeNombre')?.value.trim();
  const ciudad = document.getElementById('ctSedeCiudad')?.value.trim();
  if (!nombre) { toast('Escribe el nombre de la sede.','error'); return; }
  try {
    await addDoc(collection(db,'sedes_v2'), { nombre, ciudad:ciudad||'', logo:'', sigla:ct_siglaDe(nombre), createdAt:serverTimestamp() });
    document.getElementById('ctSedeNombre').value='';
    document.getElementById('ctSedeCiudad').value='';
    await ct_cargarSedes();
    ct_renderSedesList();
    ct_poblarSelectSede();
    toast('Sede agregada.','success');
  } catch(e){ toast('Error: '+e.message,'error'); }
};

window.ct_editarSede = async (id) => {
  const s = ct_sedes.find(x=>x.id===id); if(!s) return;
  const nombre = prompt('Nombre de la sede:', s.nombre||''); if(nombre===null) return;
  const ciudad = prompt('Ciudad:', s.ciudad||''); if(ciudad===null) return;
  try {
    await updateDoc(doc(db,'sedes_v2',id), { nombre:nombre.trim(), ciudad:ciudad.trim(), sigla:ct_siglaDe(nombre.trim()) });
    await ct_cargarSedes(); ct_renderSedesList(); ct_poblarSelectSede();
    ct_renderTurnos();
    toast('Sede actualizada.','success');
  } catch(e){ toast('Error: '+e.message,'error'); }
};

window.ct_eliminarSede = async (id) => {
  const s = ct_sedes.find(x=>x.id===id); if(!s) return;
  if (!confirm(`¿Eliminar la sede "${s.nombre}"? Los turnos que la usan conservarán el nombre pero perderán el logo.`)) return;
  try {
    await deleteDoc(doc(db,'sedes_v2',id));
    await ct_cargarSedes(); ct_renderSedesList(); ct_poblarSelectSede(); ct_renderTurnos();
    toast('Sede eliminada.','success');
  } catch(e){ toast('Error: '+e.message,'error'); }
};

window.ct_subirLogoSede = (id, input) => {
  const file = input.files[0]; if(!file) return;
  if (file.size > 900*1024) { toast('Imagen muy grande (máx 900KB).','error'); return; }
  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      await updateDoc(doc(db,'sedes_v2',id), { logo: ev.target.result });
      await ct_cargarSedes(); ct_renderSedesList(); ct_renderTurnos();
      toast('Logo actualizado.','success');
    } catch(e){ toast('Error al guardar logo: '+e.message,'error'); }
  };
  reader.readAsDataURL(file);
};

/* Poblar el <select> de sede en el modal de turno */
function ct_poblarSelectSede(){
  const sel = document.getElementById('tSedeT2');
  if (!sel || sel.tagName !== 'SELECT') return;
  const actual = sel.value;
  const sedesOrd = ct_sedes.slice().sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es',{sensitivity:'base'}));
  sel.innerHTML = '<option value="">— Seleccionar sede —</option>'
    + sedesOrd.map(s=>`<option value="${escHtml(s.nombre)}">${escHtml(s.nombre)}${s.ciudad?' · '+escHtml(s.ciudad):''}</option>`).join('');
  if (actual) sel.value = actual;
}

function ct_initTurnos() {
  ct_turnosCurrentDate = new Date();
  ct_cargarSedes().then(()=>{ ct_renderTurnos(); ct_poblarSelectSede(); });
  ct_renderTurnos();
  ct_renderTurnosTabla();
  ct_populateTurnosFilters();
}

function ct_populateTurnosFilters() {
  // Especialistas
  const selEsp = document.getElementById('tfEspT2');
  if (selEsp) {
    const esps = [...new Set(doctors.filter(d=>d.especialista).map(d=>d.especialista))].sort();
    selEsp.innerHTML = '<option value="">Todos los especialistas</option>'
      + esps.map(e=>`<option value="${escHtml(e)}">${escHtml(e)}</option>`).join('');
  }
  // Meses
  const selMes = document.getElementById('tfMesT2');
  if (selMes) {
    selMes.innerHTML = '<option value="">Todos los meses</option>'
      + MESES_TURN.map((m,i)=>`<option value="${i+1}">${m}</option>`).join('');
  }
}

window.ct_turnosNav = (dir) => {
  ct_turnosCurrentDate = new Date(ct_turnosCurrentDate.getFullYear(), ct_turnosCurrentDate.getMonth()+dir, 1);
  ct_renderTurnos();
};

window.ct_turnosHoy = () => { ct_turnosCurrentDate = new Date(); ct_renderTurnos(); };

window.ct_renderTurnos = () => { ct_renderCalMes(); };

function ct_renderCalMes() {
  const lbl = document.getElementById('turnosNavLabelT2');
  const wrap = document.getElementById('turnosCalWrapT2');
  if (!wrap) return;

  const y = ct_turnosCurrentDate.getFullYear();
  const m = ct_turnosCurrentDate.getMonth();
  if (lbl) lbl.textContent = `${MESES_TURN[m]} ${y}`;

  const firstDay = new Date(y,m,1).getDay();
  const daysInMonth = new Date(y,m+1,0).getDate();
  const today = new Date().toISOString().slice(0,10);

  // ── Detección de cruces: mismo especialista en 2+ sedes distintas el mismo día ──
  const crucesPorDia = {};   // dateStr -> Set(especialistas en cruce)
  const porDiaEsp = {};      // dateStr -> { esp -> Set(sedes) }
  ct_turnos.forEach(t=>{
    const f = t.fecha||''; if(!f) return;
    const esp = (t.especialista||'').trim(); if(!esp) return;
    const sede = (t.sede||'').trim();
    porDiaEsp[f] = porDiaEsp[f]||{};
    porDiaEsp[f][esp] = porDiaEsp[f][esp]||new Set();
    if (sede) porDiaEsp[f][esp].add(sede);
  });
  Object.keys(porDiaEsp).forEach(f=>{
    Object.keys(porDiaEsp[f]).forEach(esp=>{
      if (porDiaEsp[f][esp].size >= 2) {
        crucesPorDia[f] = crucesPorDia[f]||new Set();
        crucesPorDia[f].add(esp);
      }
    });
  });

  let html = `<div class="turnos-cal-grid">`;
  DIAS_SEMANA.forEach(d => { html += `<div class="turnos-cal-dow">${d}</div>`; });

  const prevDays = new Date(y,m,0).getDate();
  for(let i=firstDay-1; i>=0; i--) {
    html += `<div class="turnos-cal-day other-month"><div class="turnos-day-num">${prevDays-i}</div></div>`;
  }

  for(let d=1; d<=daysInMonth; d++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = dateStr === today;
    const festivo = ct_festivoDe(dateStr);
    const tieneCruce = crucesPorDia[dateStr] && crucesPorDia[dateStr].size>0;

    const covering = ct_turnos.filter(t=>{
      const start = t.fecha||'';
      const end   = t.fechaHasta||t.fecha||'';
      return dateStr >= start && dateStr <= end;
    });
    const hasRegresoHere = covering.some(t => t.fecha === dateStr && t.trayecto === 'REGRESO');
    const dayTurnos = hasRegresoHere
      ? covering.filter(t => !(t.trayecto === 'IDA' && t.fecha !== dateStr))
      : covering;

    const events = dayTurnos.map(t=>{
      const esNoDisp = t.servicio === 'No disponible' || t.noDisponible;
      if (esNoDisp) {
        const sigla = ct_siglaDe(t.especialista||'');
        return `<div class="turnos-cal-event nodisp"
          onclick="event.stopPropagation();ct_openTurnoModal('${t.id}')"
          title="${escHtml(t.especialista||'')} · No disponible">
          <span class="cal-ev-sigla">${escHtml(sigla||'—')}</span>
          <span class="cal-ev-serv">No disponible</span>
        </div>`;
      }
      const sede = ct_sedePorNombre(t.sede);
      const servicio = t.servicio || t.tipo || '';
      const logoHtml = sede && sede.logo
        ? `<img class="cal-ev-logo" src="${sede.logo}" alt=""/>`
        : `<span class="cal-ev-siglabox">${escHtml(sede ? (sede.sigla||ct_siglaDe(sede.nombre)) : ct_siglaDe(t.sede||t.especialista||'—'))}</span>`;
      return `<div class="turnos-cal-event sede-ev"
        onclick="event.stopPropagation();ct_openTurnoModal('${t.id}')"
        title="${escHtml(t.especialista||'')}${t.sede?' · '+escHtml(t.sede):''}${servicio?' · '+escHtml(servicio):''}">
        <div class="cal-ev-logobox">${logoHtml}</div>
        ${servicio?`<span class="cal-ev-serv">${escHtml(servicio)}</span>`:''}
      </div>`;
    }).join('');

    const clsFestivo = festivo ? 'es-festivo' : '';
    html += `<div class="turnos-cal-day ${isToday?'today':''} ${clsFestivo}" onclick="ct_openTurnoModal(null,'${dateStr}')">
      <div class="turnos-day-num">${d}${tieneCruce?' <i class="fa-solid fa-triangle-exclamation cal-day-warn"></i>':''}</div>
      ${festivo?`<div class="cal-day-festivo">festivo</div>`:''}
      ${events}
    </div>`;
  }

  const totalCells = firstDay + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for(let d=1; d<=remaining; d++) {
    html += `<div class="turnos-cal-day other-month"><div class="turnos-day-num">${d}</div></div>`;
  }

  html += '</div>';

  // ── Secciones informativas debajo del calendario ──
  html += ct_renderLeyendaSedes(y, m);
  html += ct_renderFestivosMes(y, m);
  html += ct_renderCrucesMes(crucesPorDia);

  wrap.innerHTML = html;
}

/* Leyenda de sedes usadas en el mes visible */
function ct_renderLeyendaSedes(y, m){
  const prefijo = `${y}-${String(m+1).padStart(2,'0')}`;
  const nombresUsados = new Set();
  ct_turnos.forEach(t=>{
    if ((t.fecha||'').startsWith(prefijo) && (t.sede||'').trim()) nombresUsados.add(t.sede.trim());
  });
  if (!nombresUsados.size) return '';
  const items = [...nombresUsados].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'})).map(nombre=>{
    const s = ct_sedePorNombre(nombre);
    const logo = s && s.logo
      ? `<img src="${s.logo}" alt=""/>`
      : `<span class="ct-leyenda-sigla">${escHtml(s?(s.sigla||ct_siglaDe(s.nombre)):ct_siglaDe(nombre))}</span>`;
    const ciudad = s && s.ciudad ? s.ciudad : '';
    return `<div class="ct-leyenda-item">
      <div class="ct-leyenda-logo">${logo}</div>
      <div><div class="ct-leyenda-nombre">${escHtml(nombre)}</div>${ciudad?`<div class="ct-leyenda-ciudad">${escHtml(ciudad)}</div>`:''}</div>
    </div>`;
  }).join('');
  return `<div class="ct-seccion"><h3 class="ct-seccion-tit">Sedes</h3><div class="ct-leyenda-grid">${items}</div></div>`;
}

/* Lista de festivos del mes visible */
function ct_renderFestivosMes(y, m){
  const daysInMonth = new Date(y,m+1,0).getDate();
  const fest = [];
  for(let d=1; d<=daysInMonth; d++){
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const nom = ct_festivoDe(dateStr);
    if (nom) fest.push(`${d} ${MESES_TURN[m].slice(0,3).toLowerCase()} · ${nom}`);
  }
  if (!fest.length) return '';
  return `<div class="ct-festivos-banner"><strong>Festivos (no laboral):</strong> ${fest.join('  ·  ')}</div>`;
}

/* Resumen de cruces del mes */
function ct_renderCrucesMes(crucesPorDia){
  const y = ct_turnosCurrentDate.getFullYear();
  const m = ct_turnosCurrentDate.getMonth();
  const prefijo = `${y}-${String(m+1).padStart(2,'0')}`;
  const filas = [];
  Object.keys(crucesPorDia).sort().forEach(f=>{
    if (!f.startsWith(prefijo)) return;
    const d = Number(f.split('-')[2]);
    [...crucesPorDia[f]].forEach(esp=>{
      filas.push(`${d} ${MESES_TURN[m].slice(0,3).toLowerCase()} · ${esp}`);
    });
  });
  if (!filas.length) return '';
  return `<div class="ct-cruces-banner">
    <div class="ct-cruces-head"><i class="fa-solid fa-triangle-exclamation"></i> Revisar cruces (mismo médico, 2 sedes el mismo día):</div>
    <div class="ct-cruces-list">${filas.map(f=>`<div>${escHtml(f)}</div>`).join('')}</div>
  </div>`;
}

function ct_renderCalSemana() {
  const wrap = document.getElementById('turnosCalWrapT2');
  const lbl  = document.getElementById('turnosNavLabelT2');
  if (!wrap) return;

  // Inicio de semana (lunes)
  const d0 = new Date(ct_turnosCurrentDate);
  const dow = d0.getDay();
  const diff = d0.getDate() - dow + (dow===0?-6:1);
  d0.setDate(diff);
  const weekStart = new Date(d0);
  const weekEnd   = new Date(d0); weekEnd.setDate(weekEnd.getDate()+6);
  if (lbl) lbl.textContent = `${weekStart.getDate()} ${MESES_TURN[weekStart.getMonth()]} — ${weekEnd.getDate()} ${MESES_TURN[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;

  const days = [];
  for(let i=0;i<7;i++){ const nd=new Date(weekStart); nd.setDate(nd.getDate()+i); days.push(nd); }
  const today = new Date().toISOString().slice(0,10);
  const DIAS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  // Leyenda
  let html = `<div class="wsem-legend">
    <span class="wsem-leg-item"><span class="wsem-dot" style="background:#fb923c"></span> Proceso pendiente</span>
    <span class="wsem-leg-item"><span class="wsem-dot" style="background:#fbbf24"></span> En revisión</span>
    <span class="wsem-leg-item"><span class="wsem-dot" style="background:#4ade80"></span> Listo</span>
    <span class="wsem-leg-item"><span class="wsem-dot" style="background:#60a5fa"></span> Tarea</span>
    <span class="wsem-leg-item"><span class="wsem-dot" style="background:#f87171"></span> Vencido</span>
  </div>`;

  // Grid de columnas
  html += `<div class="wsem-grid">`;

  days.forEach(d=>{
    const ds = d.toISOString().slice(0,10);
    const isT = ds === today;
    const dayNum = d.getDate();
    const dayName = DIAS_SHORT[d.getDay()].toUpperCase();
    const dayTurnos = ct_turnos.filter(t=>t.fecha===ds);

    const eventos = dayTurnos.map(t=>{
      // Color según trayecto o tipo
      const clr = t.trayecto==='REGRESO' ? '#bbf7d0' :
                  t.tipo==='Residente'    ? '#dbeafe' : '#fee2e2';
      const txtClr = t.trayecto==='REGRESO' ? '#166534' :
                     t.tipo==='Residente'   ? '#1e40af' : '#991b1b';
      const badgeClr = t.trayecto==='IDA'    ? '#f97316' :
                       t.trayecto==='REGRESO' ? '#22c55e' : '#94a3b8';
      const badgeTxt = t.trayecto || t.tipo || '';
      return `<div class="wsem-event" style="background:${clr};border-left:3px solid ${badgeClr}"
          onclick="event.stopPropagation();ct_openTurnoModal('${t.id}')"
          title="${escHtml(t.especialista||'')} · ${t.sede||''} · ${t.trayecto||''}">
        <div class="wsem-ev-name" style="color:${txtClr}">${escHtml(t.especialista||'—')}</div>
        ${t.sede?`<div class="wsem-ev-sub">${escHtml(t.sede)}</div>`:''}
        <span class="wsem-ev-badge" style="background:${badgeClr}">${badgeTxt}</span>
      </div>`;
    }).join('');

    const sinEv = !dayTurnos.length ? `<div class="wsem-empty">Sin eventos</div>` : '';

    html += `<div class="wsem-col ${isT?'wsem-today':''}">
      <div class="wsem-col-head ${isT?'wsem-head-today':''}">
        <div class="wsem-day-name">${dayName}</div>
        <div class="wsem-day-num ${isT?'wsem-num-today':''}">${dayNum}</div>
      </div>
      <div class="wsem-col-body" onclick="ct_openTurnoModal(null,'${ds}')">
        ${eventos}${sinEv}
      </div>
    </div>`;
  });

  html += `</div>`;
  wrap.innerHTML = html;
}

window.ct_renderTurnosTabla = () => {
  const container = document.getElementById('turnosCardsContainerT2');
  const empty     = document.getElementById('turnosEmptyT2');
  if(!container) return;

  const fEsp   = document.getElementById('tfEspT2')?.value||'';
  const fMes   = document.getElementById('tfMesT2')?.value||'';
  const fHotel = document.getElementById('tfHotelT2')?.value||'';
  const fTipo  = document.getElementById('tfTipoT2')?.value||'';
  const fTray  = document.getElementById('tfTrayT2')?.value||'';

  let list = ct_turnos.filter(t =>
    (!fEsp   || t.especialista===fEsp) &&
    (!fMes   || (t.fecha&&new Date(t.fecha+'T12:00').getMonth()+1===Number(fMes))) &&
    (!fHotel || t.hotel===fHotel) &&
    (!fTipo  || t.tipo===fTipo) &&
    (!fTray  || t.trayecto===fTray)
  ).sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||''));

  if(!list.length){ container.innerHTML=''; empty.style.display='flex'; return; }
  empty.style.display='none';

  const fmtV = v => v ? '$ '+Number(v).toLocaleString('es-CO') : '—';

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table class="turnos-erp-table">
        <thead>
          <!-- Fila de grupos -->
          <tr class="erp-grp-row">
            <th colspan="6" class="erp-grp erp-grp-info">Información del Turno</th>
            <th colspan="9" class="erp-grp erp-grp-tiq">Descuento al Especialista — Tiquetes y Hoteles</th>
            <th colspan="3" class="erp-grp erp-grp-trans">Auditoría y Pago Transporte — Juan Aguirre</th>
            <th colspan="1" class="erp-grp"></th>
          </tr>
          <!-- Fila de columnas -->
          <tr class="erp-col-row">
            <th>Fecha</th><th>Mes</th><th>Día</th>
            <th>Especialista</th><th>Tipo</th><th>Sede</th>
            <th class="col-tiq">Tiquetes</th>
            <th class="col-tiq">Checklist</th>
            <th class="col-tiq">Concepto</th>
            <th class="col-tiq">Vr. Tiquete</th>
            <th class="col-tiq">Hotel</th>
            <th class="col-tiq">Checklist 2</th>
            <th class="col-tiq">Vr. Hotel</th>
            <th class="col-tiq">Residente</th>
            <th class="col-tiq">Vr. Residente</th>
            <th class="col-trans">Trayecto</th>
            <th class="col-trans">Transporte</th>
            <th class="col-trans">Vr. Transporte</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${list.map((t,i)=>{
            const tray = t.trayecto||'';
            const trayCls = tray==='IDA'?'tray-ida':tray==='REGRESO'?'tray-reg':'';
            return `<tr class="erp-row ${i%2===0?'':'erp-row-alt'}">
              <td class="erp-td-date">${t.fecha||'—'}</td>
              <td>${t.mes||'—'}</td>
              <td>${t.dia||'—'}</td>
              <td class="erp-td-esp">${escHtml(t.especialista||'—')}</td>
              <td><span class="erp-badge erp-tipo">${t.tipo||'—'}</span></td>
              <td>${escHtml(t.sede||'—')}</td>
              <td class="col-tiq">${escHtml(t.tiquetes||'—')}</td>
              <td class="col-tiq erp-small">${escHtml(t.checklist1||'—')}</td>
              <td class="col-tiq">${escHtml(t.concepto||'—')}</td>
              <td class="col-tiq erp-money">${fmtV(t.valorTiquete)}</td>
              <td class="col-tiq">${escHtml(t.hotel||'—')}</td>
              <td class="col-tiq erp-small">${escHtml(t.checklist2||'—')}</td>
              <td class="col-tiq erp-money">${fmtV(t.valorHotel)}</td>
              <td class="col-tiq">${escHtml(t.residente||'—')}</td>
              <td class="col-tiq erp-money">${fmtV(t.valorResidente)}</td>
              <td class="col-trans"><span class="erp-tray ${trayCls}">${tray||'—'}</span></td>
              <td class="col-trans erp-small">${escHtml(t.transporte||'—')}</td>
              <td class="col-trans erp-money">${fmtV(t.valorTransporte)}</td>
              <td>
                <div class="tbl-actions">
                  <button class="act-btn edit" onclick="ct_openTurnoModal('${t.id}')"><i class="fa-solid fa-pen"></i></button>
                  <button class="act-btn del"  onclick="ct_deleteTurno('${t.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
};

function ct_buildEspPicker(selectedEsps=[]) {
  window.ct__selectedEsps = [...selectedEsps];
  const picker = document.getElementById('turnoEspPickerT2');
  const tags   = document.getElementById('turnoEspTagsT2');
  if (!picker) return;
  const esps = [...new Set(doctors.filter(d=>d.especialista).map(d=>d.especialista))].sort();
  picker.innerHTML = esps.map(e=>`
    <label class="turno-esp-item ${selectedEsps.includes(e)?'selected':''}">
      <input type="checkbox" value="${escHtml(e)}" ${selectedEsps.includes(e)?'checked':''}
        onchange="ct_toggleEspPick('${escHtml(e)}',this.checked)"/>
      <span>${escHtml(e)}</span>
    </label>`).join('');
  ct_renderEspTags();
}

window.ct_toggleEspPick = (esp, checked) => {
  if (checked) { if (!window.ct__selectedEsps.includes(esp)) window.ct__selectedEsps.push(esp); }
  else { window.ct__selectedEsps = window.ct__selectedEsps.filter(e=>e!==esp); }
  document.querySelectorAll('#turnoEspPicker .turno-esp-item').forEach(el=>{
    const cb = el.querySelector('input');
    el.classList.toggle('selected', window.ct__selectedEsps.includes(cb.value));
  });
  ct_renderEspTags();
};

function ct_renderEspTags() {
  const el = document.getElementById('turnoEspTagsT2');
  if (!el) return;
  el.innerHTML = window.ct__selectedEsps.map(e=>`
    <span class="resp-tag">
      ${escHtml(e.split(' ')[0])}
      <span class="resp-tag-x" onclick="ct_toggleEspPick('${escHtml(e)}',false)">✕</span>
    </span>`).join('');
}

window.ct_openTurnoModal = (id=null, dateStr=null) => {
  ct_editTurnoId = id;
  const t = id ? ct_turnos.find(x=>x.id===id) : null;
  document.getElementById('turnoModalTitleT2').textContent = id?'Editar Turno':'Nuevo Turno';
  document.getElementById('turnoIdT2').value = id||'';

  const isEdit = !!id;
  // Show multi or single depending on mode
  document.getElementById('espMultiWrapT2').style.display  = isEdit ? 'none'  : '';
  document.getElementById('espSingleWrapT2').style.display = isEdit ? ''      : 'none';

  if (isEdit) {
    // Single select for editing
    const selEsp = document.getElementById('tEspecialistaT2');
    const esps = [...new Set(doctors.filter(d=>d.especialista).map(d=>d.especialista))].sort();
    selEsp.innerHTML = '<option value="">— Seleccionar —</option>'
      + esps.map(e=>`<option value="${escHtml(e)}">${escHtml(e)}</option>`).join('');
    selEsp.value = t?.especialista||'';
  } else {
    // Multi-picker for new
    ct_buildEspPicker([]);
  }

  // DESDE / HASTA
  const fecha = t?.fecha || dateStr || new Date().toISOString().slice(0,10);
  document.getElementById('tDesdeT2').value = fecha;
  document.getElementById('tHastaT2').value = t?.fechaHasta||'';
  ct_onTurnoFechaChange(fecha);

  // Resto de campos
  document.getElementById('tTipoT2').value          = t?.tipo||'Especialista';
  ct_poblarSelectSede();
  document.getElementById('tSedeT2').value          = t?.sede||'';
  const selServ = document.getElementById('tServicioT2');
  if (selServ) selServ.value = t?.servicio || 'Consulta';
  document.getElementById('tTiquetesT2').value      = t?.tiquetes||'';
  document.getElementById('tChecklist1T2').value    = t?.checklist1||'';
  document.getElementById('tConceptoT2').value      = t?.concepto||'';
  document.getElementById('tValorTiqueteT2').value  = t?.valorTiquete||'';
  document.getElementById('tHotelT2').value         = t?.hotel||'';
  document.getElementById('tChecklist2T2').value    = t?.checklist2||'';
  document.getElementById('tValorHotelT2').value    = t?.valorHotel||'';
  document.getElementById('tResidenteT2').value     = t?.residente||'';
  document.getElementById('tValorResidenteT2').value= t?.valorResidente||'';
  document.getElementById('tTransporteT2').value    = t?.transporte||'JUAN AGUIRRE / UROEXPERTOS';
  document.getElementById('tValorTransporteT2').value = t?.valorTransporte||'';
  document.getElementById('tTrayectoT2').value      = t?.trayecto||'';

  // Observación
  document.getElementById('tObservacionT2').value = t?.observacion||'';

  // Residente
  const esRes = !!(t?.esResidente);
  document.getElementById('tEsResidenteT2').checked = esRes;
  document.getElementById('tResidenteClienteWrapT2').style.display = esRes ? 'block' : 'none';
  if (esRes) {
    const sel = document.getElementById('tResidenteClienteT2');
    const opts = doctors.filter(d=>d.especialista).map(d =>
      `<option value="${escHtml(d.id)}" ${t?.residenteClienteId===d.id?'selected':''}>${escHtml(d.especialista)}</option>`
    ).join('');
    sel.innerHTML = '<option value="">— Seleccionar cliente —</option>' + opts;
    sel.value = t?.residenteClienteId||'';
  }

  document.getElementById('turnoModalT2').classList.add('open');
};

window.ct_closeTurnoModal = () => document.getElementById('turnoModalT2').classList.remove('open');

window.ct_onTurnoResidenteChange = () => {
  const checked = document.getElementById('tEsResidenteT2').checked;
  const wrap    = document.getElementById('tResidenteClienteWrapT2');
  const sel     = document.getElementById('tResidenteClienteT2');
  if (!wrap) return;
  wrap.style.display = checked ? 'block' : 'none';
  if (checked && sel) {
    // Populate with clients
    const opts = doctors.filter(d=>d.especialista).map(d =>
      `<option value="${escHtml(d.id)}">${escHtml(d.especialista)}</option>`
    ).join('');
    sel.innerHTML = '<option value="">— Seleccionar cliente —</option>' + opts;
  }
};

function ct_onTurnoFechaChange(fStr) {
  const desde = fStr || document.getElementById('tDesdeT2').value;
  if (!desde) return;
  const d = new Date(desde+'T12:00');
  document.getElementById('tMesT2').value = MESES_TURN[d.getMonth()];
  ct_renderTurnoRangeStrip();
}

window.ct_onTurnoHastaChange = () => ct_renderTurnoRangeStrip();

function ct_renderTurnoRangeStrip() {
  const strip = document.getElementById('turnoRangeStripT2');
  if (!strip) return;
  const desde = document.getElementById('tDesdeT2').value;
  const hasta = document.getElementById('tHastaT2').value;
  if (!desde) { strip.innerHTML = '<span style="color:var(--gray-3);font-size:12px">Selecciona Desde y Hasta para ver el rango</span>'; return; }

  const DIAS_SHORT = ['D','L','M','M','J','V','S'];
  const DIAS_NOM   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const start = new Date(desde+'T12:00');
  const end   = hasta ? new Date(hasta+'T12:00') : start;

  // Build list of days in range
  const days = [];
  let cur = new Date(start);
  while (cur <= end && days.length < 35) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate()+1);
  }

  strip.innerHTML = days.map((d,i) => {
    const isFirst = i===0;
    const isLast  = i===days.length-1 && days.length>1;
    const cls = isFirst ? 'range-day-start' : isLast ? 'range-day-end' : 'range-day-mid';
    const label = isFirst ? 'IDA' : isLast ? 'REG' : '';
    return `<div class="range-day ${cls}" title="${d.toLocaleDateString('es-CO')}">
      <div class="range-dow">${DIAS_SHORT[d.getDay()]}</div>
      <div class="range-num">${d.getDate()}</div>
      ${label?`<div class="range-tag">${label}</div>`:''}
    </div>`;
  }).join('');
}

window.ct_onTurnoEspChange = () => {
  // no-op for now — trayecto set via DESDE/HASTA
};

window.ct_onTurnoHotelChange = () => {
  const hotel = document.getElementById('tHotelT2').value;
  if (hotel === 'BARBACOA') document.getElementById('tValorHotelT2').value = 82000;
};

function ct_calcTrayecto(especialista, fecha) {
  if (!especialista || !fecha) return 'IDA';
  // Obtener todos los ct_turnos del especialista ordenados por fecha
  const myTurnos = ct_turnos
    .filter(t => t.especialista===especialista && t.id !== ct_editTurnoId)
    .map(t => t.fecha)
    .sort();

  if (!myTurnos.length) return 'IDA';

  // Buscar el turno anterior más cercano
  const prev = myTurnos.filter(f=>f<fecha).pop();
  if (!prev) return 'IDA';

  // Si el anterior fue IDA → este es REGRESO, y viceversa
  const prevTurno = ct_turnos.find(t=>t.especialista===especialista && t.fecha===prev);
  if (!prevTurno) return 'IDA';
  return prevTurno.trayecto === 'IDA' ? 'REGRESO' : 'IDA';
}

window.ct_saveTurno = async () => {
  const desde  = document.getElementById('tDesdeT2').value;
  const hasta  = document.getElementById('tHastaT2').value;
  if (!desde) { toast('La fecha Desde es obligatoria.','error'); return; }

  // Build base data
  const baseData = () => ({
    tipo:   document.getElementById('tTipoT2').value,
    sede:   document.getElementById('tSedeT2').value.trim(),
    servicio: document.getElementById('tServicioT2')?.value||'',
    noDisponible: document.getElementById('tServicioT2')?.value==='No disponible',
    observacion:        document.getElementById('tObservacionT2')?.value.trim()||'',
    esResidente:        document.getElementById('tEsResidenteT2')?.checked||false,
    residenteClienteId: document.getElementById('tResidenteClienteT2')?.value||'',
    tiquetes:       document.getElementById('tTiquetesT2').value.trim(),
    checklist1:     document.getElementById('tChecklist1T2').value,
    concepto:       document.getElementById('tConceptoT2').value.trim(),
    valorTiquete:   Number(document.getElementById('tValorTiqueteT2').value)||0,
    hotel:          document.getElementById('tHotelT2').value,
    checklist2:     document.getElementById('tChecklist2T2').value,
    valorHotel:     Number(document.getElementById('tValorHotelT2').value)||0,
    residente:      document.getElementById('tResidenteT2').value.trim(),
    valorResidente: Number(document.getElementById('tValorResidenteT2').value)||0,
    transporte:     document.getElementById('tTransporteT2').value.trim(),
    valorTransporte: document.getElementById('tValorTransporteT2').value
                       ? Number(document.getElementById('tValorTransporteT2').value) : null,
    updatedAt:      serverTimestamp(),
  });

  const fmtMesFromDate = d => { const dt=new Date(d+'T12:00'); return MESES_TURN[dt.getMonth()]; };
  const fmtDiaFromDate = d => { const dt=new Date(d+'T12:00'); return DIAS_FULL[dt.getDay()]; };

  try {
    if (ct_editTurnoId) {
      // Edit: single record
      const esp = document.getElementById('tEspecialistaT2').value;
      if (!esp) { toast('Selecciona un especialista.','error'); return; }
      const data = {...baseData(), fecha:desde, fechaHasta:hasta, especialista:esp,
        trayecto: document.getElementById('tTrayectoT2').value };
      await updateDoc(doc(db,'turnos_v2',ct_editTurnoId), data);
      toast('Turno actualizado.','success');
    } else {
      // New: multi-especialista × IDA + REGRESO
      const esps = window.ct__selectedEsps||[];
      if (!esps.length) { toast('Selecciona al menos un especialista.','error'); return; }
      // Create IDA + REGRESO records per especialista
      const records = [];
      esps.forEach(esp => {
        // IDA = DESDE
        records.push({...baseData(), createdAt:serverTimestamp(),
          fecha:desde, fechaHasta:hasta||desde, especialista:esp,
          trayecto:'IDA', mes:fmtMesFromDate(desde), dia:fmtDiaFromDate(desde),
        });
        // REGRESO = HASTA (only if different date)
        if (hasta && hasta !== desde) {
          records.push({...baseData(), createdAt:serverTimestamp(),
            fecha:hasta, fechaHasta:hasta, especialista:esp,
            trayecto:'REGRESO', mes:fmtMesFromDate(hasta), dia:fmtDiaFromDate(hasta),
          });
        }
      });
      await Promise.all(records.map(r => addDoc(collection(db,'turnos_v2'),r)));
      const n = records.length;
      toast(`${n} registro${n>1?'s creados':' creado'}.`,'success');
    }
    ct_closeTurnoModal();
  } catch(e) { toast('Error: '+e.message,'error'); }
};

window.ct_deleteTurno = async (id) => {
  if (!confirm('¿Eliminar este turno?')) return;
  try { await deleteDoc(doc(db,'turnos_v2',id)); toast('Turno eliminado.'); }
  catch(e) { toast('Error: '+e.message,'error'); }
};

window.ct_openPrintTurnosModal = () => {
  // Marcar mes actual por defecto
  const now = new Date();
  document.querySelectorAll('#printMonthsGrid input[type=checkbox]').forEach(cb=>{
    cb.checked = parseInt(cb.value) === now.getMonth()+1;
  });
  const _pa=document.getElementById('printTurnosAnioT2'); if(_pa) _pa.value = String(now.getFullYear());
  document.getElementById('printTurnosModalT2')?.classList.add('open');
};

window.ct_closePrintTurnosModal = () =>
  document.getElementById('printTurnosModalT2')?.classList.remove('open');

window.ct_imprimirTurnosMesActual = () => {
  const d    = new Date(ct_turnosCurrentDate);
  const anio = d.getFullYear();
  const mes  = d.getMonth() + 1; // 1-12
  const mesesNombres = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const diasSem = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const fmtV  = v => v ? '$ '+Number(v).toLocaleString('es-CO') : '—';

  const firstDay    = new Date(anio, mes-1, 1).getDay();
  const daysInMonth = new Date(anio, mes, 0).getDate();
  const today       = new Date().toISOString().slice(0,10);

  // ── Construir HTML del calendario ──
  let calHtml = `<div class="tp-head">${mesesNombres[mes].toUpperCase()} ${anio} — CUADRO DE TURNOS</div>
  <div class="tp-grid">`;

  diasSem.forEach(d => { calHtml += `<div class="tp-dow">${d}</div>`; });

  for(let i=0;i<firstDay;i++) calHtml += `<div class="tp-day tp-other"></div>`;

  // ── Detección de cruces para impresión ──
  const porDiaEspP = {};
  ct_turnos.forEach(t=>{
    const f=t.fecha||''; if(!f) return;
    const esp=(t.especialista||'').trim(); if(!esp) return;
    porDiaEspP[f]=porDiaEspP[f]||{}; porDiaEspP[f][esp]=porDiaEspP[f][esp]||new Set();
    if((t.sede||'').trim()) porDiaEspP[f][esp].add(t.sede.trim());
  });
  const cruceEnDia = (f,esp) => porDiaEspP[f]&&porDiaEspP[f][esp]&&porDiaEspP[f][esp].size>=2;

  for(let dd=1;dd<=daysInMonth;dd++){
    const ds = `${anio}-${String(mes).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
    const festivo = ct_festivoDe(ds);
    const coveringT = ct_turnos.filter(t=>{
      const s=t.fecha||'', e=t.fechaHasta||t.fecha||'';
      return ds>=s && ds<=e;
    }).sort((a,b)=>(a.especialista||'').localeCompare(b.especialista||''));
    const hasRegT = coveringT.some(t=>t.fecha===ds&&t.trayecto==='REGRESO');
    const dayT = hasRegT
      ? coveringT.filter(t=>!(t.trayecto==='IDA'&&t.fecha!==ds))
      : coveringT;
    const isToday = ds === today;
    const hayCruceDia = dayT.some(t=>cruceEnDia(ds,(t.especialista||'').trim()));
    const evHtml = dayT.map(t=>{
      if (t.servicio==='No disponible' || t.noDisponible) {
        return `<div class="tp-ev tp-ev-nodisp">${escHtml(ct_siglaDe(t.especialista||''))} · No disponible</div>`;
      }
      const sede = ct_sedePorNombre(t.sede);
      const logo = sede && sede.logo
        ? `<img class="tp-ev-logo" src="${sede.logo}"/>`
        : `<span class="tp-ev-sigla">${escHtml(sede?(sede.sigla||ct_siglaDe(sede.nombre)):ct_siglaDe(t.sede||'—'))}</span>`;
      const serv = t.servicio || t.tipo || '';
      return `<div class="tp-ev tp-ev-sede">${logo}${serv?`<div class="tp-ev-serv">${escHtml(serv)}</div>`:''}</div>`;
    }).join('');
    calHtml += `<div class="tp-day${isToday?' tp-today':''}${festivo?' tp-festivo':''}">
      <div class="tp-num">${dd}${hayCruceDia?' ⚠':''}</div>${festivo?`<div class="tp-fest">festivo</div>`:''}${evHtml}
    </div>`;
  }

  const total = firstDay + daysInMonth;
  const rem   = (7-(total%7))%7;
  for(let i=0;i<rem;i++) calHtml += `<div class="tp-day tp-other"></div>`;
  calHtml += `</div>`;

  // ── Leyenda de sedes del mes (impresión) ──
  const prefijoP = `${anio}-${String(mes).padStart(2,'0')}`;
  const sedesUsadas = new Set();
  ct_turnos.forEach(t=>{ if((t.fecha||'').startsWith(prefijoP)&&(t.sede||'').trim()) sedesUsadas.add(t.sede.trim()); });
  let leyendaHtml = '';
  if (sedesUsadas.size){
    const items = [...sedesUsadas].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'})).map(nombre=>{
      const s = ct_sedePorNombre(nombre);
      const logo = s&&s.logo ? `<img src="${s.logo}"/>` : `<span class="tp-ley-sigla">${escHtml(s?(s.sigla||ct_siglaDe(s.nombre)):ct_siglaDe(nombre))}</span>`;
      return `<div class="tp-ley-item">${logo}<div><b>${escHtml(nombre)}</b>${s&&s.ciudad?`<br><span>${escHtml(s.ciudad)}</span>`:''}</div></div>`;
    }).join('');
    leyendaHtml = `<div class="tp-ley-title">Sedes</div><div class="tp-ley-grid">${items}</div>`;
  }
  const festList = [];
  for(let d=1; d<=daysInMonth; d++){
    const ds = `${anio}-${String(mes).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const nom = ct_festivoDe(ds);
    if (nom) festList.push(`${d} ${mesesNombres[mes].slice(0,3).toLowerCase()} · ${nom}`);
  }
  const festHtml = festList.length ? `<div class="tp-fest-banner"><b>Festivos (no laboral):</b> ${festList.join('  ·  ')}</div>` : '';
  const crucesList = [];
  Object.keys(porDiaEspP).sort().forEach(f=>{
    if(!f.startsWith(prefijoP)) return;
    Object.keys(porDiaEspP[f]).forEach(esp=>{
      if(porDiaEspP[f][esp].size>=2){
        const d = Number(f.split('-')[2]);
        crucesList.push(`${d} ${mesesNombres[mes].slice(0,3).toLowerCase()} · ${esp}`);
      }
    });
  });
  const crucesHtml = crucesList.length ? `<div class="tp-cruce-banner"><b>\u26a0 Revisar cruces (mismo m\u00e9dico, 2 sedes el mismo d\u00eda):</b><br>${crucesList.join('<br>')}</div>` : '';
  calHtml += leyendaHtml + festHtml + crucesHtml;

  // ── Construir tabla de registros del mes ──
  const mesT = ct_turnos.filter(t=>t.fecha&&
    new Date(t.fecha+'T12:00').getFullYear()===anio&&
    new Date(t.fecha+'T12:00').getMonth()===mes-1
  ).sort((a,b)=>(a.fecha||'').localeCompare(b.fecha||''));

  let tablaHtml = '';
  if(mesT.length){
    tablaHtml = `<div class="tp-rec-title">REGISTROS DE TURNOS — ${mesesNombres[mes].toUpperCase()} ${anio}</div>
    <table class="tp-table">
      <thead>
        <tr>
          <th>Fecha</th><th>Especialista</th><th>Tipo</th><th>Sede</th>
          <th>Hotel</th><th>Vr. Hotel</th><th>Vr. Tiquete</th>
          <th>Trayecto</th><th>Transporte</th><th>Vr. Transporte</th>
        </tr>
      </thead>
      <tbody>
        ${mesT.map((t,i)=>`<tr class="${i%2===0?'':'tp-alt'}">
          <td>${t.fecha||'—'}</td>
          <td style="font-weight:700">${escHtml(t.especialista||'—')}</td>
          <td>${t.tipo||'—'}</td>
          <td>${escHtml(t.sede||'—')}</td>
          <td>${escHtml(t.hotel||'—')}</td>
          <td class="tp-money">${fmtV(t.valorHotel)}</td>
          <td class="tp-money">${fmtV(t.valorTiquete)}</td>
          <td style="font-weight:700;color:${t.trayecto==='IDA'?'#1565c0':'#2e7d32'}">${t.trayecto||'—'}</td>
          <td>${escHtml(t.transporte||'—')}</td>
          <td class="tp-money">${fmtV(t.valorTransporte)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }

  // ── Insertar en zona imprimible del DOM ──
  const zone = document.getElementById('turnosPrintZoneT2');
  zone.innerHTML = calHtml;

  if (!zone.innerHTML.trim()) {
    toast('No se generó contenido para imprimir.', 'error');
    return;
  }

  // ── Imprimir con clase de scope ──
  document.body.classList.add('printing-ct_turnos');
  setTimeout(() => {
    window.print();
  }, 300);
  window.onafterprint = () => {
    document.body.classList.remove('printing-ct_turnos');
    zone.innerHTML = '';
    window.onafterprint = null;
  };
  // Fallback limpieza
  setTimeout(() => {
    document.body.classList.remove('printing-ct_turnos');
    zone.innerHTML = '';
  }, 5000);
};

/* ── Suscripción Firestore CUADRO DE TURNOS 2 (colección turnos_v2, vacía) ── */
let _ct_subscrito = false;
function ct_subscribeTurnos() {
  if (_ct_subscrito) return;
  _ct_subscrito = true;
  onSnapshot(collection(db,'turnos_v2'), snap => {
    ct_turnos = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.fecha?.localeCompare(b.fecha));
    if(document.getElementById('view-turnos2')?.classList.contains('active')){
      ct_renderTurnos(); ct_renderTurnosTabla();
    }
  });
}



/* ── Open / Close ── */
window.openChecklist = async () => {
  document.getElementById('checklistModal').classList.add('open');
  await chkInit();
};
window.closeChecklist = () => {
  document.getElementById('checklistModal').classList.remove('open');
  if (chkUnsubscribe) { chkUnsubscribe(); chkUnsubscribe = null; }
};

/* ── Init ── */
async function chkInit() {
  try {
    const snap = await getDocs(collection(db,'checklistMensual'));
    const meses = snap.docs.map(d=>({id:d.id,...d.data()}))
                          .sort((a,b)=>b.mes.localeCompare(a.mes));
    const default_mes = chkMesAnterior();
    if (!meses.find(m=>m.mes===default_mes)) {
      await chkCrearMes(default_mes); return chkInit();
    }
    const sel = document.getElementById('chkMesSelect');
    sel.innerHTML = meses.map(m=>
      `<option value="${m.mes}" ${m.mes===default_mes?'selected':''}>${chkMesLabel(m.mes)}</option>`
    ).join('');
    chkMesActual = sel.value || default_mes;
    await chkLoadMes();
  } catch(e) { console.error('chkInit',e); }
}

/* ── Crear nuevo mes ── */
async function chkCrearMes(mesKey) {
  // Start empty — user adds specialists manually
  await setDoc(doc(db,'checklistMensual',mesKey),{mes:mesKey,especialistas:{},updatedAt:serverTimestamp()});
}

window.chkNuevoMes = async () => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()+1);
  const sug = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  const input = prompt('Mes a crear (YYYY-MM):', sug);
  if (!input||!/^\d{4}-\d{2}$/.test(input)) return;
  await chkCrearMes(input);
  await chkInit();
  document.getElementById('chkMesSelect').value = input;
  chkMesActual = input;
  await chkLoadMes();
};

/* ── Agregar especialista — dropdown de clientes ── */
window.chkAgregarEsp = async () => {
  // Fetch ALL doctors directly — no orderBy to avoid excluding docs without createdAt
  let freshDoctors = [];
  try {
    const snap = await getDocs(collection(db,'doctors'));
    freshDoctors = snap.docs.map(d=>({id:d.id,...d.data()}));
    doctors = freshDoctors;
  } catch(e) {
    freshDoctors = doctors; // fallback to cached
  }

  // Get current checklist — which client IDs are already added
  let currentData = {};
  try {
    const chkSnap = await getDoc(doc(db,'checklistMensual',chkMesActual));
    if (chkSnap.exists()) currentData = chkSnap.data().especialistas||{};
  } catch(e) { /* use empty */ }

  // All clients with Nombre Empresa, excluding already added (by doctor id)
  const yaAgregados = new Set(Object.values(currentData).map(r=>r.doctorId).filter(Boolean));

  const disponibles = freshDoctors
    .filter(d => d.nombre && d.nombre.trim())
    .filter(d => !yaAgregados.has(d.id))
    .sort((a,b) => (a.nombre||'').localeCompare(b.nombre||''));

  if (!disponibles.length) {
    toast('Todos los clientes ya están en el checklist.','warn');
    return;
  }

  document.getElementById('chkAddDropdown')?.remove();

  const div = document.createElement('div');
  div.id = 'chkAddDropdown';
  div.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;border-radius:12px;box-shadow:0 8px 32px rgba(11,31,58,.22);z-index:3000;padding:20px;min-width:340px;max-width:460px;width:90vw';
  div.innerHTML = `
    <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--navy);margin-bottom:8px">
      <i class="fa-solid fa-user-plus" style="color:var(--blue);margin-right:6px"></i>Agregar Cliente al Checklist
    </div>
    <div style="font-size:11px;color:var(--gray-3);margin-bottom:10px">${disponibles.length} cliente${disponibles.length>1?'s':''} disponible${disponibles.length>1?'s':''}</div>
    <select id="chkEspDropdown" size="1" style="width:100%;border:1.5px solid var(--gray-2);border-radius:8px;padding:9px 12px;font-size:13px;font-family:'Nunito',sans-serif;outline:none;color:var(--navy);margin-bottom:14px;cursor:pointer">
      <option value="">— Seleccionar cliente —</option>
      ${disponibles.map(d=>`<option value="${escHtml(d.id)}">${escHtml(d.nombre.trim())}</option>`).join('')}
    </select>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button onclick="document.getElementById('chkAddDropdown').remove()"
        style="padding:8px 16px;border-radius:7px;border:1.5px solid var(--gray-2);background:var(--gray-0);font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;cursor:pointer;color:var(--gray-4)">
        Cancelar
      </button>
      <button onclick="chkConfirmarAgregar()"
        style="padding:8px 16px;border-radius:7px;border:none;background:linear-gradient(135deg,var(--blue),#0e4a9e);color:white;font-family:'Nunito',sans-serif;font-size:13px;font-weight:700;cursor:pointer">
        <i class="fa-solid fa-plus"></i> Agregar
      </button>
    </div>`;
  document.body.appendChild(div);
};

window.chkConfirmarAgregar = async () => {
  const sel = document.getElementById('chkEspDropdown');
  const doctorId = sel?.value;
  if (!doctorId) { toast('Selecciona un cliente.','error'); return; }
  // Find the doctor to get nombre
  const doctor = doctors.find(d=>d.id===doctorId);
  const nombre = doctor?.nombre?.trim()||doctorId;
  const k = doctorId; // use doctorId as the key — unique and stable
  document.getElementById('chkAddDropdown')?.remove();
  try {
    await updateDoc(doc(db,'checklistMensual',chkMesActual),{
      [`especialistas.${k}`]:{nombre, doctorId, dayana:false, santiago:false, envios:false, ibc:false},
      updatedAt:serverTimestamp()
    });
    toast(`${nombre} agregado al checklist.`,'success');
  } catch(e){ toast('Error: '+e.message,'error'); }
};

/* ── Eliminar especialista del checklist ── */
window.chkEliminarEsp = async (espKey) => {
  if (!confirm('Quitar este especialista del checklist? No se borra del sistema.')) return;
  try {
    // Use deleteField() to remove the nested field properly
    await updateDoc(doc(db,'checklistMensual',chkMesActual),{
      [`especialistas.${espKey}`]: deleteField(),
      updatedAt: serverTimestamp()
    });
    toast('Especialista quitado del checklist.','success');
  } catch(e){ toast('Error: '+e.message,'error'); }
};

/* ── Load mes ── */
window.chkLoadMes = async () => {
  const sel = document.getElementById('chkMesSelect');
  chkMesActual = sel.value;
  document.getElementById('chkMesLabel').textContent = 'Seguimiento ' + chkMesLabel(chkMesActual);
  if (chkUnsubscribe) chkUnsubscribe();
  chkUnsubscribe = onSnapshot(doc(db,'checklistMensual',chkMesActual), snap=>{
    if (!snap.exists()) return;
    const d = snap.data();
    const data = d.especialistas||{};
    // Remove any entries with invalid/empty keys silently
    const cleaned = {};
    Object.entries(data).forEach(([k,v]) => {
      if (k && !k.includes('..') && !k.startsWith('.') && !k.endsWith('.')) {
        cleaned[k] = v;
      }
    });
    chkRender(cleaned);
  });
};

/* ── Render ── */
function chkRender(data) {
  // Use actual Firestore keys (Object.entries gives us the real key)
  const entries = Object.entries(data).sort((a,b)=>(a[1].nombre||'').localeCompare(b[1].nombre||''));
  const rows_data = entries.map(([key, row]) => ({...row, _key: key}));
  const total     = rows_data.length;
  const enviados  = rows_data.filter(r=>r.envios).length;
  const pendientes= total - enviados;
  const pctEnvios = total ? Math.round(enviados/total*100) : 0;
  const allDone   = enviados === total && total > 0;

  // ── KPI Cards ──
  const kpis = document.getElementById('chkKpis');
  if (kpis) kpis.innerHTML = `
    <div style="background:white;border-radius:10px;border:1px solid var(--gray-1);padding:14px 16px;display:flex;align-items:center;gap:12px">
      <div style="width:40px;height:40px;border-radius:10px;background:#e8f5e9;display:flex;align-items:center;justify-content:center;font-size:18px;color:#2e7d32"><i class="fa-solid fa-paper-plane"></i></div>
      <div><div style="font-size:24px;font-weight:800;color:#2e7d32;font-family:'Syne',sans-serif">${enviados}</div><div style="font-size:10.5px;color:var(--gray-3);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Enviados</div></div>
    </div>
    <div style="background:white;border-radius:10px;border:1px solid var(--gray-1);padding:14px 16px;display:flex;align-items:center;gap:12px">
      <div style="width:40px;height:40px;border-radius:10px;background:#ffebee;display:flex;align-items:center;justify-content:center;font-size:18px;color:#c62828"><i class="fa-solid fa-clock"></i></div>
      <div><div style="font-size:24px;font-weight:800;color:#c62828;font-family:'Syne',sans-serif">${pendientes}</div><div style="font-size:10.5px;color:var(--gray-3);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Pendientes</div></div>
    </div>
    <div style="background:white;border-radius:10px;border:1px solid var(--gray-1);padding:14px 16px;display:flex;align-items:center;gap:12px">
      <div style="width:40px;height:40px;border-radius:10px;background:var(--blue-pale);display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--blue)"><i class="fa-solid fa-users"></i></div>
      <div><div style="font-size:24px;font-weight:800;color:var(--navy);font-family:'Syne',sans-serif">${total}</div><div style="font-size:10.5px;color:var(--gray-3);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Especialistas</div></div>
    </div>
    <div style="background:white;border-radius:10px;border:1px solid var(--gray-1);padding:14px 16px;display:flex;align-items:center;gap:12px">
      <div style="width:40px;height:40px;border-radius:10px;background:${allDone?'#e8f5e9':'var(--gray-0)'};display:flex;align-items:center;justify-content:center;font-size:18px;color:${allDone?'#2e7d32':'var(--gray-3)'}"><i class="fa-solid fa-chart-pie"></i></div>
      <div><div style="font-size:24px;font-weight:800;color:${allDone?'#2e7d32':'var(--navy)'};font-family:'Syne',sans-serif">${pctEnvios}%</div><div style="font-size:10.5px;color:var(--gray-3);font-weight:700;text-transform:uppercase;letter-spacing:.05em">Progreso</div></div>
    </div>`;

  // ── Progress bar ──
  document.getElementById('chkProgBar').style.width = pctEnvios+'%';
  document.getElementById('chkProgLabel').textContent = `${enviados} de ${total} especialistas con envio completado`;
  const badge = document.getElementById('chkEstadoBadge');
  badge.textContent  = allDone ? 'MES COMPLETADO' : pctEnvios>0 ? 'En proceso' : 'Pendiente';
  badge.style.background = allDone ? '#e8f5e9' : pctEnvios>0 ? '#fff3e0' : '#ffebee';
  badge.style.color      = allDone ? '#2e7d32' : pctEnvios>0 ? '#e65100' : '#c62828';

  // ── Alert ──
  const alerta = document.getElementById('chkAlerta');
  const alertaTxt = document.getElementById('chkAlertaText');
  if (pendientes > 0) {
    alerta.style.display = 'flex';
    alertaTxt.textContent = `Faltan ${pendientes} envio${pendientes>1?'s':''} a especialistas este mes.`;
  } else { alerta.style.display = 'none'; }

  // ── Table rows ──
  const tbody = document.getElementById('chkBody');
  if (!tbody) return;
  if (!rows_data.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--gray-3)">Sin especialistas en este mes</td></tr>';
    return;
  }

  tbody.innerHTML = rows_data.map(row => {
    // Use the actual Firestore key, sanitize for safe inline onclick use
    const k = row._key || chkKey(row.nombre||'');
    // Validate key is safe for Firestore path (no empty, no leading/trailing dots)
    if (!k || k.includes('..') || k.startsWith('.') || k.endsWith('.')) return '';
    const rowAllDone = CHK_COLS.every(c=>row[c]);
    const checks = CHK_COLS.map(col => {
      const checked = !!row[col];
      const isEnvio = col === 'envios';
      const cellBg  = isEnvio ? (checked?'rgba(46,125,50,.06)':'rgba(198,40,40,.04)') : '';
      return `<td style="text-align:center;${cellBg}">
        <label style="cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px">
          <input type="checkbox" ${checked?'checked':''} style="width:17px;height:17px;accent-color:#2e7d32;cursor:pointer"
            onchange="chkToggle('${escHtml(k)}','${col}',this.checked)"/>
          ${isEnvio?`<span style="font-size:9.5px;font-weight:800;color:${checked?'#2e7d32':'#c62828'}">${checked?'Enviado':'Pendiente'}</span>`:''}
        </label>
      </td>`;
    }).join('');

    const estadoColor = rowAllDone?'#2e7d32':row.envios?'#1565c0':'#c62828';
    const estadoIcon  = rowAllDone?'fa-circle-check':row.envios?'fa-circle-half-stroke':'fa-circle-xmark';
    const estadoLabel = rowAllDone?'Listo':row.envios?'En proceso':'Pendiente';

    return `<tr style="${rowAllDone?'background:#f1f8f1':''}">
      <td style="font-weight:700;color:var(--navy)">${escHtml(row.nombre||'')}</td>
      ${checks}
      <td style="text-align:center">
        <span style="color:${estadoColor};font-size:11.5px;font-weight:700;white-space:nowrap">
          <i class="fa-solid ${estadoIcon}"></i> ${estadoLabel}
        </span>
      </td>
      <td style="text-align:center">
        <button class="act-btn del" style="width:24px;height:24px;font-size:10px" title="Quitar del checklist"
          onclick="chkEliminarEsp('${escHtml(k)}')"><i class="fa-solid fa-xmark"></i></button>
      </td>
    </tr>`;
  }).join('');
}

/* ── Toggle checkbox ── */
window.chkToggle = async (espKey, col, value) => {
  if (!chkMesActual) return;
  try {
    await updateDoc(doc(db,'checklistMensual',chkMesActual),{
      [`especialistas.${espKey}.${col}`]: value,
      updatedAt: serverTimestamp()
    });
  } catch(e){ toast('Error al guardar: '+e.message,'error'); }
};

/* ══════════════════════════════════════════════════
   LIMPIAR DUPLICADOS — REPORTES
══════════════════════════════════════════════════ */

let _dedupGroups = []; // groups with duplicates

window.openDedupModal = () => {
  document.getElementById('dedupModal').classList.add('open');
  document.getElementById('dedupResults').style.display = 'none';
  document.getElementById('btnEliminarDups').style.display = 'none';
  document.getElementById('dedupStatus').style.display = 'block';
  document.getElementById('dedupStatus').innerHTML = `
    <i class="fa-solid fa-magnifying-glass" style="font-size:32px;margin-bottom:10px;display:block;opacity:.3"></i>
    Presiona "Analizar" para buscar duplicados`;
};

window.closeDedupModal = () => {
  document.getElementById('dedupModal').classList.remove('open');
  _dedupGroups = [];
};

window.analizarDuplicados = async () => {
  const status = document.getElementById('dedupStatus');
  status.style.display = 'block';
  status.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:28px;margin-bottom:10px;display:block"></i>Analizando facturas...';

  try {
    const snap = await getDocs(collection(db,'facturas'));
    const all  = snap.docs.map(d=>({_ref:d.ref, _id:d.id, ...d.data()}));

    const norm = s => (s||'').toString().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/\s+/g,' ').trim();

    // Group by doctor + mes + año + entidad + valor (strict)
    // Also group by doctor + mes + año + entidad (flexible — catches entidad typos)
    // Use the FLEXIBLE key to find near-duplicates
    const groups = {};
    all.forEach(f => {
      // Flexible key: ignore small entidad differences, ignore value
      const key = [
        f.doctorId || norm(f.doctorNombre||f.doctor||'sin-doctor'),
        norm(f.mes),
        String(f.anio||''),
        norm(f.entidad).slice(0,20), // only first 20 chars to catch truncation diffs
      ].join('__');
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    });

    // Keep only groups with duplicates
    _dedupGroups = Object.entries(groups)
      .filter(([,arr]) => arr.length > 1)
      .map(([key, arr]) => {
        const first = arr[0];
        const doctor = doctors.find(d=>d.id===first.doctorId);
        const sorted = arr.sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
        return {
          key,
          doctorNombre: doctor?.nombre || first.doctorNombre || first.doctor || first.doctorId || 'Sin médico',
          mes:    first.mes||'',
          anio:   first.anio||'',
          entidad: first.entidad||'',
          total:  arr.length,
          valorTotal: arr.reduce((s,f)=>s+(Number(f.valor)||0),0),
          toDelete: sorted.slice(1).map(f=>f._ref),
        };
      })
      .sort((a,b)=>a.doctorNombre.localeCompare(b.doctorNombre));

    status.style.display = 'none';

    if (!_dedupGroups.length) {
      status.style.display = 'block';
      status.innerHTML = `
        <i class="fa-solid fa-circle-check" style="font-size:36px;color:#2e7d32;margin-bottom:10px;display:block"></i>
        <strong style="color:#2e7d32">No se encontraron duplicados.</strong><br>
        <span style="font-size:12px;color:var(--gray-3)">${all.length} registros revisados — todo limpio.</span>
        <br><br>
        <button class="btn btn-ghost btn-xs" onclick="verDiagnostico()" style="margin-top:8px">
          <i class="fa-solid fa-microscope"></i> Ver diagnóstico por médico/mes
        </button>`;
      return;
    }

    const totalDups = _dedupGroups.reduce((s,g)=>s+g.toDelete.length, 0);
    document.getElementById('dedupSummary').innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px">
        <div style="background:#ffebee;border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:8px">
          <i class="fa-solid fa-copy" style="color:#c62828;font-size:18px"></i>
          <div><strong style="font-size:18px;color:#c62828">${_dedupGroups.length}</strong><br><span style="font-size:11px;color:var(--gray-3)">GRUPOS CON DUPS</span></div>
        </div>
        <div style="background:#fff3e0;border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:8px">
          <i class="fa-solid fa-trash" style="color:#e65100;font-size:18px"></i>
          <div><strong style="font-size:18px;color:#e65100">${totalDups}</strong><br><span style="font-size:11px;color:var(--gray-3)">REGISTROS A ELIMINAR</span></div>
        </div>
      </div>`;

    document.getElementById('dedupBody').innerHTML = _dedupGroups.map((g,i)=>`
      <tr>
        <td><label style="display:flex;align-items:center;gap:7px;cursor:pointer">
          <input type="checkbox" class="dedup-chk" data-idx="${i}" checked style="accent-color:var(--red);width:14px;height:14px"/>
          <span style="font-weight:700;color:var(--navy)">${escHtml(g.doctorNombre)}</span>
        </label></td>
        <td>${g.mes} ${g.anio}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(g.entidad)||'—'}</td>
        <td style="text-align:right"><span style="background:#ffebee;color:#c62828;font-weight:700;padding:2px 8px;border-radius:10px">${g.total} registros → elimina ${g.toDelete.length}</span></td>
      </tr>`).join('');

    document.getElementById('dedupResults').style.display = 'block';
    document.getElementById('btnEliminarDups').style.display = 'inline-flex';
    document.getElementById('dedupSelectAll').checked = true;

  } catch(e) {
    status.innerHTML = `<span style="color:var(--red)"><i class="fa-solid fa-xmark-circle"></i> Error: ${e.message}</span>`;
  }
};

/* Diagnóstico — muestra conteo por médico/mes para detectar inflación */
window.verDiagnostico = async () => {
  const status = document.getElementById('dedupStatus');
  status.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cargando diagnóstico...';
  try {
    const snap = await getDocs(collection(db,'facturas'));
    const all  = snap.docs.map(d=>({_id:d.id,...d.data()}));
    const norm = s => (s||'').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();

    // Group by doctor + mes + año — show count and total value
    const groups = {};
    all.forEach(f => {
      const doctor = doctors.find(d=>d.id===f.doctorId);
      const nombre = doctor?.nombre || f.doctorNombre || f.doctor || f.doctorId || '—';
      const key    = `${nombre}__${norm(f.mes)}__${f.anio||''}`;
      if (!groups[key]) groups[key] = {nombre, mes:f.mes||'', anio:f.anio||'', count:0, total:0};
      groups[key].count++;
      groups[key].total += Number(f.valor)||0;
    });

    const rows = Object.values(groups)
      .sort((a,b)=>a.nombre.localeCompare(b.nombre)||String(a.anio).localeCompare(String(b.anio))||a.mes.localeCompare(b.mes));

    status.innerHTML = `
      <div style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px">
        Diagnóstico — ${all.length} registros en total
      </div>
      <div style="max-height:300px;overflow-y:auto;border:1px solid var(--gray-1);border-radius:8px">
        <table class="data-table" style="font-size:11.5px;min-width:400px">
          <thead><tr>
            <th>Médico</th><th>Mes</th><th>Año</th>
            <th style="text-align:right">Registros</th>
            <th style="text-align:right">Valor total</th>
          </tr></thead>
          <tbody>
            ${rows.map(r=>`<tr style="${r.count>500?'background:#fff3e0':''}">
              <td style="font-weight:${r.count>500?'700':'400'}">${escHtml(r.nombre)}</td>
              <td>${r.mes}</td><td>${r.anio}</td>
              <td style="text-align:right;color:${r.count>500?'#e65100':'var(--navy)'}"><strong>${r.count}</strong></td>
              <td style="text-align:right">${fmtCOP(r.total)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    status.innerHTML = `<span style="color:var(--red)">Error: ${e.message}</span>`;
  }
};

window.dedupToggleAll = (checked) => {
  document.querySelectorAll('.dedup-chk').forEach(cb => cb.checked = checked);
};

window.eliminarDuplicados = async () => {
  const selected = [...document.querySelectorAll('.dedup-chk:checked')]
    .map(cb => parseInt(cb.dataset.idx))
    .filter(i => !isNaN(i));

  if (!selected.length) { toast('Selecciona al menos un grupo.','error'); return; }

  const refsToDelete = selected.flatMap(i => _dedupGroups[i]?.toDelete || []);
  if (!refsToDelete.length) return;

  if (!confirm(`Eliminar ${refsToDelete.length} registro${refsToDelete.length>1?'s':''} duplicado${refsToDelete.length>1?'s':''}? Esta acción no se puede deshacer.`)) return;

  const btn = document.getElementById('btnEliminarDups');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Eliminando...';

  try {
    // Delete in batches of 20
    for (let i=0; i<refsToDelete.length; i+=20) {
      await Promise.all(refsToDelete.slice(i,i+20).map(ref=>deleteDoc(ref)));
    }
    toast(`${refsToDelete.length} duplicado${refsToDelete.length>1?'s':''} eliminado${refsToDelete.length>1?'s':''}. Reportes actualizados.`,'success');
    closeDedupModal();
    // Refresh iframe
    setTimeout(()=>{ const f=document.getElementById('repFrame'); if(f) f.src=f.src; },1000);
  } catch(e) {
    toast('Error: '+e.message,'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-trash"></i> Eliminar seleccionados';
  }
};

/* ══════════════════════════════════════════════════
   BORRAR TODAS LAS FACTURAS — RESET REPORTES
══════════════════════════════════════════════════ */
window.borrarTodasFacturas = async () => {
  const confirm1 = confirm('Vas a eliminar TODAS las facturas de Reportes.\n\nEsto no afecta Clientes, UROEXPERTOS, Turnos ni ningún otro módulo.\n\n¿Continuar?');
  if (!confirm1) return;
  const confirm2 = confirm('SEGUNDA CONFIRMACIÓN\n\nEsta acción es IRREVERSIBLE.\n\n¿Estás seguro?');
  if (!confirm2) return;

  const btn = document.getElementById('btnBorrarFacturas');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Borrando...'; }

  try {
    let total = 0;
    // Get all in batches
    while (true) {
      const snap = await getDocs(collection(db,'facturas'));
      if (!snap.docs.length) break;
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      total += snap.docs.length;
      if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Borrando... ${total}`;
      if (snap.docs.length < 100) break; // Firestore returns max 100 by default with getDocs
    }
    toast(`${total} facturas eliminadas. Ahora puedes importar desde cero.`, 'success');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Borrar todas las facturas'; }
    // Refresh iframe
    setTimeout(()=>{ const f=document.getElementById('repFrame'); if(f) f.src=f.src; }, 800);
  } catch(e) {
    toast('Error: '+e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-trash"></i> Borrar todas las facturas'; }
  }
};

/* ══════════════════════════════════════════════════
   ENVIAR CORREO — TABLAS HIJAS UROEXPERTOS
══════════════════════════════════════════════════ */

let _envContext = null; // {tablaId, idx, fila, especialista, correo}

window.openEnviarModal = (tablaId, idx) => {
  const tabla = tablasEgreso.find(t=>t.id===tablaId);
  const fila  = tabla?.filas?.[idx];
  if (!fila) { toast('No se encontró el registro.','error'); return; }

  // Validar: información en la fila
  if (!fila.nombre) {
    toast('No es posible enviar el correo, falta información requerida (especialista).','error');
    return;
  }

  // Buscar especialista en Clientes y su correo
  const doctor = doctors.find(d => d.especialista === fila.nombre);
  const correo = doctor?.correo?.trim() || '';

  if (!correo) {
    toast(`No es posible enviar: ${fila.nombre} no tiene correo registrado en Clientes.`,'error');
    return;
  }

  _envContext = { tablaId, idx, fila, especialista: fila.nombre, correo, tablaNombre: tabla.nombre||'', mesLabel: mesFilaLabel(fila.mes) };

  document.getElementById('envEspecialista').textContent = fila.nombre;
  document.getElementById('envCorreo').textContent = correo;

  // Fecha de hoy como valor predeterminado
  const hoy = new Date();
  const fechaStr = hoy.toISOString().slice(0,10);
  const nombreLimpio = fila.nombre.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g,'').replace(/\s+/g,'_');

  document.getElementById('envAdjunto').textContent = `Comprobante_Egreso_${nombreLimpio}_${fechaStr}.pdf`;
  // Fecha del archivo — editable, predeterminada hoy
  const fechaInput = document.getElementById('envFechaArchivo');
  if (fechaInput) fechaInput.value = fechaStr;
  // Selector de abono — predeterminado "No"
  const abonoSel = document.getElementById('envEsAbono');
  if (abonoSel) abonoSel.value = 'no';

  document.getElementById('envAsunto').value = `Notificación de pago de honorarios profesionales — ${_envContext.mesLabel}`;
  // Componer el mensaje con la fecha y el estado de abono actuales
  envActualizarMensaje();

  document.getElementById('enviarModal').classList.add('open');
};

/* Fecha ISO "2026-08-20" → texto legible "20 de agosto de 2026" */
function fechaLegibleLarga(iso){
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('es-CO', {day:'numeric', month:'long', year:'numeric'});
}

/* Compone el cuerpo del mensaje según la fecha del adjunto y si es abono.
   Se llama al abrir el modal y cada vez que cambia la fecha o el selector de abono. */
window.envActualizarMensaje = () => {
  if (!_envContext) return;
  const fechaISO = document.getElementById('envFechaArchivo')?.value || new Date().toISOString().slice(0,10);
  const fechaTxt = fechaLegibleLarga(fechaISO);
  const esAbono  = document.getElementById('envEsAbono')?.value === 'si';
  const mesLabel = _envContext.mesLabel;
  const nombre   = _envContext.especialista;

  const parrafoPago = esAbono
    ? `Nos permitimos informar que se ha realizado un abono correspondiente a sus honorarios profesionales del periodo ${mesLabel}, efectuado en la fecha ${fechaTxt}.`
    : `Nos permitimos informar que el pago correspondiente a sus honorarios profesionales del periodo ${mesLabel} ha sido realizado exitosamente en la fecha ${fechaTxt}.`;

  document.getElementById('envMensaje').value =
`Estimado Dr. ${nombre}, cordial saludo.

${parrafoPago}

Adjunto remitimos el comprobante de egreso con la información correspondiente para su validación y control.

Agradecemos su compromiso, profesionalismo y valioso apoyo en la prestación de servicios.`;
};

/* Actualiza el nombre del adjunto Y el mensaje cuando cambia la fecha */
window.envActualizarNombreAdjunto = () => {
  if (!_envContext) return;
  const fecha = document.getElementById('envFechaArchivo')?.value || new Date().toISOString().slice(0,10);
  const nombreLimpio = _envContext.especialista.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g,'').replace(/\s+/g,'_');
  document.getElementById('envAdjunto').textContent = `Comprobante_Egreso_${nombreLimpio}_${fecha}.pdf`;
  // La fecha también debe reflejarse en el mensaje (sincronización total)
  envActualizarMensaje();
};

/* Convertir "2026-03" a "Marzo de 2026" */
function mesFilaLabel(mesVal) {
  if (!mesVal) return '';
  const MESES_LBL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const m = String(mesVal).match(/^(\d{4})-(\d{2})$/);
  if (m) return `${MESES_LBL[parseInt(m[2])-1]} de ${m[1]}`;
  return String(mesVal);
}

window.closeEnviarModal = () => {
  document.getElementById('enviarModal').classList.remove('open');
  _envContext = null;
};

/* Logo UROEXPERTOS embebido (JPEG base64) */
const UROEXPERTOS_LOGO_B64 = 'data:image/jpeg;base64,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';

/* Generar PDF del registro como base64 — formato Comprobante de Egreso */
function generarAdjuntoFila(fila, tablaNombre, fechaEmisionISO) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('jsPDF no disponible. Recarga la página.');

  const fmtV = v => '$ ' + (Number(v)||0).toLocaleString('es-CO');
  const navy = [26, 58, 107];

  const pdf = new jsPDF({ unit:'mm', format:'letter' });
  const W = 216, M = 14;
  let y = 16;

  // ── Encabezado ──
  // Logo UROEXPERTOS — esquina superior izquierda (título queda a la derecha)
  try {
    const logoW = 46, logoH = logoW / 3.05; // mantiene proporción
    pdf.addImage(UROEXPERTOS_LOGO_B64, 'JPEG', M, 8, logoW, logoH);
  } catch(e) { /* si falla el logo, el PDF sigue generándose */ }
  pdf.setFont('courier','bold'); pdf.setFontSize(13); pdf.setTextColor(...navy);
  pdf.text('COMPROBANTE DE EGRESO', W-M, y, {align:'right'});
  y += 6;
  pdf.setFontSize(9); pdf.setFont('courier','normal'); pdf.setTextColor(60);
  // Fecha de Emisión: usa la fecha del formulario de envío (campo "Fecha del archivo adjunto").
  // Si no se provee, usa la fecha de hoy. Se formatea "YYYY-MM-DD" → "DD/MM/YYYY".
  const fechaEmisionTxt = fechaEmisionISO
    ? fmtFechaLegible(fechaEmisionISO)
    : new Date().toLocaleDateString('es-CO');
  pdf.text(`Fecha de Emisión: ${fechaEmisionTxt}`, W-M, y, {align:'right'});
  y += 4;
  pdf.setDrawColor(...navy); pdf.setLineWidth(0.8);
  pdf.line(M, y, W-M, y);
  y += 8;

  // Helper: section header bar
  const secHead = (titulo) => {
    pdf.setFillColor(...navy);
    pdf.rect(M, y-4.5, W-2*M, 6.5, 'F');
    pdf.setFont('courier','bold'); pdf.setFontSize(8.5); pdf.setTextColor(255);
    pdf.text(titulo, M+2, y);
    y += 7;
  };
  // Helper: field row
  const fieldRow = (label, value, bold=false) => {
    pdf.setFont('courier', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(40);
    pdf.text(label, M+2, y);
    pdf.setFont('courier', bold?'bold':'normal'); pdf.setTextColor(17);
    pdf.text(String(value||'—'), M+58, y);
    pdf.setDrawColor(190); pdf.setLineWidth(0.2);
    pdf.line(M+56, y+1, W-M-2, y+1);
    y += 6;
  };
  // Helper: money row (right aligned)
  const moneyRow = (label, value) => {
    pdf.setFont('courier','normal'); pdf.setFontSize(8.5); pdf.setTextColor(40);
    pdf.text(label, M+2, y);
    pdf.setTextColor(17);
    pdf.text(fmtV(value), W-M-2, y, {align:'right'});
    pdf.setDrawColor(220); pdf.setLineWidth(0.2);
    pdf.line(M+2, y+1.5, W-M-2, y+1.5);
    y += 6;
  };

  // ── Información del beneficiario ──
  secHead('INFORMACIÓN DEL BENEFICIARIO');
  fieldRow('Nombre:', fila.nombre, true);
  y += 2;

  // ── Información del servicio ──
  secHead('INFORMACIÓN DEL SERVICIO');
  fieldRow('IPS:', tablaNombre);
  fieldRow('Mes del Servicio:', mesFilaLabel(fila.mes));
  fieldRow('N. Factura:', fila.factura);
  y += 2;

  // ── Detalle financiero ──
  secHead('DETALLE FINANCIERO');
  moneyRow('VALOR FACTURA:', fila.valorFactura);
  moneyRow('(-) ABONO', fila.abono);
  moneyRow('(-) GLOSA', fila.glosa);
  moneyRow('(-) RETE FUENTE', fila.reteFuente);
  moneyRow('(-) AFC', fila.afc);
  moneyRow('(-) RESIDENTES', fila.residentes);
  moneyRow('(-) TIQUETES', fila.tiquetes);
  moneyRow('(-) HOTEL', fila.hotel);
  moneyRow('(-) TRANSPORTE', fila.transporte);

  // ── Valor neto a pagar (barra azul) ──
  y += 1;
  pdf.setFillColor(...navy);
  pdf.rect(M, y-4.5, W-2*M, 8, 'F');
  pdf.setFont('courier','bold'); pdf.setFontSize(10); pdf.setTextColor(255);
  pdf.text('VALOR NETO A PAGAR', M+2, y+0.5);
  pdf.text(fmtV(fila.valorPagar), W-M-2, y+0.5, {align:'right'});
  y += 14;

  // ── Firmas ──
  y = Math.max(y, 200);
  const firmaW = (W-2*M-20)/3;
  const firmas = [
    ['Angela Paredes','APROBADO POR'],
    ['Rosa Castellanos','REVISADO POR'],
    ['Angela Paredes','AUTORIZÓ PAGO'],
  ];
  firmas.forEach((f,i) => {
    const fx = M + i*(firmaW+10);
    pdf.setFont('courier','normal'); pdf.setFontSize(8); pdf.setTextColor(17);
    pdf.text(f[0], fx+firmaW/2, y, {align:'center'});
    pdf.setDrawColor(50); pdf.setLineWidth(0.4);
    pdf.line(fx, y+1.5, fx+firmaW, y+1.5);
    pdf.setFontSize(7); pdf.setTextColor(90); pdf.setFont('courier','bold');
    pdf.text(f[1], fx+firmaW/2, y+5.5, {align:'center'});
  });

  // Footer
  pdf.setFont('courier','normal'); pdf.setFontSize(7); pdf.setTextColor(150);
  pdf.text('Documento generado automáticamente — Sistema BOE UroExpertos', W/2, 268, {align:'center'});

  // Return base64 (without the data: prefix)
  return pdf.output('datauristring').split(',')[1];
}

window.enviarCorreoFila = async () => {
  if (!_envContext) return;
  const { fila, especialista, correo, tablaNombre } = _envContext;

  const asunto  = document.getElementById('envAsunto').value.trim();
  const mensaje = document.getElementById('envMensaje').value.trim();
  if (!asunto) { toast('El asunto es obligatorio.','error'); return; }

  const btn = document.getElementById('btnEnviarCorreo');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

  try {
    // Fecha del formulario: única fuente para el nombre del archivo Y la Fecha de Emisión del PDF
    const fechaStr = document.getElementById('envFechaArchivo')?.value || new Date().toISOString().slice(0,10);
    // Generar adjunto usando esa misma fecha como Fecha de Emisión
    const base64 = generarAdjuntoFila(fila, tablaNombre, fechaStr);
    const nombreLimpio = especialista.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g,'').replace(/\s+/g,'_');
    const attachmentName = `Comprobante_Egreso_${nombreLimpio}_${fechaStr}.pdf`;

    // Llamar a la función serverless
    const resp = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: correo,
        subject: asunto,
        message: mensaje,
        attachmentBase64: base64,
        attachmentName,
      }),
    });

    const data = await resp.json();
    if (!resp.ok || !data.ok) throw new Error(data.error || 'Error desconocido');

    // Marcar la fila como enviada en Firestore (botón pasa a verde)
    try {
      const { tablaId, idx } = _envContext;
      const tabla = tablasEgreso.find(t=>t.id===tablaId);
      if (tabla) {
        const filas = [...(tabla.filas||[])];
        if (filas[idx]) {
          filas[idx] = { ...filas[idx], correoEnviado: true, correoFecha: new Date().toISOString() };
          await updateDoc(doc(db,'tablasEgreso',tablaId), { filas, updatedAt: serverTimestamp() });
        }
      }
    } catch(e2) { console.warn('No se pudo marcar fila como enviada:', e2); }

    toast('Correo enviado correctamente al especialista.','success');
    closeEnviarModal();
  } catch(e) {
    toast('Error al enviar correo, validar configuración o datos. ('+e.message+')','error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar correo';
  }
};

/* ══════════════════════════════════════════════════
   EXTRACCIÓN DE DATOS — PDF a Excel (pdf.js + Tesseract OCR)
══════════════════════════════════════════════════ */

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let extArchivos = [];   // [{name, data(ArrayBuffer), pdfDoc}]
let extCampos   = [];   // [{nombre, page, rect:{x,y,w,h} normalizado 0-1}]
let extActivo   = -1;   // índice del archivo abierto
let extPagina   = 1;
let extNumPags  = 1;
let extResultados = []; // filas extraídas
let extRenderScale = 1.4;

/* ── Cargar archivos ── */
window.extCargarArchivos = async (ev) => {
  const files = [...(ev.target.files||[])];
  if (!files.length) return;
  for (const f of files) {
    const data = await f.arrayBuffer();
    extArchivos.push({ name: f.name, data, pdfDoc: null });
  }
  ev.target.value = '';
  extRenderListaArchivos();
  if (extActivo === -1 && extArchivos.length) extAbrirArchivo(0);
  toast(`${files.length} PDF${files.length>1?'s':''} cargado${files.length>1?'s':''}.`,'success');
};

function extRenderListaArchivos() {
  const cont = document.getElementById('extListaArchivos');
  if (!extArchivos.length) {
    cont.innerHTML = '<span style="color:var(--gray-3);font-size:12px">Sin archivos. Carga uno o varios PDF.</span>';
    return;
  }
  cont.innerHTML = extArchivos.map((a,i)=>`
    <div style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:6px;cursor:pointer;${i===extActivo?'background:var(--blue-pale);border:1px solid var(--blue)':'border:1px solid transparent'}"
      onclick="extAbrirArchivo(${i})">
      <i class="fa-solid fa-file-pdf" style="color:#c0392b;font-size:13px"></i>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:${i===extActivo?'700':'400'};color:var(--navy)" title="${escHtml(a.name)}">${escHtml(a.name)}</span>
      <button onclick="event.stopPropagation();extQuitarArchivo(${i})" style="border:none;background:none;color:var(--gray-3);cursor:pointer;font-size:11px;padding:2px"><i class="fa-solid fa-xmark"></i></button>
    </div>`).join('');
}

window.extQuitarArchivo = (i) => {
  extArchivos.splice(i,1);
  if (extActivo === i) { extActivo = -1; extLimpiarVisor(); }
  else if (extActivo > i) extActivo--;
  extRenderListaArchivos();
};

function extLimpiarVisor() {
  const canvas = document.getElementById('extCanvas');
  canvas.width = 0; canvas.height = 0;
  document.getElementById('extOverlay').innerHTML = '';
  document.getElementById('extDocNombre').textContent = 'Selecciona un documento';
  document.getElementById('extPagInfo').textContent = '— / —';
}

/* ── Abrir y renderizar PDF ── */
window.extAbrirArchivo = async (i) => {
  extActivo = i;
  extPagina = 1;
  extRenderListaArchivos();
  const arch = extArchivos[i];
  document.getElementById('extDocNombre').textContent = arch.name;
  try {
    if (!arch.pdfDoc) {
      arch.pdfDoc = await pdfjsLib.getDocument({data: arch.data.slice(0)}).promise;
    }
    extNumPags = arch.pdfDoc.numPages;
    await extRenderPagina();
  } catch(e) {
    toast('Error al abrir PDF: '+e.message,'error');
  }
};

window.extCambiarPagina = async (dir) => {
  if (extActivo === -1) return;
  const nueva = extPagina + dir;
  if (nueva < 1 || nueva > extNumPags) return;
  extPagina = nueva;
  await extRenderPagina();
};

async function extRenderPagina() {
  const arch = extArchivos[extActivo];
  if (!arch?.pdfDoc) return;
  const page = await arch.pdfDoc.getPage(extPagina);
  const viewport = page.getViewport({scale: extRenderScale});
  const canvas = document.getElementById('extCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  await page.render({canvasContext: ctx, viewport}).promise;
  document.getElementById('extPagInfo').textContent = `${extPagina} / ${extNumPags}`;
  extDibujarCampos();
}

/* ── Dibujar recuadros de campos existentes ── */
function extDibujarCampos() {
  const overlay = document.getElementById('extOverlay');
  const canvas  = document.getElementById('extCanvas');
  overlay.innerHTML = '';
  extCampos.forEach((c,i) => {
    if (c.page !== extPagina) return;
    const div = document.createElement('div');
    div.style.cssText = `position:absolute;border:2px solid #2e7d32;background:rgba(46,125,50,.12);border-radius:3px;pointer-events:none;
      left:${c.rect.x*canvas.width}px;top:${c.rect.y*canvas.height}px;width:${c.rect.w*canvas.width}px;height:${c.rect.h*canvas.height}px`;
    const lbl = document.createElement('span');
    lbl.textContent = c.nombre;
    lbl.style.cssText = 'position:absolute;top:-18px;left:0;background:#2e7d32;color:white;font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;white-space:nowrap;font-family:Nunito,sans-serif';
    div.appendChild(lbl);
    overlay.appendChild(div);
  });
}

/* ── Selección con mouse ── */
(function extSetupSeleccion(){
  document.addEventListener('DOMContentLoaded', () => {
    const wrap = document.getElementById('extCanvasWrap');
    if (!wrap) return;
    let selDiv = null, startX = 0, startY = 0, seleccionando = false;

    wrap.addEventListener('mousedown', e => {
      if (extActivo === -1) return;
      const rect = wrap.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      seleccionando = true;
      selDiv = document.createElement('div');
      selDiv.style.cssText = `position:absolute;border:2px dashed var(--blue);background:rgba(21,101,192,.1);left:${startX}px;top:${startY}px;width:0;height:0;pointer-events:none;z-index:10`;
      wrap.appendChild(selDiv);
      e.preventDefault();
    });

    wrap.addEventListener('mousemove', e => {
      if (!seleccionando || !selDiv) return;
      const rect = wrap.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;
      selDiv.style.left   = Math.min(startX,curX)+'px';
      selDiv.style.top    = Math.min(startY,curY)+'px';
      selDiv.style.width  = Math.abs(curX-startX)+'px';
      selDiv.style.height = Math.abs(curY-startY)+'px';
    });

    wrap.addEventListener('mouseup', e => {
      if (!seleccionando || !selDiv) return;
      seleccionando = false;
      const rect = wrap.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;
      const x = Math.min(startX,endX), y = Math.min(startY,endY);
      const w = Math.abs(endX-startX), h = Math.abs(endY-startY);
      selDiv.remove(); selDiv = null;
      if (w < 8 || h < 6) return; // selección muy pequeña — ignorar

      const canvas = document.getElementById('extCanvas');
      if (!canvas.width) return;

      const nombre = prompt('Nombre del campo (ej: Paciente, Valor_Total, Numero_Factura):','');
      if (!nombre || !nombre.trim()) return;

      const nuevoCampo = {
        nombre: nombre.trim().replace(/\s+/g,'_'),
        page: extPagina,
        rect: { x: x/canvas.width, y: y/canvas.height, w: w/canvas.width, h: h/canvas.height },
        anchor: null
      };
      extCampos.push(nuevoCampo);
      extRenderListaCampos();
      extDibujarCampos();
      // Capturar etiqueta-ancla cercana (async) para tolerar PDFs desplazados
      (async () => {
        try {
          const arch = extArchivos[extActivo];
          if (!arch?.pdfDoc) return;
          const items = await extItemsPagina(arch.pdfDoc, nuevoCampo.page, 'ref'+extActivo);
          nuevoCampo.anchor = extBuscarAncla(items, nuevoCampo.rect);
          nuevoCampo.sample = extTextoEnRect(items, nuevoCampo.rect) || '';
        } catch(e) { /* sin ancla — usará tolerancia vertical */ }
      })();
    });
  });
})();

function extRenderListaCampos() {
  const cont = document.getElementById('extListaCampos');
  if (!extCampos.length) {
    cont.innerHTML = '<span style="color:var(--gray-3);font-size:12px">Sin campos aún.</span>';
    return;
  }
  cont.innerHTML = extCampos.map((c,i)=>`
    <div style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-radius:6px;background:var(--gray-0);border:1px solid var(--gray-1)">
      <i class="fa-solid fa-tag" style="color:#2e7d32;font-size:11px"></i>
      <span style="flex:1;font-weight:600;color:var(--navy);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(c.nombre)}</span>
      <span style="font-size:10px;color:var(--gray-3)">pág ${c.page}</span>
      <button onclick="extQuitarCampo(${i})" style="border:none;background:none;color:var(--red);cursor:pointer;font-size:11px;padding:2px"><i class="fa-solid fa-trash"></i></button>
    </div>`).join('');
}

window.extQuitarCampo = (i) => {
  extCampos.splice(i,1);
  extRenderListaCampos();
  extDibujarCampos();
};

/* ═══════════════════════════════════════════════════════════════
   MOTOR DE EXTRACCIÓN v5 — extracción por contenido y contexto
   ─────────────────────────────────────────────────────────────
   Arquitectura:
   1. Localización por ETIQUETAS con sinónimos (no por coordenadas)
   2. Tipado semántico del campo (fecha/dinero/id/código/teléfono/texto)
   3. Extracción dirigida por tipo con expresiones regulares
   4. Cascada de estrategias con puntaje de confianza (gate)
   5. OCR con worker compartido (una sola inicialización)
   6. Validaciones post-extracción con advertencias visibles
═══════════════════════════════════════════════════════════════ */

/* ── Normalización de texto para comparaciones ── */
function extNorm(s){
  return (s||'').toString().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();
}

/* ── Diccionario de sinónimos por concepto ──
   Permite encontrar "N° Factura", "Invoice", "Nro" cuando el campo
   fue configurado sobre "Factura:" (y viceversa). */
const EXT_SINONIMOS = {
  factura: ['factura','no. factura','n factura','nro factura','numero de factura','no factura','num factura','invoice','documento no','consecutivo'],
  fecha:   ['fecha','fecha del folio','fecha de emision','fecha emision','fecha ingreso','fecha factura','fecha de expedicion','date'],
  nombre:  ['nombre','paciente','nombres y apellidos','razon social','cliente','beneficiario','especialista','nombre cirujano','nombre completo'],
  id:      ['identificacion','cedula','documento','cc','nit','no. documento','historia clinica','id paciente','numero documento'],
  dinero:  ['valor','total','valor total','importe','monto','valor factura','total a pagar','vr','subtotal','valor neto'],
  entidad: ['entidad','eps','aseguradora','entidad ingreso','entidad paciente','empresa'],
  codigo:  ['codigo','cups','cie10','cie 10','codigo cups','procedimiento'],
  telefono:['telefono','tel','celular','movil'],
};

/* ── Genera las etiquetas candidatas de un campo:
   ancla capturada + nombre del campo + sinónimos del concepto detectado ── */
function extEtiquetasCandidatas(campo){
  const set = new Set();
  const anchorTxt = extNorm(campo.anchor?.text||'').replace(/[:.]+$/,'').trim();
  const nombreTxt = extNorm((campo.nombre||'').replace(/_/g,' '));
  if (anchorTxt.length >= 3) set.add(anchorTxt);
  if (nombreTxt.length >= 3) set.add(nombreTxt);

  // Detectar a qué concepto pertenece por palabras clave
  const base = anchorTxt + ' ' + nombreTxt;
  for (const [grupo, sins] of Object.entries(EXT_SINONIMOS)){
    const claves = { factura:['factura','invoice'], fecha:['fecha','date'],
      nombre:['nombre','paciente','cliente','beneficiario','cirujano','especialista'],
      id:['cedula','identificacion','documento','nit','historia','cc'],
      dinero:['valor','total','importe','monto'], entidad:['entidad','eps','aseguradora'],
      codigo:['codigo','cups','cie'], telefono:['telefono','celular'] }[grupo]||[];
    if (claves.some(k => base.includes(k))) sins.forEach(s => set.add(s));
  }
  // Más específicas primero (evita que "no" matchee antes que "no. factura")
  return [...set].sort((a,b)=>b.length-a.length);
}

/* ── Tipo semántico del campo: por muestra capturada + nombre ── */
function extTipoSemantico(campo){
  const s = (campo?.sample||'').trim();
  const nom = extNorm((campo?.nombre||'').replace(/_/g,' '));
  // 1) La muestra manda
  if (s){
    if (/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(s)) return 'fecha';
    if (/^\$|\d{1,3}([.,]\d{3})+/.test(s) && /valor|total|importe|monto/.test(nom)) return 'dinero';
    // codigo alfanumérico (P00267) ANTES que id — requiere prefijo de letras
    if (/^[A-Za-z]{1,3}\d{3,}$/.test(s.replace(/\s/g,''))) return 'codigo';
    const dig = (s.match(/\d/g)||[]).length;
    const len = s.replace(/\s/g,'').length;
    if (dig >= 5 && dig/Math.max(len,1) > 0.75) return 'id';
  }
  // 2) El nombre del campo como respaldo (palabras completas)
  if (/\bfecha\b|\bdate\b/.test(nom))                          return 'fecha';
  if (/\bvalor\b|\btotal\b|\bimporte\b|\bmonto\b/.test(nom))   return 'dinero';
  if (/\bcedula\b|\bidentificacion\b|\bdocumento\b|\bnit\b|\bhistoria\b/.test(nom)) return 'id';
  if (/\bcodigo\b|\bcups\b|\bcie\s?10\b/.test(nom))            return 'codigo';
  if (/\btelefono\b|\bcelular\b/.test(nom))                    return 'telefono';
  return 'texto';
}

/* ── Extractores por tipo: sacan el dato del texto crudo ── */
function extExtraerPorTipo(s, tipo, campo){
  if (!s) return '';
  switch(tipo){
    case 'fecha': {
      const m = s.match(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}(\s+\d{1,2}:\d{2})?/);
      return m ? m[0] : '';
    }
    case 'dinero': {
      const m = s.match(/\$?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?/g);
      if (!m) return '';
      m.sort((a,b)=>b.replace(/\D/g,'').length - a.replace(/\D/g,'').length);
      return m[0].trim();
    }
    case 'id': {
      const m = s.match(/\d[\d.]{4,}/g);
      if (!m) return '';
      const lenS = (campo?.sample||'').replace(/\D/g,'').length;
      m.sort((a,b)=>Math.abs(a.replace(/\D/g,'').length-lenS) - Math.abs(b.replace(/\D/g,'').length-lenS));
      return m[0];
    }
    case 'codigo': {
      const m = s.match(/[A-Za-z]{0,3}\d{3,}/g);
      return m ? m.sort((a,b)=>b.length-a.length)[0] : '';
    }
    case 'telefono': {
      const m = s.match(/\d{7,10}/);
      return m ? m[0] : '';
    }
    default: return s;
  }
}

/* ── Limpieza de texto crudo (bordes, eco de etiqueta, duplicados, colgantes) ── */
function extLimpiarValor(raw, campo){
  let s = (raw||'').replace(/\s+/g,' ').trim();
  if (!s) return '';

  // Bordes con basura
  s = s.replace(/^[^\wÁÉÍÓÚÑáéíóúñ$(\d]+/,'').replace(/[\s:;,\.\-_|=]+$/,'').trim();

  // Eco de la etiqueta
  if (campo?.anchor?.text){
    const a = campo.anchor.text.replace(/[:\s]+$/,'');
    if (a.length >= 4){
      const rx = new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');
      s = s.replace(rx,' ').replace(/\s+/g,' ').trim();
    }
  }

  // Duplicación exacta ("ALIANZA ... ALIANZA ...")
  const m = s.match(/^(.{6,}?)\s+\1$/);
  if (m) s = m[1].trim();

  // Extracción dirigida por tipo
  const tipo = extTipoSemantico(campo);
  if (tipo !== 'texto'){
    const t = extExtraerPorTipo(s, tipo, campo);
    if (t) return t;
    // sin patrón del tipo — devolver s; el puntaje lo rechazará
  }

  // Etiqueta colgante ("... o Civil: z")
  const lm = s.match(/\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñÁÉÍÓÚÑ]{2,24}:(\s|$)/);
  if (lm && lm.index > 3) s = s.slice(0, lm.index).trim();

  // Conectores sueltos al final
  s = s.replace(/\s+(o|y|de|del|la|el)$/i,'').trim();
  return s;
}

/* ── Puntaje de confianza (0-1). Gate de la cascada. ── */
function extPuntuarCandidato(v, campo){
  if (!v) return 0;
  const tipo = extTipoSemantico(campo);
  if (tipo === 'fecha')  return /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(v) ? 0.95 : 0.05;
  if (tipo === 'dinero') return /\d/.test(v) ? 0.9 : 0.05;
  if (tipo === 'id'){
    const d = (v.match(/\d/g)||[]).length;
    if (d < 5) return 0.05;
    const lenS = (campo?.sample||'').replace(/\D/g,'').length;
    return (lenS && Math.abs(d-lenS) <= 2) ? 0.95 : 0.7;
  }
  if (tipo === 'codigo')   return /\d{3,}/.test(v) ? 0.9 : 0.05;
  if (tipo === 'telefono') return /\d{7,10}/.test(v) ? 0.9 : 0.05;
  // texto
  const letras = (v.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g)||[]).length;
  if (letras < 3) return 0.2;
  let sc = 0.6;
  if (/[\[\]{}|=_]/.test(v)) sc -= 0.25;
  const sample = campo?.sample||'';
  if (sample){
    const lr = Math.min(v.length,sample.length)/Math.max(v.length,sample.length,1);
    sc += lr*0.2;
  } else sc += 0.1;
  return Math.max(0, Math.min(1, sc));
}

/* ── Items de texto de una página en coords normalizadas (cache) ── */
const _extItemsCache = new Map();
async function extItemsPagina(pdfDoc, pageNum, cacheKey) {
  const key = cacheKey+'_p'+pageNum;
  if (_extItemsCache.has(key)) return _extItemsCache.get(key);
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({scale: 1});
  const tc = await page.getTextContent();
  const items = [];
  for (const item of tc.items) {
    if (!item.str || !item.str.trim()) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const h = Math.abs(tx[3]) || 10;
    items.push({
      str: item.str,
      x: tx[4]/viewport.width,
      y: (tx[5]-h)/viewport.height,
      w: (item.width||0)/viewport.width,
      h: h/viewport.height,
    });
  }
  _extItemsCache.set(key, items);
  return items;
}

/* ── Reconstrucción de líneas (inmune a fragmentación variable) ── */
function extLineas(items){
  const lineas = [];
  const sorted = [...items].sort((a,b)=> a.y-b.y || a.x-b.x);
  sorted.forEach(it=>{
    const cy = it.y + it.h/2;
    let L = lineas.find(l => Math.abs(l.cy - cy) < Math.max(it.h*0.6, 0.006));
    if (!L){ L = {cy, items:[]}; lineas.push(L); }
    L.items.push(it);
  });
  lineas.forEach(L=> L.items.sort((a,b)=>a.x-b.x));
  lineas.sort((a,b)=>a.cy-b.cy);
  return lineas;
}

/* ── Localizar una etiqueta en las líneas (fuzzy, multifragmento) ── */
function extLocalizarEtiqueta(lineas, etiquetaNorm){
  if (!etiquetaNorm || etiquetaNorm.length < 3) return null;
  for (const L of lineas){
    let concat = '';
    const map = [];
    for (const it of L.items){
      const s = extNorm(it.str);
      for (let k=0; k<s.length; k++) map.push({item:it, frac:(k+1)/Math.max(s.length,1)});
      concat += s;
      concat += ' '; map.push({item:it, frac:1});
    }
    const idx = concat.indexOf(etiquetaNorm);
    if (idx !== -1){
      const endRef = map[Math.min(idx + etiquetaNorm.length - 1, map.length-1)];
      if (!endRef) continue;
      const it = endRef.item;
      return { linea: L, xFin: it.x + it.w * Math.min(1, endRef.frac), y: it.y, h: it.h };
    }
  }
  return null;
}

/* ── Localizar con lista de candidatas (sinónimos) ── */
function extLocalizarConSinonimos(lineas, etiquetas){
  for (const e of etiquetas){
    const loc = extLocalizarEtiqueta(lineas, e);
    if (loc) return loc;
  }
  // Tolerancia OCR: primera palabra significativa de cada etiqueta
  for (const e of etiquetas){
    const palabras = e.replace(/:/g,'').split(' ').filter(p=>p.length>=4);
    for (const p of palabras){
      const loc = extLocalizarEtiqueta(lineas, p);
      if (loc) return loc;
    }
  }
  return null;
}

/* ── ¿Parece nueva etiqueta? ── */
function extEsEtiqueta(s){
  const t = (s||'').trim();
  return /:$/.test(t) || /^[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ\.\s\/]{1,32}:(\s|$)/.test(t);
}

/* ── Corta "23/05/2026 14:22 Area Servicio:" → "23/05/2026 14:22" ── */
function extCortarEtiquetaInterna(s){
  const m = s.match(/\s+[A-ZÁÉÍÓÚÑ][^:]{1,30}:(\s|$)/);
  return m ? { texto: s.slice(0, m.index).trim(), corte: true }
           : { texto: s.trim(), corte: false };
}

/* ── Valor a la DERECHA de una etiqueta, cortando en la siguiente etiqueta ── */
function extValorDerecha(loc, anchoMax){
  const out = [];
  for (const it of loc.linea.items){
    const itFin = it.x + it.w;
    if (itFin <= loc.xFin + 0.002) continue;
    if (anchoMax && it.x > loc.xFin + anchoMax) break;

    let texto = '';
    if (it.x < loc.xFin - 0.001){
      const frac = (loc.xFin - it.x)/Math.max(it.w, 1e-6);
      const cut = Math.round(frac * it.str.length);
      texto = it.str.slice(cut).replace(/^[\s:]+/,'').trim();
    } else {
      texto = it.str.trim();
    }
    if (!texto) continue;
    if (out.length && extEsEtiqueta(texto)) break;
    const { texto: limpio, corte } = extCortarEtiquetaInterna(texto);
    if (limpio) out.push(limpio);
    if (corte) break;
  }
  return out.join(' ').replace(/\s+/g,' ').trim();
}

/* ── Valor DEBAJO de una etiqueta (Hallazgos:, Informe:) ── */
function extValorDebajo(lineas, loc, rect){
  const x1 = Math.max(0, (rect?.x ?? loc.xFin - 0.02) - 0.02);
  const x2 = Math.min(1, x1 + Math.max(rect?.w ?? 0.5, 0.25) + 0.04);
  const yBase = loc.y + loc.h;
  const partes = [];
  let n = 0;
  for (const L of lineas){
    if (L.cy <= yBase) continue;
    if (n >= 3) break;
    const rango = L.items.filter(it => (it.x+it.w) > x1 && it.x < x2);
    if (!rango.length) break;
    if (extEsEtiqueta(rango[0].str) && n > 0) break;
    if (extEsEtiqueta(rango[0].str) && rango.length === 1) break;
    partes.push(rango.map(i=>i.str.trim()).join(' '));
    n++;
    if (L.cy - yBase > 0.06) break;
  }
  return partes.join(' ').replace(/\s+/g,' ').trim();
}

/* ── Texto dentro de un rect por intersección proporcional ── */
function extTextoEnRect(items, rect) {
  const sel = [];
  items.forEach(it => {
    const cy = it.y + it.h/2;
    if (cy < rect.y || cy > rect.y + rect.h) return;
    const ov1 = Math.max(it.x, rect.x);
    const ov2 = Math.min(it.x + it.w, rect.x + rect.w);
    if (ov2 - ov1 <= 0) return;
    const f1 = (ov1 - it.x)/Math.max(it.w, 1e-6);
    const f2 = (ov2 - it.x)/Math.max(it.w, 1e-6);
    const sub = it.str.slice(Math.floor(f1*it.str.length), Math.ceil(f2*it.str.length)).trim();
    if (sub) sel.push({str: sub, x: ov1, y: it.y});
  });
  if (!sel.length) return '';
  sel.sort((a,b) => Math.abs(a.y-b.y) > 0.008 ? a.y-b.y : a.x-b.x);
  return sel.map(s=>s.str).join(' ').replace(/\s+/g,' ').trim();
}

/* ── Ancla cercana al crear un campo: izquierda, mismo item, o arriba ── */
function extBuscarAncla(items, rect) {
  const cy0 = rect.y + rect.h/2;
  let best = null, bestDist = 1e9;
  items.forEach(it => {
    const cy = it.y + it.h/2;
    const enBanda   = Math.abs(cy - cy0) <= Math.max(rect.h, 0.02);
    const izquierda = (it.x + it.w) <= rect.x + 0.012;
    if (enBanda && izquierda && extNorm(it.str).length >= 3) {
      const d = (rect.x - (it.x + it.w)) + Math.abs(cy - cy0) * 4;
      if (d < bestDist) { bestDist = d; best = it; }
    }
  });
  if (best) return { text: best.str.trim(), x: best.x, y: best.y, pos: 'left' };

  let cont = null;
  items.forEach(it => {
    const cy = it.y + it.h/2;
    if (Math.abs(cy - cy0) > Math.max(rect.h, 0.02)) return;
    if (it.x < rect.x - 0.005 && (it.x + it.w) > rect.x) cont = cont || it;
  });
  if (cont){
    const frac = (rect.x - cont.x)/Math.max(cont.w, 1e-6);
    const etiqueta = cont.str.slice(0, Math.round(frac * cont.str.length)).trim();
    if (etiqueta.length >= 3) return { text: etiqueta, x: cont.x, y: cont.y, pos: 'left' };
  }

  best = null; bestDist = 1e9;
  items.forEach(it => {
    const itBottom = it.y + it.h;
    const arriba = itBottom <= rect.y + 0.005 && (rect.y - itBottom) < 0.04;
    const solapaX = (it.x + it.w) > rect.x - 0.02 && it.x < rect.x + rect.w;
    if (arriba && solapaX && extNorm(it.str).length >= 3){
      const d = (rect.y - itBottom) + Math.abs(it.x - rect.x);
      if (d < bestDist){ bestDist = d; best = it; }
    }
  });
  if (best) return { text: best.str.trim(), x: best.x, y: best.y, pos: 'above' };
  return null;
}

/* ── OCR: worker COMPARTIDO (una inicialización por sesión) ── */
let _extWorker = null; // null=no creado, false=fallo, objeto=listo
async function extOcr(imgUrl){
  if (_extWorker === null){
    try {
      const w = Tesseract.createWorker();
      const worker = (w && typeof w.then === 'function') ? await w : w;
      if (worker.load)         await worker.load();
      if (worker.loadLanguage) await worker.loadLanguage('spa');
      if (worker.initialize)   await worker.initialize('spa');
      _extWorker = worker;
    } catch(e){ _extWorker = false; }
  }
  if (_extWorker){
    try { const { data } = await _extWorker.recognize(imgUrl); return data; }
    catch(e){ /* fallback abajo */ }
  }
  const { data } = await Tesseract.recognize(imgUrl, 'spa');
  return data;
}

/* ── OCR de página completa con posiciones de palabras (cache) ── */
const _extOcrCache = new Map();
async function extOcrPagina(pdfDoc, pageNum, cacheKey){
  const key = cacheKey+'_ocr'+pageNum;
  if (_extOcrCache.has(key)) return _extOcrCache.get(key);
  const page = await pdfDoc.getPage(pageNum);
  const vp = page.getViewport({scale: 2.2});
  const cv = document.createElement('canvas');
  cv.width = vp.width; cv.height = vp.height;
  await page.render({canvasContext: cv.getContext('2d'), viewport: vp}).promise;
  const data = await extOcr(cv.toDataURL('image/png'));
  const items = (data.words||[])
    .filter(w => w.text && w.text.trim() && w.confidence > 30)
    .map(w => ({
      str: w.text,
      x: w.bbox.x0/vp.width,  y: w.bbox.y0/vp.height,
      w: (w.bbox.x1-w.bbox.x0)/vp.width, h: (w.bbox.y1-w.bbox.y0)/vp.height,
    }));
  _extOcrCache.set(key, items);
  return items;
}

/* ── MOTOR: cascada de estrategias con gate de confianza ── */
async function extExtraerRegion(pdfDoc, campo, cacheKey) {
  const etiquetas = extEtiquetasCandidatas(campo);
  const anchoMax  = Math.max((campo.rect.w||0.2) * 2.5, 0.25);

  const candidatos = [];
  const ALTO = 0.85, MINIMO = 0.35;
  const probar = (raw) => {
    const v = extLimpiarValor(raw, campo);
    if (!v) return null;
    const sc = extPuntuarCandidato(v, campo);
    candidatos.push({ v, sc });
    return sc >= ALTO ? v : null;
  };
  const mejor = () => {
    candidatos.sort((a,b)=>b.sc-a.sc);
    return (candidatos.length && candidatos[0].sc >= MINIMO) ? candidatos[0].v : '';
  };
  const extraerDeLoc = (lineas, loc) =>
    (campo.anchor?.pos === 'above')
      ? extValorDebajo(lineas, loc, campo.rect)
      : extValorDerecha(loc, anchoMax);

  const items = await extItemsPagina(pdfDoc, campo.page, cacheKey);

  /* A — Ancla exacta + rect desplazado (formatos idénticos, muy rápida) */
  if (campo.anchor?.text && items.length) {
    const anchorNorm = extNorm(campo.anchor.text);
    const matches = items.filter(it => extNorm(it.str) === anchorNorm);
    if (matches.length) {
      matches.sort((a,b) =>
        (Math.abs(a.x-campo.anchor.x)+Math.abs(a.y-campo.anchor.y)) -
        (Math.abs(b.x-campo.anchor.x)+Math.abs(b.y-campo.anchor.y)));
      const m = matches[0];
      const ok = probar(extTextoEnRect(items, {
        x: campo.rect.x + (m.x - campo.anchor.x),
        y: campo.rect.y + (m.y - campo.anchor.y),
        w: campo.rect.w, h: campo.rect.h }));
      if (ok) return ok;
    }
  }

  /* B — Etiquetas + sinónimos por líneas: página configurada, luego todas */
  if (items.length) {
    const paginas = [campo.page];
    for (let p=1; p<=pdfDoc.numPages; p++) if (p !== campo.page) paginas.push(p);
    for (const p of paginas) {
      const its = (p === campo.page) ? items : await extItemsPagina(pdfDoc, p, cacheKey);
      if (!its.length) continue;
      const lineas = extLineas(its);
      const loc = extLocalizarConSinonimos(lineas, etiquetas);
      if (loc) {
        const ok = probar(extraerDeLoc(lineas, loc));
        if (ok) return ok;
      }
    }
  }

  /* C — Rect original + barridos verticales (respaldo posicional) */
  if (items.length) {
    for (const dy of [0,0.01,-0.01,0.02,-0.02,0.035,-0.035,0.05,-0.05,0.065,-0.065,0.08,-0.08]) {
      const ok = probar(extTextoEnRect(items, { x:campo.rect.x, y:campo.rect.y+dy, w:campo.rect.w, h:campo.rect.h }));
      if (ok) return ok;
    }
  }

  /* D — ESCANEADO: OCR de página completa + etiquetas sobre palabras OCR */
  if (items.length < 5) {
    try {
      const ocrItems = await extOcrPagina(pdfDoc, campo.page, cacheKey);
      if (ocrItems.length) {
        const lineas = extLineas(ocrItems);
        const loc = extLocalizarConSinonimos(lineas, etiquetas);
        if (loc) {
          const ok = probar(extraerDeLoc(lineas, loc));
          if (ok) return ok;
        }
        for (const dy of [0,0.015,-0.015,0.03,-0.03,0.05,-0.05,0.08,-0.08]) {
          const ok = probar(extTextoEnRect(ocrItems, { x:campo.rect.x, y:campo.rect.y+dy, w:campo.rect.w, h:campo.rect.h }));
          if (ok) return ok;
        }
      }
    } catch(e) { console.warn('OCR pagina completa fallo:', e); }
  }

  /* E — OCR del recuadro con margen (último recurso) */
  try {
    const page = await pdfDoc.getPage(campo.page);
    const vp2 = page.getViewport({scale: 3});
    const full = document.createElement('canvas');
    full.width = vp2.width; full.height = vp2.height;
    await page.render({canvasContext: full.getContext('2d'), viewport: vp2}).promise;
    const mgn = 0.012;
    const crop = document.createElement('canvas');
    const sw = Math.max(4,(campo.rect.w+mgn*2) * vp2.width);
    const sh = Math.max(4,(campo.rect.h+mgn*2) * vp2.height);
    crop.width = sw; crop.height = sh;
    crop.getContext('2d').drawImage(full,
      Math.max(0,(campo.rect.x-mgn))*vp2.width, Math.max(0,(campo.rect.y-mgn))*vp2.height,
      sw, sh, 0, 0, sw, sh);
    const data = await extOcr(crop.toDataURL('image/png'));
    probar(data.text||'');
  } catch(e) { console.warn('OCR fallo:', e); }

  return mejor();
}

/* ═══════════════════════════════════════════════════════════════
   PIPELINE IA — Clasificación + Extracción con Gemini 2.0 Flash
   (motor principal; el motor v5 local queda como fallback)
═══════════════════════════════════════════════════════════════ */

const EXT_CATEGORIAS = {
  historia_clinica:    'Historia Clínica',
  epicrisis:           'Epicrisis',
  factura:             'Factura',
  orden_medica:        'Orden Médica',
  autorizacion:        'Autorización',
  laboratorio:         'Resultado de Laboratorio',
  formula_medica:      'Fórmula Médica',
  documento_identidad: 'Documento de Identidad',
  informe_quirurgico:  'Informe Quirúrgico',
  otro:                'Otro',
};

/* Renderiza una página del PDF como imagen JPEG base64 (para escaneados) */
async function extRenderPaginaImagen(pdfDoc, pageNum, scale){
  const page = await pdfDoc.getPage(pageNum);
  const vp = page.getViewport({scale: scale||1.4});
  const cv = document.createElement('canvas');
  cv.width = vp.width; cv.height = vp.height;
  await page.render({canvasContext: cv.getContext('2d'), viewport: vp}).promise;
  return cv.toDataURL('image/jpeg', 0.78).split(',')[1];
}

/* Texto digital completo del documento (para PDFs con capa de texto — más barato y preciso) */
async function extTextoCompletoDoc(pdfDoc, cacheKey){
  let out = '';
  const maxPags = Math.min(pdfDoc.numPages, 6);
  for (let p=1; p<=maxPags; p++){
    const items = await extItemsPagina(pdfDoc, p, cacheKey);
    if (!items.length) continue;
    const lineas = extLineas(items);
    out += `\n--- PÁGINA ${p} ---\n`;
    out += lineas.map(L => L.items.map(i=>i.str).join(' ')).join('\n');
    if (out.length > 16000) break;
  }
  return out.slice(0, 16000).trim();
}

/* Construye el prompt de extracción a partir de los campos configurados */
function extConstruirPrompt(campos){
  const lista = campos.map(cp => {
    const tipo = extTipoSemantico(cp);
    const pistas = [];
    if (cp.anchor?.text) pistas.push(`suele aparecer cerca de "${cp.anchor.text.trim()}"`);
    if (cp.sample)       pistas.push(`ejemplo de valor: "${cp.sample.trim()}"`);
    return `- "${cp.nombre}" (tipo: ${tipo})${pistas.length ? ' — ' + pistas.join('; ') : ''}`;
  }).join('\n');

  return `Eres un sistema experto de extracción de datos de documentos médicos y de facturación de Colombia.

TAREA 1 — Clasifica el documento en UNA de estas categorías:
${Object.keys(EXT_CATEGORIAS).join(' | ')}

TAREA 2 — Extrae EXACTAMENTE estos campos (si un campo no aparece en el documento, usa cadena vacía ""):
${lista}

REGLAS ESTRICTAS:
1. Devuelve las fechas tal como aparecen en el documento (ej: 23/05/2026).
2. Para cédulas, NIT y códigos devuelve solo el valor, sin etiquetas ni texto adicional.
3. Para nombres devuelve el nombre completo tal como está escrito.
4. NUNCA inventes datos. Si no estás seguro, usa "" y confianza baja.
5. Asigna a cada campo una confianza entre 0 y 1.

Responde ÚNICAMENTE con este JSON (sin texto adicional, sin markdown):
{"categoria":"...","campos":{${campos.map(cp=>`"${cp.nombre}":"..."`).join(',')}},"confianza":{${campos.map(cp=>`"${cp.nombre}":0.0`).join(',')}}}`;
}

/* Parsea la respuesta JSON de Gemini con tolerancia a fences */
function extParsearRespuestaIA(texto){
  let t = (texto||'').trim().replace(/^```json\s*/i,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
  const i1 = t.indexOf('{'), i2 = t.lastIndexOf('}');
  if (i1 === -1 || i2 === -1) throw new Error('Respuesta IA sin JSON');
  return JSON.parse(t.slice(i1, i2+1));
}

/* Limpieza ligera para valores de la IA (sin heurísticas agresivas) */
function extLimpiarIA(v, campo){
  let s = String(v ?? '').replace(/\s+/g,' ').trim();
  if (!s) return '';
  const tipo = extTipoSemantico(campo);
  if (tipo !== 'texto'){
    const t = extExtraerPorTipo(s, tipo, campo);
    if (t) return t;
  }
  return s;
}

/* Llamada principal: clasifica + extrae un documento con Gemini */
async function extGeminiExtraer(arch, campos, cacheKey){
  const parts = [{ text: extConstruirPrompt(campos) }];

  // Híbrido: texto digital si existe (barato/preciso); imágenes si es escaneado
  const texto = await extTextoCompletoDoc(arch.pdfDoc, cacheKey);
  if (texto.length > 300){
    parts.push({ text: '\nCONTENIDO DEL DOCUMENTO:\n' + texto });
  } else {
    const maxPags = Math.min(arch.pdfDoc.numPages, 4);
    for (let p=1; p<=maxPags; p++){
      const b64 = await extRenderPaginaImagen(arch.pdfDoc, p);
      parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } });
    }
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY2}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    }
  );
  if (!resp.ok){
    const err = await resp.text();
    throw new Error(`Gemini ${resp.status}: ${err.slice(0,120)}`);
  }
  const data = await resp.json();
  const texto_resp = data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || '';
  const json = extParsearRespuestaIA(texto_resp);

  return {
    categoria: EXT_CATEGORIAS[json.categoria] || json.categoria || '',
    valores:   json.campos    || {},
    confianza: json.confianza || {},
  };
}

/* ── Validaciones post-extracción: detecta anomalías por fila/campo ── */
let extWarnings = new Map(); // "rowIdx|campo" → {nivel, msg}
function extValidarFila(fila, rowIdx){
  const avisos = [];
  for (const campo of extCampos){
    const v = (fila[campo.nombre]||'').trim();
    const tipo = extTipoSemantico(campo);
    let nivel = null, msg = '';
    if (!v){ nivel='warn'; msg='Campo vacío'; }
    else if (tipo==='fecha'  && !/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/.test(v)){ nivel='err'; msg='Fecha inválida'; }
    else if (tipo==='dinero' && !/\d/.test(v)){ nivel='err'; msg='No parece un valor monetario'; }
    else if (tipo==='id'     && (v.match(/\d/g)||[]).length < 5){ nivel='warn'; msg='Identificación incompleta'; }
    else if (tipo==='codigo' && !/\d{3,}/.test(v)){ nivel='warn'; msg='Código incompleto'; }
    if (nivel){
      extWarnings.set(`${rowIdx}|${campo.nombre}`, {nivel, msg});
      avisos.push({campo: campo.nombre, nivel, msg});
    }
  }
  return avisos;
}

/* ── Procesar todos los PDFs ── */
window.extProcesar = async () => {
  if (!extArchivos.length) { toast('Carga al menos un PDF.','error'); return; }
  if (!extCampos.length)   { toast('Define al menos un campo dibujando un recuadro sobre el PDF.','error'); return; }

  const btn = document.getElementById('btnExtraer');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Extrayendo...';

  const resultCard = document.getElementById('extResultCard');
  const progreso   = document.getElementById('extProgreso');
  resultCard.style.display = 'block';
  progreso.style.display = 'block';

  extResultados = [];
  extWarnings = new Map();
  _extItemsCache.clear();
  _extOcrCache.clear();

  let totalAvisos = 0;
  try {
    for (let i=0; i<extArchivos.length; i++) {
      const arch = extArchivos[i];
      progreso.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Procesando ${i+1} de ${extArchivos.length}: ${escHtml(arch.name)}`;
      if (!arch.pdfDoc) {
        arch.pdfDoc = await pdfjsLib.getDocument({data: arch.data.slice(0)}).promise;
      }
      const fila = { Archivo: arch.name };

      // ── PIPELINE IA: Gemini clasifica + extrae; el motor local es fallback ──
      const usarIA = document.getElementById('extUsarIA')?.checked !== false;
      let ia = null;
      if (usarIA) {
        try {
          ia = await extGeminiExtraer(arch, extCampos, 'doc'+i);
          fila.Categoria = ia.categoria || '';
        } catch(e) {
          console.warn('Gemini fallo, usando motor local:', e.message);
          progreso.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${i+1}/${extArchivos.length}: ${escHtml(arch.name)} <span style="color:#e65100">(modo local)</span>`;
        }
      }

      for (const campo of extCampos) {
        let v = '', confIA = 0;
        if (ia) {
          v = extLimpiarIA(ia.valores?.[campo.nombre], campo);
          confIA = Number(ia.confianza?.[campo.nombre]) || 0;
        }
        // Fallback local por campo: sin valor de IA o confianza baja
        if ((!v || confIA < 0.4) && campo.page <= arch.pdfDoc.numPages) {
          const local = await extExtraerRegion(arch.pdfDoc, campo, 'doc'+i);
          if (local && !v) v = local;
        }
        fila[campo.nombre] = v;
        // Confianza baja de la IA con valor presente → marcar para revisión
        if (v && ia && confIA > 0 && confIA < 0.6) {
          extWarnings.set(`${extResultados.length}|${campo.nombre}`, {nivel:'warn', msg:`Confianza IA baja (${Math.round(confIA*100)}%) — verificar`});
        }
      }
      totalAvisos += extValidarFila(fila, extResultados.length).length;
      extResultados.push(fila);
      extRenderResultados();

      // Liberar memoria en lotes grandes (mantener el documento abierto en el visor)
      if (extArchivos.length > 10 && i !== extActivo) {
        try { arch.pdfDoc.destroy(); } catch(e){}
        arch.pdfDoc = null;
      }
    }
    const avisoTxt = totalAvisos
      ? ` <span style="color:#e65100">— ${totalAvisos} advertencia${totalAvisos>1?'s':''} detectada${totalAvisos>1?'s':''} (celdas resaltadas)</span>`
      : '';
    progreso.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#2e7d32"></i> Extracción completada — ${extResultados.length} documento${extResultados.length>1?'s':''}.${avisoTxt}`;
    document.getElementById('btnExtExcel').style.display = 'inline-flex';
    toast('Extracción completada.','success');
  } catch(e) {
    progreso.innerHTML = `<span style="color:var(--red)">Error: ${escHtml(e.message)}</span>`;
    toast('Error en extracción: '+e.message,'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Extraer información';
  }
};

/* ── Render de resultados con resaltado de advertencias ── */
function extRenderResultados() {
  const table = document.getElementById('extResultTable');
  if (!extResultados.length) return;
  const hayCategoria = extResultados.some(r => r.Categoria);
  const cols = ['Archivo', ...(hayCategoria ? ['Categoria'] : []), ...extCampos.map(c=>c.nombre)];
  table.querySelector('thead').innerHTML = '<tr>'+cols.map(c=>`<th>${escHtml(c)}</th>`).join('')+'</tr>';
  table.querySelector('tbody').innerHTML = extResultados.map((r,ri)=>
    '<tr>'+cols.map(c=>{
      const w = extWarnings.get(`${ri}|${c}`);
      const st = w ? (w.nivel==='err'
        ? 'background:#ffebee;color:#b71c1c'
        : 'background:#fff8e1;color:#8a6d00') : '';
      const tip = w ? ` title="${escHtml(w.msg)} — clic para corregir"` : '';
      const editable = (c !== 'Archivo' && c !== 'Categoria')
        ? ` contenteditable="true" onblur="extEditarCelda(${ri},'${escHtml(c)}',this)"` : '';
      return `<td style="${st};outline:none"${tip}${editable}>${escHtml(String(r[c]??''))}</td>`;
    }).join('')+'</tr>'
  ).join('');
}

/* Corrección humana: al editar una celda, actualizar datos y limpiar advertencia */
window.extEditarCelda = (ri, col, el) => {
  const nuevo = el.textContent.trim();
  if (extResultados[ri]) extResultados[ri][col] = nuevo;
  extWarnings.delete(`${ri}|${col}`);
  el.style.background = ''; el.style.color = '';
  el.removeAttribute('title');
};

/* ── Exportar Excel ── */
window.extExportarExcel = () => {
  if (!extResultados.length) { toast('No hay resultados para exportar.','error'); return; }
  const hayCategoria = extResultados.some(r => r.Categoria);
  const cols = ['Archivo', ...(hayCategoria ? ['Categoria'] : []), ...extCampos.map(c=>c.nombre)];
  const data = [cols, ...extResultados.map(r=>cols.map(c=>r[c]??''))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = cols.map(()=>({wch:24}));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Extraccion');
  XLSX.writeFile(wb, 'Extraccion_Datos.xlsx');
};

/* ── Plantillas (Firestore: extractTemplates) ── */
window.extCargarListaPlantillas = async () => {
  try {
    const snap = await getDocs(collection(db,'extractTemplates'));
    const sel = document.getElementById('extPlantillaSel');
    const plantillas = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));
    sel.innerHTML = '<option value="">— Seleccionar plantilla —</option>' +
      plantillas.map(p=>`<option value="${escHtml(p.id)}">${escHtml(p.nombre)}</option>`).join('');
  } catch(e) { console.warn('Plantillas:', e); }
};

window.extGuardarPlantilla = async () => {
  if (!extCampos.length) { toast('No hay campos para guardar.','error'); return; }
  const nombre = prompt('Nombre de la plantilla (ej: Factura Clínica):','');
  if (!nombre || !nombre.trim()) return;
  try {
    await addDoc(collection(db,'extractTemplates'), {
      nombre: nombre.trim(),
      campos: extCampos,
      createdAt: serverTimestamp()
    });
    toast('Plantilla guardada.','success');
    extCargarListaPlantillas();
  } catch(e) { toast('Error: '+e.message,'error'); }
};

window.extCargarPlantilla = async () => {
  const id = document.getElementById('extPlantillaSel').value;
  if (!id) { toast('Selecciona una plantilla.','error'); return; }
  try {
    const snap = await getDoc(doc(db,'extractTemplates',id));
    if (!snap.exists()) { toast('Plantilla no encontrada.','error'); return; }
    extCampos = snap.data().campos || [];
    extRenderListaCampos();
    extDibujarCampos();
    toast(`Plantilla "${snap.data().nombre}" cargada — ${extCampos.length} campos.`,'success');
  } catch(e) { toast('Error: '+e.message,'error'); }
};

window.extEliminarPlantilla = async () => {
  const id = document.getElementById('extPlantillaSel').value;
  if (!id) { toast('Selecciona una plantilla.','error'); return; }
  if (!confirm('¿Eliminar esta plantilla?')) return;
  try {
    await deleteDoc(doc(db,'extractTemplates',id));
    toast('Plantilla eliminada.','success');
    extCargarListaPlantillas();
  } catch(e) { toast('Error: '+e.message,'error'); }
};
