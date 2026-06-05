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
window.doLogout = async () => { if(!confirm('¿Cerrar sesión?'))return; await signOut(auth); };

/* ── AUTH STATE ── */
onAuthStateChanged(auth, async user => {
  showLoading(true);
  if(user){
    currentUser=user;
    const snap=await getDoc(doc(db,'users',user.uid));
    currentProfile=snap.exists()?snap.data():{nombreCompleto:user.email,rol:'Usuario',color:'#1757a8'};
    bootApp();
  } else {
    currentUser=null; currentProfile=null;
    document.getElementById('loginScreen').style.display='flex';
    document.getElementById('appRoot').style.display='none';
    showLoading(false);
  }
});

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
  // Mostrar botón de IA
  document.getElementById('aiFab').style.display = 'flex';
  // Inicializar Jarvis
  setTimeout(() => initJarvis2(), 800);
  showLoading(false);
}

/* ── SUBSCRIPTIONS ── */
function subscribeAll(){
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
    renderKanban(); renderDashboard(); updateNavBadges(); renderAlertas();
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
}

/* ── NAVIGATION ── */
window.navigate = (view,el) => {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('view-'+view)?.classList.add('active');
  const sideItem=document.querySelector(`.nav-item[onclick*="'${view}'"]`);
  if(sideItem) sideItem.classList.add('active');
  const labels={dashboard:'Dashboard',doctores:'Clientes',kanban:'Tablero Kanban',tareas:'Tareas',chat:'Chat del equipo',equipo:'Equipo',alertas:'Alertas',calendario:'Calendario',reportes:'Reportes',resumen:'Resumen de Procesos',egresos:'UROEXPERTOS',turnos:'Cuadro de Turnos'};
  document.getElementById('breadcrumb').textContent=labels[view]||view;
  if(window.innerWidth<=768){ document.getElementById('sidebar').classList.remove('mobile-open'); document.getElementById('sidebarOverlay').classList.remove('open'); }
  if(view==='tareas') applyTareaFilters();
  if(view==='kanban') renderKanban();
  if(view==='dashboard') renderDashboard();
  if(view==='calendario') renderCalendario();
  if(view==='resumen') renderResumen();
  if(view==='egresos') initEgresos();
  if(view==='turnos') initTurnos();
};
window.setBottomActive = el => { document.querySelectorAll('.bottom-nav-item').forEach(i=>i.classList.remove('active')); el.classList.add('active'); };
window.toggleSidebar = () => {
  const sb=document.getElementById('sidebar'), sh=document.getElementById('appShell'), ov=document.getElementById('sidebarOverlay');
  if(window.innerWidth<=768){ const open=sb.classList.toggle('mobile-open'); ov.classList.toggle('open',open); }
  else{ const col=sb.classList.toggle('collapsed'); sh.classList.toggle('full',col); }
};
window.refreshAll = () => { renderDashboard(); filterDoctors(); renderKanban(); applyTareaFilters(); renderEquipo(); renderAlertas(); updateNavBadges(); toast('Actualizado.','success'); };

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
  tbody.innerHTML=list.map(d=>{
    const accCount=d.accesos?.length||0;
    const logoCell = d.logoBase64
      ? `<div class="doc-av has-logo"><img src="${d.logoBase64}" alt="logo"/></div>`
      : `<div class="doc-av" style="background:${avatarColor(d.nombre)}">${initials(d.nombre)}</div>`;
    return `<tr>
    <td><div class="doc-cell">${logoCell}<div><div class="doc-name">${d.nombre}</div><div style="font-size:11px;color:var(--gray-3)">${[d.especialista,d.nit].filter(Boolean).join(' · ')}</div></div></div></td>
    <td>${d.especialidad||'—'}</td><td>${d.entidad||'—'}</td>
    <td>${d.correo?`<a href="mailto:${d.correo}" style="color:var(--blue)">${d.correo}</a>`:'—'}</td>
    <td>${d.telefono||'—'}</td><td style="font-size:12px;color:var(--gray-4)">${d.contrato||'—'}</td>
    <td><span class="badge badge-${d.estado==='Activo'?'active':'inactive'}">${d.estado||'—'}</span></td>
    <td>${accCount>0?`<span class="accesos-badge"><i class="fa-solid fa-key"></i> ${accCount} acceso${accCount>1?'s':''}</span>`:'<span style="color:var(--gray-2);font-size:12px">—</span>'}</td>
    <td><div class="tbl-actions"><button class="act-btn edit" onclick="openDoctorModal('${d.id}')"><i class="fa-solid fa-pen"></i></button><button class="act-btn del" onclick="deleteDoctor('${d.id}')"><i class="fa-solid fa-trash"></i></button></div></td>
  </tr>`;}).join('');
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

/* ── ALERTAS ── */
function renderAlertas(){
  const alerts=[], today=new Date(), todayStr=today.toISOString().slice(0,10);
  formatos.filter(f=>f.fecha&&f.status!=='Listo').forEach(f=>{
    if(new Date(f.fecha+'T23:59:59')<today){const d=doctors.find(x=>x.id===f.doctorId),dias=Math.floor((today-new Date(f.fecha+'T23:59:59'))/86400000);alerts.push({cls:'al-red',icon:'fa-triangle-exclamation',title:`Proceso vencido: ${f.nombre}`,desc:`Doctor: ${d?.nombre||'—'} — Venció hace ${dias} día(s).`});}
  });
  formatos.filter(f=>f.prioridad==='Urgente'&&f.status!=='Listo').forEach(f=>{
    const d=doctors.find(x=>x.id===f.doctorId);alerts.push({cls:'al-orange',icon:'fa-fire',title:`Urgente: ${f.nombre}`,desc:`Doctor: ${d?.nombre||'—'} · ${f.status}`});
  });
  tareas.filter(t=>t.fecha&&t.fecha<todayStr&&t.estado!=='Completada').forEach(t=>{
    alerts.push({cls:'al-orange',icon:'fa-list-check',title:`Tarea vencida: ${t.titulo}`,desc:`Asignada a: ${t.asignadoNombre||'—'}`});
  });
  doctors.filter(d=>d.estado==='Inactivo').forEach(d=>{
    const act=formatos.filter(f=>f.doctorId===d.id&&f.status!=='Listo');
    if(act.length) alerts.push({cls:'al-gold',icon:'fa-user-slash',title:`Doctor inactivo con procesos abiertos`,desc:`${d.nombre} tiene ${act.length} proceso(s) sin cerrar.`});
  });
  const grid=document.getElementById('alertsGrid'), empty=document.getElementById('emptyAlertas');
  if(!alerts.length){grid.innerHTML='';empty.style.display='block';}
  else{empty.style.display='none';grid.innerHTML=alerts.map(a=>`<div class="alert-item ${a.cls}"><div class="alert-icon"><i class="fa-solid ${a.icon}"></i></div><div class="alert-text"><div class="alert-title">${a.title}</div><div class="alert-desc">${a.desc}</div></div></div>`).join('');}
  document.getElementById('navBadgeAlertas').textContent=alerts.length;
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
  onSnapshot(
    query(collection(db,'facturas'), orderBy('createdAt','desc')),
    snap => {
      // Debounce: wait 800ms after last change before notifying iframe
      // This prevents partial updates during bulk import
      clearTimeout(_facturasDebounce);
      _facturasDebounce = setTimeout(() => {
        const facturas = snap.docs.map(d => ({id:d.id,...d.data()}));
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

    // Fetch facturas y doctors directamente de Firestore para garantizar que llegan
    Promise.all([
      getDocs(query(collection(db,'facturas'), orderBy('createdAt','desc'))),
      getDocs(query(collection(db,'doctors'),  orderBy('createdAt','desc'))),
    ]).then(([factSnap, docSnap]) => {
      const facturas = factSnap.docs.map(d=>({id:d.id,...d.data()}));
      const docsList = docSnap.docs.map(d=>({id:d.id,...d.data(),nombre:d.data().nombre,especialidad:d.data().especialidad}));
      // Actualizar array global también
      if (docsList.length) doctors = docsList;
      frame.contentWindow.postMessage({
        type: 'FACTURAS_UPDATE',
        facturas,
        doctors: docsList.map(d=>({id:d.id, nombre:d.nombre, especialidad:d.especialidad}))
      }, '*');
    });
    // Enviar estilos de doctores guardados
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
    // Si reemplazar: borrar registros del mismo mes/año antes
    if (replace) {
      const mesesAnios = [...new Set(importData.map(r => `${r.anio}_${r.mes}`))];
      const snapExist  = await getDocs(collection(db,'facturas'));
      const toDelete   = snapExist.docs.filter(d => {
        const data = d.data();
        return mesesAnios.includes(`${data.anio}_${data.mes}`);
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
   RESUMEN DE PROCESOS — Carga del equipo
══════════════════════════════════════════════════ */
window.renderResumen = function() {
  /* ── KPIs del equipo ── */
  const totalProc  = formatos.length;
  const allDocIds  = formatos.flatMap(f => f.doctorIds?.length ? f.doctorIds : (f.doctorId?[f.doctorId]:[]));
  const uniqueDocs = [...new Set(allDocIds)].length;
  const conResp    = formatos.filter(f => f.responsableId).length;
  const sinResp    = formatos.filter(f => !f.responsableId).length;

  document.getElementById('resKpis').innerHTML = [
    {icon:'fa-table-columns', num:totalProc,        lbl:'Total procesos',      cls:'blue'  },
    {icon:'fa-users',         num:teamMembers.length,lbl:'Miembros del equipo', cls:'green' },
    {icon:'fa-user-doctor',   num:uniqueDocs,        lbl:'Doctores únicos',     cls:'gold'  },
    {icon:'fa-link',          num:allDocIds.length,  lbl:'Asociaciones totales',cls:'blue'  },
    {icon:'fa-check',         num:conResp,           lbl:'Con responsable',     cls:'green' },
    {icon:'fa-circle-minus',  num:sinResp,           lbl:'Sin responsable',     cls:'orange'},
  ].map(k=>`
    <div class="res-kpi">
      <div class="res-kpi-icon"><i class="fa-solid ${k.icon}"></i></div>
      <div class="res-kpi-num ${k.cls}">${k.num}</div>
      <div class="res-kpi-label">${k.lbl}</div>
    </div>`).join('');

  /* ── Por miembro ── */
  const grid = document.getElementById('resGrid');
  const byMember = {};
  teamMembers.forEach(m => { byMember[m.id] = {member:m, procesos:[]}; });
  byMember['__sin__'] = {member:{id:'__sin__',nombreCompleto:'Sin asignar',color:'#8d9ab0',rol:''},procesos:[]};

  formatos.forEach(f => {
    const respIds = f.responsableIds?.length ? f.responsableIds
      : (f.responsableId ? [f.responsableId] : ['__sin__']);
    respIds.forEach(rid => {
      const key = rid || '__sin__';
      if (!byMember[key]) byMember[key]={member:{id:key,nombreCompleto:'Otro',color:'#8d9ab0'},procesos:[]};
      if (!byMember[key].procesos.find(p=>p.id===f.id)) byMember[key].procesos.push(f);
    });
  });

  const entries = Object.values(byMember)
    .filter(e => e.procesos.length > 0)
    .sort((a,b) => b.procesos.length - a.procesos.length);

  if(!entries.length){
    grid.innerHTML=`<div class="empty-state"><i class="fa-solid fa-users"></i><p>No hay procesos asignados aún.</p></div>`;
    return;
  }

  const maxProc = Math.max(...entries.map(e=>e.procesos.length), 1);

  grid.innerHTML = entries.map(({member:m, procesos}) => {
    const color = m.color || avatarColor(m.nombreCompleto);
    const pct   = Math.round((procesos.length/maxProc)*100);

    // Doctores únicos de este miembro
    const memberDocIds = [...new Set(procesos.flatMap(f =>
      f.doctorIds?.length ? f.doctorIds : (f.doctorId?[f.doctorId]:[])
    ))];
    const memberDocs = memberDocIds.length;
    const totalAsoc  = procesos.flatMap(f =>
      f.doctorIds?.length ? f.doctorIds : (f.doctorId?[f.doctorId]:[])
    ).length;

    const rows = procesos.map((f,idx) => {
      const docIds   = f.doctorIds?.length ? f.doctorIds : (f.doctorId?[f.doctorId]:[]);
      const docNames = f.doctoresNombres?.length ? f.doctoresNombres
        : docIds.map(id=>doctors.find(d=>d.id===id)?.nombre||'').filter(Boolean);
      const freq     = deducirFrecuencia(f.fecha);
      return `<div class="res-proc-row">
        <div class="res-proc-num">${idx+1}</div>
        <div class="res-proc-info">
          <div class="res-proc-title">${escHtml(f.nombre)}</div>
          ${freq ? `<div class="res-proc-freq-badge"><i class="fa-regular fa-calendar-check"></i>${freq}</div>` : ''}
          ${docNames.length ? `<div class="res-proc-docs">
            <i class="fa-solid fa-user-doctor"></i>
            <span>${escHtml(docNames.join(' · '))}</span>
            <span class="res-doc-count">${docNames.length}</span>
          </div>` : `<div class="res-proc-docs res-no-doc">
            <i class="fa-solid fa-user-slash"></i> Sin doctor asignado
          </div>`}
        </div>
      </div>`;
    }).join('');

    return `<div class="res-member-card">
      <div class="res-member-head" style="background:linear-gradient(135deg,${color},${color}cc)">
        <div class="res-member-av">${initials(m.nombreCompleto)}</div>
        <div class="res-member-info">
          <div class="res-member-name">${escHtml(m.nombreCompleto)}</div>
          <div class="res-member-role">${m.rol||'Usuario'}</div>
        </div>
        <div class="res-member-badges">
          <div class="res-mbadge"><span>${procesos.length}</span><small>procesos</small></div>
          <div class="res-mbadge"><span>${memberDocs}</span><small>doctores</small></div>
        </div>
      </div>
      <!-- Barra de carga -->
      <div class="res-load-bar-wrap">
        <div class="res-load-bar-track">
          <div class="res-load-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <span class="res-load-pct">${procesos.length} de ${totalProc} procesos · ${totalAsoc} asociaciones</span>
      </div>
      <!-- Lista de procesos -->
      <div class="res-proc-list">${rows}</div>
    </div>`;
  }).join('');
};


/* ══════════════════════════════════════════════════
   EXPORTAR RESUMEN A EXCEL
══════════════════════════════════════════════════ */
/* ── Deducir frecuencia de un proceso según su fecha límite ── */
function deducirFrecuencia(fecha) {
  if (!fecha) return '';
  const dia = parseInt(fecha.split('-')[2]);
  // Descripción: "Cada mes · día X"
  return `Mensual · día ${dia}`;
}

window.exportResumenExcel = function() {
  if (!window.XLSX) { toast('SheetJS no cargado. Recarga la página.','error'); return; }

  const wb   = XLSX.utils.book_new();
  const today = new Date().toLocaleDateString('es-CO');

  /* ── Hoja 1: Resumen por miembro ── */
  const byMember = {};
  teamMembers.forEach(m => { byMember[m.id] = {member:m, procesos:[]}; });
  byMember['__sin__'] = {member:{id:'__sin__', nombreCompleto:'Sin asignar', rol:''}, procesos:[]};
  formatos.forEach(f => {
    const key = f.responsableId || '__sin__';
    if (!byMember[key]) byMember[key]={member:{id:key,nombreCompleto:'Otro',rol:''},procesos:[]};
    byMember[key].procesos.push(f);
  });

  const resumenRows = [
    ['RESUMEN DE PROCESOS — Back Office Empresarial'],
    [`Generado: ${today}`],
    [],
    ['RESPONSABLE','ROL','TOTAL PROCESOS','DOCTORES ÚNICOS','TOTAL ASOCIACIONES'],
  ];

  const detailRows = [
    ['DETALLE DE PROCESOS POR MIEMBRO'],
    [`Generado: ${today}`],
    [],
    ['RESPONSABLE','ROL','#','PROCESO','FRECUENCIA','DOCTORES ASOCIADOS','CANTIDAD DOCTORES'],
  ];

  Object.values(byMember)
    .filter(e => e.procesos.length > 0)
    .sort((a,b) => b.procesos.length - a.procesos.length)
    .forEach(({member:m, procesos}) => {
      const docIds = [...new Set(procesos.flatMap(f =>
        f.doctorIds?.length ? f.doctorIds : (f.doctorId?[f.doctorId]:[])
      ))];
      const totalAsoc = procesos.flatMap(f =>
        f.doctorIds?.length ? f.doctorIds : (f.doctorId?[f.doctorId]:[])
      ).length;

      // Fila resumen
      resumenRows.push([
        m.nombreCompleto, m.rol||'Usuario',
        procesos.length, docIds.length, totalAsoc
      ]);

      // Filas detalle
      procesos.forEach((f, idx) => {
        const docNames = f.doctoresNombres?.length ? f.doctoresNombres
          : (f.doctorIds||[f.doctorId]).map(id=>doctors.find(d=>d.id===id)?.nombre||'').filter(Boolean);
        detailRows.push([
          idx === 0 ? m.nombreCompleto : '',
          idx === 0 ? (m.rol||'Usuario') : '',
          idx + 1,
          f.nombre,
          deducirFrecuencia(f.fecha) || 'Sin fecha definida',
          docNames.join(', ') || 'Sin doctor',
          docNames.length,
        ]);
      });
      detailRows.push([]); // línea vacía entre miembros
    });

  /* ── Hoja 2: KPIs generales ── */
  const allDocIds = formatos.flatMap(f => f.doctorIds?.length ? f.doctorIds : (f.doctorId?[f.doctorId]:[]));
  const kpiRows = [
    ['INDICADORES GENERALES'],
    [`Generado: ${today}`],
    [],
    ['INDICADOR','VALOR'],
    ['Total procesos',              formatos.length],
    ['Miembros del equipo',         teamMembers.length],
    ['Doctores únicos asociados',   [...new Set(allDocIds)].length],
    ['Total asociaciones doctor',   allDocIds.length],
    ['Procesos con responsable',    formatos.filter(f=>f.responsableId).length],
    ['Procesos sin responsable',    formatos.filter(f=>!f.responsableId).length],
  ];

  /* ── Crear hojas ── */
  const wsResumen = XLSX.utils.aoa_to_sheet(resumenRows);
  const wsDetalle = XLSX.utils.aoa_to_sheet(detailRows);
  const wsKpis    = XLSX.utils.aoa_to_sheet(kpiRows);

  // Anchos de columna
  wsResumen['!cols'] = [{wch:28},{wch:16},{wch:16},{wch:16},{wch:20}];
  wsDetalle['!cols'] = [{wch:28},{wch:16},{wch:5},{wch:32},{wch:20},{wch:45},{wch:16}];
  wsKpis['!cols']    = [{wch:32},{wch:16}];

  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen por miembro');
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle de procesos');
  XLSX.utils.book_append_sheet(wb, wsKpis,    'Indicadores generales');

  const fecha = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `resumen_procesos_${fecha}.xlsx`);
  toast('✅ Excel descargado correctamente.','success');
};

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

let egresos       = [];   // facturas madre con hijas
let tablasEgreso  = [];   // tablas personalizadas [{id, nombre, filas:[]}]
let localHijas    = [];   // hijas en modal activo
let editEgresoId  = null;
let editTablaRowTablaId = null;
let editTablaRowIdx     = null;

const fmtCOP = v => '$ ' + Number(v||0).toLocaleString('es-CO');

/* ── Navegar ── */
function initEgresos() {
  renderEgresoTable();
  renderCustomTables();
}

/* ══ SUSCRIPCIÓN FIRESTORE ══ */
function subscribeEgresos() {
  onSnapshot(collection(db,'egresos'), snap => {
    egresos = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderEgresoTable();
    // Also refresh custom tables so identificador dropdowns update in real time
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
function renderEgresoTable() {
  const tbody = document.getElementById('egresoBody');
  const empty = document.getElementById('egresoEmpty');
  if (!tbody) return;
  if (!egresos.length) {
    tbody.innerHTML=''; empty.style.display='flex'; return;
  }
  empty.style.display='none';

  let html = '';
  egresos.forEach(e => {
    const hijas = e.hijas||[];
    const totalHijas = hijas.reduce((s,h)=>s+(Number(h.valorEspecialista)||0),0);

    // ── FILA MADRE ──
    html += `<tr class="egr-madre" onclick="toggleHijas('${e.id}')">
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
          <button class="act-btn edit" onclick="event.stopPropagation();openEgresoModal('${e.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="act-btn del"  onclick="event.stopPropagation();deleteEgreso('${e.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>`;

    // ── FILAS HIJAS — misma estructura, mismo grid, solo fondo distinto ──
    hijas.forEach((h, hi) => {
      html += `<tr class="egr-hija-row" data-parent="${e.id}" style="display:none">
        <td class="egr-expand-cell egr-hija-indent">
          <i class="fa-solid fa-corner-down-right egr-hija-icon"></i>
        </td>
        <td>${h.honorarioMes||'—'}</td>
        <td>${escHtml(h.concepto||'—')}</td>
        <td>${escHtml(h.nombre||'—')}</td>
        <td>${fmtCOP(h.valorEntidad)}</td>
        <td>${fmtCOP(h.administracion)}</td>
        <td class="egr-val-esp">${fmtCOP(h.valorEspecialista)}</td>
        <td><span class="egr-factura-badge egr-hija-badge">${escHtml(h.factura||'—')}</span></td>
        <td></td>
      </tr>`;
    });

    // ── FILA TOTAL HIJAS ──
    if (hijas.length) {
      html += `<tr class="egr-total-row" data-parent="${e.id}" style="display:none">
        <td colspan="6" class="egr-total-lbl">Total hijas (${hijas.length}):</td>
        <td class="egr-total-val">${fmtCOP(totalHijas)}</td>
        <td colspan="2"></td>
      </tr>`;
    }
  });

  tbody.innerHTML = html;
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
  document.getElementById('eNotas').value = e?.notas||'';
  calcEgresoNeto();
  localHijas = e?.hijas ? JSON.parse(JSON.stringify(e.hijas)) : [];
  renderHijasTable();
  document.getElementById('egresoModal').classList.add('open');
};

window.calcEgresoNeto = () => {
  const entidad = Number(document.getElementById('eValorEntidad')?.value)||0;
  const nota    = Number(document.getElementById('eNotaCredito')?.value)||0;
  const neto    = entidad - nota;
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
    <tr>
      <td><input type="date"   class="hija-fecha"    value="${h.fechaFacturacion||''}"/></td>
      <td><input type="month"  class="hija-mes"       value="${h.honorarioMes||''}"/></td>
      <td><input type="text"   class="hija-concepto" value="${escHtml(h.concepto||'')}"  placeholder="Descripción del servicio…"/></td>
      <td>
        <select class="hija-nombre" style="width:100%;border:1.5px solid var(--gray-1);border-radius:8px;padding:8px 10px;font-size:13px;outline:none;font-family:'Nunito',sans-serif;background:white;color:var(--navy);font-weight:600;cursor:pointer;transition:border-color .2s"
          onchange="autoProveedorFromNombre(this,${i})">
          <option value="">— Seleccionar especialista —</option>
          ${doctors.filter(d=>d.especialista).map(d=>`<option value="${escHtml(d.especialista)}" ${h.nombre===d.especialista?'selected':''}>${escHtml(d.especialista)}</option>`).join('')}
          ${h.nombre && !doctors.some(d=>d.especialista===h.nombre)?`<option value="${escHtml(h.nombre)}" selected>${escHtml(h.nombre)}</option>`:''}
        </select>
      </td>
      <td><input type="text" class="hija-proveedor" value="${escHtml(h.proveedor||'')}" placeholder="Nombre empresa…" style="border:1.5px solid var(--gray-1);border-radius:8px;padding:8px 10px;font-size:13px;outline:none;font-family:'Nunito',sans-serif;background:#f8faff;color:var(--navy);font-weight:600;width:100%;transition:border-color .2s" readonly/></td>
      <td><input type="text"   class="hija-factura"  value="${escHtml(h.factura||'')}"  placeholder="FE-001-H"/></td>
      <td><input type="number" class="hija-entidad"  value="${h.valorEntidad||''}"       placeholder="0" min="0"/></td>
      <td><input type="number" class="hija-admin"    value="${h.administracion||''}"     placeholder="0" min="0"/></td>
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

window.saveEgreso = async () => {
  const factura = document.getElementById('eFactura').value.trim();
  const nombre  = document.getElementById('eNombre').value.trim();
  if (!nombre||!factura) { toast('Nombre y Factura son obligatorios.','error'); return; }

  // Leer hijas del DOM — todos los campos iguales a la madre
  const hijas = [];
  document.querySelectorAll('#hijasBody tr').forEach(row=>{
    const honorarioMes     = row.querySelector('.hija-mes')?.value||'';
    const concepto         = row.querySelector('.hija-concepto')?.value.trim()||'';
    const nombre           = row.querySelector('.hija-nombre')?.value||'';
    const proveedor        = row.querySelector('.hija-proveedor')?.value.trim()||'';
    const factura          = row.querySelector('.hija-factura')?.value.trim()||'';
    const fechaFacturacion = row.querySelector('.hija-fecha')?.value||'';
    const valorEntidad     = Number(row.querySelector('.hija-entidad')?.value)||0;
    const administracion   = Number(row.querySelector('.hija-admin')?.value)||0;
    const valorEspecialista= Number(row.querySelector('.hija-valor')?.value)||0;
    if (factura||nombre||concepto) hijas.push({fechaFacturacion,honorarioMes,concepto,nombre,proveedor,factura,valorEntidad,administracion,valorEspecialista});
  });

  const data = {
    fechaFacturacion: document.getElementById('eFechaFacturacion').value,
    honorarioMes: document.getElementById('eHonorarioMes').value,
    concepto:     document.getElementById('eConcepto').value.trim(),
    nombre,
    factura,
    valorEntidad:      Number(document.getElementById('eValorEntidad').value)||0,
    notaCredito:       Number(document.getElementById('eNotaCredito').value)||0,
    valorEntidadNeto:  Number(document.getElementById('eValorEntidadNeto').value)||0,
    administracion:    Number(document.getElementById('eAdministracion').value)||0,
    valorEspecialista: Number(document.getElementById('eValorEspecialista').value)||0,
    notas:        document.getElementById('eNotas').value.trim(),
    hijas,
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

  // ── Autocarga de facturas hijas desde los egresos seleccionados ──
  if (!selectedIds.length) return;
  const tabla = tablasEgreso[idx];
  const filasActuales = tabla.filas||[];

  // Factura numbers already existing for each identId
  const existentes = new Set(
    filasActuales
      .filter(f => selectedIds.includes(f.identId))
      .map(f => (f.factura||'').trim().toLowerCase())
  );

  // Build new filas from hijas of each selected egreso
  const nuevas = [];
  selectedIds.forEach(egresoId => {
    const egreso = egresos.find(e=>e.id===egresoId);
    if (!egreso) return;
    (egreso.hijas||[]).forEach(h => {
      const factKey = (h.factura||'').trim().toLowerCase();
      if (!factKey || existentes.has(factKey)) return; // skip duplicates
      existentes.add(factKey); // prevent duplicates within this batch

      const valorFactura = Number(h.valorEspecialista)||0;
      // Use same formula as calcValorPagar: base = valorFactura (no abono)
      const valorPagar = valorFactura;

      nuevas.push({
        identId:      egresoId,
        identIds:     [egresoId],
        factura:      h.factura||'',
        mes:          h.honorarioMes||egreso.honorarioMes||'',
        nombre:       h.nombre||egreso.nombre||'',
        valorFactura,
        abono:        0,
        glosa:        0,
        reteFuente:   0,
        afc:          0,
        residentes:   0,
        tiquetes:     0,
        hotel:        0,
        transporte:   0,
        valorPagar,
      });
    });
  });

  if (!nuevas.length) return;

  try {
    const filasActualizadas = [...filasActuales, ...nuevas];
    await updateDoc(doc(db,'tablasEgreso',tablaId), {
      filas: filasActualizadas,
      updatedAt: serverTimestamp()
    });
    toast(`${nuevas.length} fila${nuevas.length>1?'s':''} creada${nuevas.length>1?'s':''} automáticamente.`, 'success');
  } catch(e) {
    toast('Error al autocargar filas: '+e.message, 'error');
  }
};

window.deleteTabla = async (id) => {
  if (!confirm('¿Eliminar esta tabla y todas sus filas?')) return;
  try { await deleteDoc(doc(db,'tablasEgreso',id)); toast('Tabla eliminada.'); }
  catch(e) { toast('Error: '+e.message,'error'); }
};

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

    const rows = filas.map((f)=>{
      const realIdx = allFilas.indexOf(f); // real index regardless of filter
      return `
      <tr>
        <td>${escHtml(f.factura||'—')}</td>
        <td>${f.mes||'—'}</td>
        <td>${escHtml(f.nombre||'—')}</td>
        <td>${fmtCOP(f.valorFactura)}</td>
        <td>${fmtCOP(f.abono)}</td>
        <td>${fmtCOP(f.glosa)}</td>
        <td>${fmtCOP(f.reteFuente)}</td>
        <td>${fmtCOP(f.afc)}</td>
        <td>${fmtCOP(f.residentes)}</td>
        <td>${fmtCOP(f.tiquetes)}</td>
        <td>${fmtCOP(f.hotel)}</td>
        <td>${fmtCOP(f.transporte)}</td>
        <td class="col-pagar-val ${Number(f.valorPagar)<0?'neg':''}">${fmtCOP(f.valorPagar)}</td>
        <td>
          <div class="tbl-actions">
            <button class="act-btn edit" onclick="openTablaRowModal('${t.id}',${realIdx})"><i class="fa-solid fa-pen"></i></button>
            <button class="act-btn del" onclick="deleteTablaRow('${t.id}',${realIdx})"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('');

    return `<div class="egr-custom-card">
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
          <thead><tr>
            <th>FACTURA</th><th>MES</th><th>NOMBRE ESPECIALISTA</th>
            <th>VALOR FACTURA</th><th>ABONO</th><th>GLOSA</th>
            <th>RETE FUENTE</th><th>AFC</th><th>RESIDENTES</th>
            <th>TIQUETES</th><th>HOTEL</th><th>TRANSPORTE</th>
            <th class="col-pagar">VALOR A PAGAR</th><th></th>
          </tr></thead>
          <tbody>${rows||`<tr><td colspan="14" style="text-align:center;padding:20px;color:var(--gray-3)">Sin filas. Añade la primera.</td></tr>`}</tbody>
          ${filas.length?`<tfoot><tr>
            <td colspan="12" style="text-align:right;font-weight:800;padding:9px 12px;color:var(--gray-4);font-size:12px">TOTAL:</td>
            <td style="font-weight:800;color:var(--navy);background:#eef4ff;padding:9px 12px">${fmtCOP(totalPagar)}</td>
            <td></td>
          </tr></tfoot>`:''}
        </table>
      </div>
    </div>`;
  }).join('');
}

/* ══ MODAL FILA TABLA PERSONALIZADA ══ */
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
  const especialistas = [...new Set(doctors.filter(d=>d.especialista).map(d=>d.especialista))].sort();
  const savedNombre = f?.nombre||'';
  // Build options with 'selected' attribute directly on the matching option
  selNombre.innerHTML = '<option value="">— Seleccionar especialista —</option>'
    + especialistas.map(e=>`<option value="${escHtml(e)}" ${e===savedNombre?'selected':''}>${escHtml(e)}</option>`).join('')
    + (savedNombre && !especialistas.includes(savedNombre)
        ? `<option value="${escHtml(savedNombre)}" selected>${escHtml(savedNombre)}</option>` : '');
  // Force value after DOM update
  selNombre.value = savedNombre;

  document.getElementById('trValorFactura').value= f?.valorFactura||'';
  document.getElementById('trAbono').value       = f?.abono||'';
  document.getElementById('trGlosa').value       = f?.glosa||'';
  document.getElementById('trReteFuente').value  = f?.reteFuente||'';
  document.getElementById('trAfc').value         = f?.afc||'';
  document.getElementById('trResidentes').value  = f?.residentes||'';
  document.getElementById('trTiquetes').value    = f?.tiquetes||'';
  document.getElementById('trHotel').value       = f?.hotel||'';
  document.getElementById('trTransporte').value  = f?.transporte||'';
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
  const total = base - descuentos;
  const el = document.getElementById('trValorPagar');
  if (el) { el.value = total; el.style.color = total < 0 ? 'var(--red)' : 'var(--navy)'; }
};

window.saveTablaRow = async () => {
  const tablaId = editTablaRowTablaId;
  const tabla   = tablasEgreso.find(t=>t.id===tablaId);
  if (!tabla) return;

  // Guardar identIds actuales de la tabla (soporte múltiple)
  const tablaForIdent  = tablasEgreso.find(t=>t.id===tablaId);
  const currentIdentIds = tablaForIdent?._selectedIdents?.length
    ? tablaForIdent._selectedIdents
    : (tablaForIdent?._selectedIdent ? [tablaForIdent._selectedIdent] : []);
  const currentIdentId  = currentIdentIds[0]||'';

  const fila = {
    identId:      currentIdentId,   // primary (backward compat)
    identIds:     currentIdentIds,  // all selected
    factura:      document.getElementById('trFactura').value.trim(),
    mes:          document.getElementById('trMes').value,
    nombre:       document.getElementById('trNombre').value.trim(),
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
  };

  const filas = [...(tabla.filas||[])];
  if (editTablaRowIdx !== null && editTablaRowIdx !== undefined) {
    filas[editTablaRowIdx] = fila;
  } else {
    filas.push(fila);
  }

  try {
    await updateDoc(doc(db,'tablasEgreso',tablaId),{filas, updatedAt:serverTimestamp()});
    toast('Fila guardada.','success');
    closeTablaRowModal();
  } catch(e) { toast('Error: '+e.message,'error'); }
};

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

let turnos = [];
let turnosCurrentDate = new Date();
let editTurnoId = null;

const DIAS_SEMANA = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DIAS_FULL   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESES_TURN  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

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
    'FACTURA','MES','NOMBRE ESPECIALISTA','VALOR FACTURA',
    'ABONO','GLOSA','RETE FUENTE','AFC','RESIDENTES',
    'TIQUETES','HOTEL','TRANSPORTE','VALOR A PAGAR'
  ];

  // Filas de datos
  const rows = filas.map(f=>[
    f.factura     || '',
    f.mes         || '',
    f.nombre      || '',
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
window.chkAgregarEsp = () => {
  // Build options from doctors not yet in checklist
  const snap_ref = doc(db,'checklistMensual',chkMesActual);
  getDoc(snap_ref).then(snap => {
    const data = snap.exists() ? (snap.data().especialistas||{}) : {};
    const disponibles = doctors
      .filter(d=>d.nombre)
      .map(d=>d.nombre)
      .filter(e=>!data[chkKey(e)])
      .sort();

    if (!disponibles.length) { toast('Todos los especialistas ya están en el checklist.','warn'); return; }

    // Show a modal-like select via a floating div
    const existing = document.getElementById('chkAddDropdown');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.id = 'chkAddDropdown';
    div.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;border-radius:12px;box-shadow:0 8px 32px rgba(11,31,58,.22);z-index:3000;padding:20px;min-width:320px;max-width:420px';
    div.innerHTML = `
      <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;color:var(--navy);margin-bottom:12px">
        <i class="fa-solid fa-user-plus" style="color:var(--blue);margin-right:6px"></i>Agregar Especialista
      </div>
      <select id="chkEspDropdown" style="width:100%;border:1.5px solid var(--gray-2);border-radius:8px;padding:9px 12px;font-size:13px;font-family:'Nunito',sans-serif;outline:none;color:var(--navy);margin-bottom:14px">
        <option value="">— Seleccionar especialista —</option>
        ${disponibles.map(e=>`<option value="${escHtml(e)}">${escHtml(e)}</option>`).join('')}
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
  });
};

window.chkConfirmarAgregar = async () => {
  const sel = document.getElementById('chkEspDropdown');
  const nombre = sel?.value;
  if (!nombre) { toast('Selecciona un especialista.','error'); return; }
  const k = chkKey(nombre);
  document.getElementById('chkAddDropdown')?.remove();
  try {
    await updateDoc(doc(db,'checklistMensual',chkMesActual),{
      [`especialistas.${k}`]:{nombre,dayana:false,santiago:false,envios:false,ibc:false},
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
    chkRender(data);
  });
};

/* ── Render ── */
function chkRender(data) {
  const rows_data = Object.values(data).sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||''));
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
    const k = chkKey(row.nombre||'');
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

