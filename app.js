'use strict';
const $ = (selector) => document.querySelector(selector);
const teams = ['People','Operations','Finance','Engineering','Sales','Manufacturing','Quality & Safety','Warehouse','Field Service','Logistics'];
const date = (offset = 0) => { const d = new Date(); d.setDate(d.getDate()+offset); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); };
const fields = {
  employees:{title:'Employees',subtitle:'Find people, update profiles and manage your directory.',singular:'employee',columns:['Name','Role','Department','Email','Status'],options:{Department:teams,Status:['Active','On leave','Inactive']}},
  attendance:{title:'Attendance',subtitle:'Record daily attendance and review recent check-ins.',singular:'attendance record',columns:['Employee','Date','Check-in','Status'],options:{Status:['Present','Remote','Late','Absent']}},
  leave:{title:'Leave requests',subtitle:'Track time off and review requests from your team.',singular:'leave request',columns:['Employee','Leave type','Start date','End date','Status'],options:{'Leave type':['Annual','Sick','Personal','Other'],Status:['Pending','Approved','Declined']}},
  payroll:{title:'Payroll',subtitle:'Review sample payroll entries and record their processing status.',singular:'payroll record',columns:['Employee','Period','Amount (USD)','Status'],options:{Status:['Draft','Processed']}},
  recruitment:{title:'Recruitment',subtitle:'Manage candidates from application through hiring.',singular:'candidate',columns:['Candidate','Position','Department','Stage'],options:{Department:teams,Stage:['Applied','Interview','Offer','Hired']}},
  performance:{title:'Performance',subtitle:'Manage employee reviews and track completion.',singular:'review',columns:['Employee','Review cycle','Reviewer','Status'],options:{Status:['Scheduled','In progress','Completed']}},
  announcements:{title:'Announcements',subtitle:'Create and organize updates for your workforce.',singular:'announcement',columns:['Title','Message','Date','Status'],options:{Status:['Draft','Published']}},
  documents:{title:'Documents',subtitle:'Organize references to company policies and HR resources.',singular:'document reference',columns:['Title','Category','Link','Status'],options:{Category:['Policy','Template','Handbook','Other'],Status:['Draft','Published']}}
};
const svgPaths = {
 overview:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',employees:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10-8a4 4 0 0 1 0 8',departments:'M3 21h18M6 21V4h12v17M9 8h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1',attendance:'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',leave:'M3 5h18v16H3zM7 3v4m10-4v4M3 10h18m-12 5 2 2 4-4',payroll:'M3 5h18v14H3zM3 9h18m-14 6h4',recruitment:'M3 7h18v14H3zM8 7V3h8v4M3 12h18m-11 0v3h4v-3',performance:'M3 3v18h18M6 16l4-5 4 2 6-7',announcements:'M3 10v5h4l4 5h3l-2-5 8 3V5l-8 4H7z',documents:'M6 3h8l4 4v14H6zM14 3v5h4m-9 4h6m-6 4h6',reports:'M3 3v18h18M7 17v-4m5 4V8m5 9V5',settings:'M4 7h16M4 17h16M8 4v6m8 4v6'};
const icon = (key) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+svgPaths[key]+'"/></svg>';
const sections = [['WORKSPACE','overview','employees','departments','my-profile'],['OPERATIONS','attendance','leave','payroll','recruitment','performance'],['RESOURCES','announcements','documents','reports','settings']];
const title = (key) => fields[key]?.title ?? ({overview:'Overview',departments:'Departments',reports:'Reports',settings:'Settings','my-profile':'My Profile'})[key];
const leaveYear = () => new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Africa/Mogadishu'}).format(new Date());
const storeKey = 'godol-people-records-v1';
const get = (key,fallback) => {try{return JSON.parse(localStorage.getItem(key)) ?? fallback;}catch{return fallback;}};
const put = (key,value) => {try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
let records = Object.fromEntries(Object.keys(fields).map(key=>[key,[]]));
let revision = 0, role = null, allowed = [], writing = false;
let prefs = get('godol-prefs',{theme:'light',name:'GODOL'});
let page = 'overview', filter = '', query = '', department = '', tablePage = 1, toastTimer;
const pageSize = 25;
const esc = (value='')=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const badge = (v)=>'<span class="pill '+(['Active','Approved','Present','Processed','Completed','Published','Hired'].includes(v)?'good':['Pending','Late','On leave','In progress'].includes(v)?'warn':'')+'">'+esc(v)+'</span>';
const notice = (message)=>{ $('#toast').textContent=message; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').textContent='',3200); };
async function api(path,method='GET',payload){
  const response=await fetch('/api/'+path,{method,headers:payload?{'Content-Type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined});
  const data=await response.json().catch(()=>({error:'Sign in or refresh to reconnect to GODOL.'}));
  if(!response.ok || data.error)throw Object.assign(new Error(data.error??'Request failed.'),{status:response.status});
  return data;
}
async function loadWorkspace(){
  const data=await api('workspace');
  role=data.user.role;
  allowed=Object.keys(data.records);
  records={...Object.fromEntries(Object.keys(fields).map(key=>[key,[]])),...data.records};
  revision=data.revision;
  $('.profile>span:last-child').innerHTML=({admin:'GODOL Admin',hr:'GODOL HR',staff:'GODOL Staff'})[role]+'<small>HR workspace</small>';
}
async function commit(next,message){
  if(writing)return false;
  const changes=Object.fromEntries(allowed.filter(key=>next[key]!==records[key]).map(key=>[key,next[key]]));
  if(!Object.keys(changes).length)return false;
  writing=true;
  const baseline=records;
  const save=()=>api('workspace','PATCH',{revision,changes});
  try {
    let result;
    try {
      result=await save();
    } catch(error){
      if(error.status!==409)throw error;
      await loadWorkspace();
      if(Object.keys(changes).some(key=>!allowed.includes(key)||JSON.stringify(records[key])!==JSON.stringify(baseline[key])))throw error;
      result=await save();
    }
    records={...records,...result.changes};revision=result.revision;notice(message);return true;
  } catch(error){
    const modal=$('#modal');
    if(error.status===409){
      const conflict='These records changed while you were editing. Your draft is still here. Copy your changes, then close and reopen the record to review the latest version.';
      if(modal.open){
        $('#form-error').textContent=conflict;
        modal.querySelectorAll('button:not([data-close])').forEach(button=>button.disabled=true);
      }
      notice(modal.open?'Conflict detected. Your draft is still open.':error.message);
      try{await loadWorkspace();if($('#employee-contact')){$('#employee-contact').dataset.stale='true';return false;}if(fields[page]&&canOpen(page)&&$('#tableout'))renderTable();else render();}catch{}
    }else if(modal.open){
      $('#form-error').textContent=error.message;
    }else notice(error.message);
    return false;
  } finally {writing=false;}
}
function canOpen(key){if(key==='my-profile')return role==='staff';return fields[key]?allowed.includes(key):role!=='staff'||key==='settings';}
function nav(){
  $('#nav').innerHTML=sections.map(([label,...keys])=>{
    const visible=keys.filter(canOpen);
    return visible.length?'<div class="navlabel">'+label+'</div>'+visible.map(key=>'<a href="#'+key+'" '+(key===page?'aria-current="page"':'')+'>'+icon(key)+title(key)+'</a>').join(''):'';
  }).join('');
}
function link(key,label){return '<a class="button" href="#'+key+'">'+label+' →</a>';}
function heading(label,description,action=''){return '<div class="pagehead"><div><div class="kicker">GODOL PEOPLE</div><h1>'+label+'</h1><p>'+description+'</p></div>'+action+'</div>';}
function table(headers,rows,stacked=false){return '<div class="scroll'+(stacked?' stacked-table':'')+'"><table role="table"><thead role="rowgroup"><tr role="row">'+headers.map(h=>'<th role="columnheader" scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody role="rowgroup">'+ (rows.length?rows.map(row=>'<tr role="row">'+row.map((v,i)=>'<td role="cell">'+(stacked?'<span class="mobile-label" aria-hidden="true">'+esc(headers[i])+'</span>':'')+'<div class="cell-value">'+v+'</div></td>').join('')+'</tr>').join(''):'<tr role="row"><td role="cell" class="empty" colspan="'+headers.length+'">No matching records.</td></tr>')+'</tbody></table></div>';}
function employeePortrait(id){
 const demo=/^employees(\d{1,2})$/.exec(id);
 let hash=2166136261;
 for(const character of id)hash=Math.imul(hash^character.codePointAt(0),16777619);
 const seed=demo?Number(demo[1]):hash>>>0;
 const backgrounds=['#D8E9FA','#EADDF7','#CFEADF','#FDE2CC','#F8DCE3','#DDE3FC','#F9EAC3','#CAE8EA','#E8E0D7','#DCEBCF'];
 const shirts=['#254780','#74438D','#245B52','#9B4935','#A13661','#434D8D','#735313','#23636E','#68503D','#465C2C'];
 const skins=['#C98E62','#A76648','#824B39','#DCA279','#975A3F','#B67851'];
 const hair=['M20 31c-3-15 8-21 17-18 7 1 11 8 8 17-4-2-6-6-8-9-4 6-9 8-17 10Z',
   'M18 30c-1-13 7-20 15-20 9 0 16 7 14 20-6-1-9-4-12-9-5 5-10 8-17 9Z',
   'M18 33c-4-11 1-19 9-22 10-3 19 1 21 11l-3 11-4-11c-7 3-13 4-19 2Z',
   'M18 34v-8c0-9 6-15 14-15 9 0 15 6 15 15v8l-5-4-2-8-15 2-3 8Z',
   'M20 29c-3-7 1-12 6-13 2-5 8-6 12-2 6 0 11 7 7 15l-4-4-3-5-9 5-6-1Z'];
 const background=backgrounds[seed%backgrounds.length];
 const shirt=shirts[Math.floor(seed/10)%shirts.length];
 const skin=skins[Math.floor(seed/3)%skins.length];
 const glasses=seed%4===0?'<path d="M22 30h9v6h-9zm12 0h9v6h-9zM31 32h3" fill="none" stroke="#263144" stroke-width="1.25" stroke-linejoin="round"/>':'';
 return '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64" rx="15" fill="'+background+'"/>'+
   '<circle cx="53" cy="12" r="13" fill="#fff" opacity=".25"/><path d="M7 64c1-10 8-15 20-17h10c11 2 18 8 20 17Z" fill="'+shirt+'"/>'+
   '<path d="M27 42h10v8l-5 4-5-4Z" fill="'+skin+'"/><ellipse cx="32" cy="31" rx="13" ry="16" fill="'+skin+'"/>'+
   '<path d="'+hair[seed%hair.length]+'" fill="#242030"/><circle cx="26.5" cy="32.5" r="1.25" fill="#25202B"/><circle cx="37.5" cy="32.5" r="1.25" fill="#25202B"/>'+
   '<path d="M29 39q3 2 6 0" fill="none" stroke="#542E30" stroke-width="1.2" stroke-linecap="round"/>'+glasses+'</svg>';
}
function identity(id,name,detail=''){
 return '<span class="identity"><span class="employee-portrait">'+employeePortrait(id)+'</span><span><strong>'+esc(name)+'</strong>'+(detail?'<small>'+esc(detail)+'</small>':'')+'</span></span>';
}
function employeeLink(id,name,detail=''){
 return '<a class="employee-link" href="#employees?person='+encodeURIComponent(id)+'">'+identity(id,name,detail)+'</a>';
}
function employeeContactForm(id){
 const phone=records.contacts?.find(row=>row.id===id)?.v[0]??'';
 const [bank='',bankName='']=role==='admin'?records.bank?.find(row=>row.id===id)?.v??[]:[];
 const accountField=role==='admin'&&allowed.includes('bank')?'<label class="field">Bank name<span class="bank-choice"><img src="/salaam-bank.jpg" width="34" height="34" alt="Salaam Somali Bank logo"><select name="bank-name"><option value="">Select bank</option><option value="salaam-somali-bank" '+(bankName==='salaam-somali-bank'?'selected':'')+'>Salaam Somali Bank</option></select></span></label><label class="field">Bank account number<input name="bank" type="text" inputmode="numeric" maxlength="34" autocomplete="off" value="'+esc(bank)+'"></label>':'';
 return '<section class="panel person-summary"><h2>Contact'+(accountField?' and bank details':'')+'</h2><form id="employee-contact" class="formgrid" data-employee="'+esc(id)+'">'+
   '<label class="field">Phone number<input name="phone" type="tel" maxlength="25" autocomplete="off" value="'+esc(phone)+'"></label>'+accountField+
   '<p class="contact-feedback sub" role="status"></p><div class="actions"><button type="submit" class="primary">Save details</button></div></form></section>';
}
function leaveAllowanceForm(id){
 const year=leaveYear();
 const allowance=records.leaveAllowances.find(row=>row.id===id&&row.v[0]===year)?.v[1]??'';
 return '<section class="panel person-summary"><h2>Annual leave allowance · '+year+'</h2><p>Set the number of calendar days for this employee. Leave blank to clear this year’s allowance.</p><form id="leave-allowance" class="formgrid" data-employee="'+esc(id)+'"><label class="field">Annual allowance (days)<input name="days" type="number" min="0" max="366" step="1" value="'+esc(allowance)+'"></label><div class="actions"><button class="primary">Save allowance</button></div></form></section>';
}
function employeeProfile(id){
 const back='<a class="button" href="#employees">← Employee directory</a>';
 const employee=records.employees.find(row=>row.id===id);
 if(!employee)return heading('Employee not found','This record may have been removed.',back);
 const [name,job,team,email,status]=employee.v;
 const header='<section class="panel person-header"><div class="person-heading"><div class="employee-portrait">'+employeePortrait(id)+'</div><div><div class="kicker">EMPLOYEE PROFILE</div><h1>'+esc(name)+'</h1><p>'+esc(job)+' · '+esc(team)+'</p></div></div>'+back+'</section>';
 const summary='<section class="panel person-summary"><h2>Employment details</h2><dl><div><dt>Department</dt><dd>'+esc(team)+'</dd></div><div><dt>Email</dt><dd><a href="mailto:'+esc(encodeURIComponent(email))+'">'+esc(email)+'</a></dd></div><div><dt>Status</dt><dd>'+badge(status)+'</dd></div></dl></section>';
 const linkedEmail=records.staffLinks?.find(row=>row.id===id)?.v[0]??'';
 const linkForm=role==='admin'&&allowed.includes('staffLinks')?'<section class="panel person-summary"><h2>Staff portal access</h2><p>Enter the email of the person assigned the Staff role. Clear the field to unlink it.</p><form id="staff-link" class="formgrid" data-employee="'+esc(id)+'"><label class="field">Staff account email<input name="email" type="email" maxlength="160" value="'+esc(linkedEmail)+'"></label><div class="actions"><button class="primary">Save account link</button></div></form></section>':'';
 const contact=(allowed.includes('contacts')?employeeContactForm(id):'')+linkForm+(role==='admin'&&allowed.includes('leaveAllowances')?leaveAllowanceForm(id):'');
 if(records.employees.some(row=>row.id!==id&&row.v[0]===name)){
   return header+summary+contact+'<section class="panel"><h2>Linked records unavailable</h2><p>More than one employee has this name. The existing records cannot be assigned to one profile reliably.</p></section>';
 }
 const history=[['attendance','Attendance',1],['leave','Leave requests',2],['performance','Performance reviews'],['payroll','Salary history',1]];
 return header+summary+contact+'<div class="person-history">'+history.filter(([key])=>allowed.includes(key)&&(key!=='payroll'||role==='admin')).map(([key,label,sort])=>{
   const rows=records[key].filter(({v})=>v[0]===name);
   if(sort!==undefined)rows.sort((a,b)=>b.v[sort].localeCompare(a.v[sort]));
   const body=rows.length?table(fields[key].columns.slice(1),rows.map(({v})=>v.slice(1).map((value,index)=>{
     const column=fields[key].columns[index+1];
     if(column==='Status')return badge(value);
     if(column==='Amount (USD)')return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value));
     return esc(value)||'—';
   })),true):'<p>No records for this employee.</p>';
   return '<section class="panel"><div class="panelhead"><h2>'+label+'</h2><span class="pill">'+rows.length+'</span></div>'+body+'</section>';
 }).join('')+'</div>';
}
const count = (key,fn)=>records[key].filter(({v})=>fn(v)).length;
function quickActions(){
 const actions=[['employees','Add employee','Create a personnel record'],['attendance','Log attendance','Record a check-in or absence'],['announcements','Create announcement','Share an update with staff']];
 return '<section class="panel quick-panel" aria-labelledby="quick-title"><div class="panelhead"><div><div class="kicker">WORKSPACE SHORTCUTS</div><h2 id="quick-title">Quick actions</h2></div></div><div class="quick-grid">'+actions.map(([key,label,detail])=>'<a class="quick-action" href="#'+key+'?action=add"><span class="avatar">'+icon(key)+'</span><span><strong>'+label+'</strong><small>'+detail+'</small></span><span aria-hidden="true">→</span></a>').join('')+'</div></section>';
}
function overview(){
 const stats=[['employees','Total employees',records.employees.length,'Across all departments'],['attendance','Checked in today',count('attendance',v=>v[1]===date()&&v[3]!=='Absent'),'Includes remote staff'],['leave','Pending requests',count('leave',v=>v[4]==='Pending'),'Awaiting review'],['recruitment','Open candidates',count('recruitment',v=>v[3]!=='Hired'),'In the hiring pipeline']];
 const teamCounts=teams.map(t=>count('employees',v=>v[2]===t));
 const bars=teams.map((t,i)=>'<div class="barrow"><span>'+t+'</span><div class="track"><div class="fill" style="width:'+100*teamCounts[i]/Math.max(1,...teamCounts)+'%"></div></div><b>'+teamCounts[i]+'</b></div>').join('');
 const updates=records.announcements.filter(r=>r.v[3]==='Published').sort((a,b)=>b.v[2].localeCompare(a.v[2])).slice(0,3).map(({v})=>'<article><span class="avatar">'+icon('announcements')+'</span><div><b>'+esc(v[0])+'</b><small>'+esc(v[2])+'</small></div></article>').join('');
 return '<section class="hero"><div><div class="kicker">PEOPLE OPERATIONS • '+esc(new Date().toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'}))+'</div><h1>Your workforce at a glance</h1><p>Manage your workforce across manufacturing, equipment sales and field service.</p></div>'+link('employees','Employee directory')+'</section><div class="stats">'+stats.map(([key,label,n,help])=>'<a class="card" href="#'+key+'"><span class="avatar">'+icon(key)+'</span><p>'+label+'</p><strong>'+n+'</strong><p>'+help+'</p></a>').join('')+'</div>'+quickActions()+'<div class="grid"><section class="panel"><div class="panelhead"><div><h2>Headcount by department</h2><p class="sub">Distribution across '+teams.length+' teams</p></div></div><div class="bars">'+bars+'</div></section><section class="panel"><div class="panelhead"><h2>Company updates</h2>'+link('announcements','View all')+'</div><div class="activity">'+(updates||'<p>No published updates.</p>')+'</div></section></div><section class="panel"><div class="panelhead"><h2>Employee directory</h2>'+link('employees','View directory')+'</div>'+table(['Employee','Department','Status'],records.employees.slice(0,4).map(({id,v})=>[employeeLink(id,v[0],v[1]),esc(v[2]),badge(v[4])]),true)+'</section>';
}
function matchRows(key){
 const cfg=fields[key];
 const index=cfg.columns.indexOf(Object.keys(cfg.options).at(-1));
 return records[key].filter(({v})=>(key!=='employees'||!department||v[2]===department)&&(!filter||v[index]===filter)&&v.some(value=>value.toLowerCase().includes(query.toLowerCase().trim())));
}
function renderTable(){
 const cfg=fields[page], rows=matchRows(page);
 const pages=Math.max(1,Math.ceil(rows.length/pageSize));
 tablePage=Math.min(tablePage,pages);
 const start=(tablePage-1)*pageSize;
 const visible=rows.slice(start,start+pageSize);
 $('#previous-page').disabled=tablePage===1;
 $('#next-page').disabled=tablePage===pages;
 $('#pagination').hidden=pages===1;
 $('#page-number').textContent='Page '+tablePage+' of '+pages;
 $('#tableout').innerHTML=table(role==='staff'?cfg.columns:[...cfg.columns,'Actions'],visible.map(({id,v})=>[...v.map((value,i)=>{
   const label=cfg.columns[i];
   if(i===0&&page==='employees')return employeeLink(id,value);
   if(label==='Status'||label==='Stage')return badge(value);
   if(label==='Link'&&/^https?:\/\//i.test(value))return '<a class="button rowbutton" href="'+esc(value)+'" target="_blank" rel="noopener noreferrer">Open link</a>';
   if(label==='Amount (USD)')return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(value));
   return esc(value)||'—';
 }),...(role==='staff'?[]:['<button class="rowbutton" data-edit="'+esc(id)+'">Edit</button>'])]),true);
 $('#total').textContent=rows.length?'Showing '+(start+1)+'–'+(start+visible.length)+' of '+rows.length+' records':'0 records';
}
function modulePage(key){
 const cfg=fields[key], filterName=Object.keys(cfg.options).at(-1);
 const options=(values,selected='')=>values.map(value=>'<option'+(value===selected?' selected':'')+'>'+esc(value)+'</option>').join('');
 const departments=key==='employees'?'<label class="field">Department<select id="department-filter"><option value="">All departments</option>'+options(teams,department)+'</select></label>':'';
 const tools='<div class="tools record-tools"><label class="field">Search<input type="search" id="search" placeholder="Search records…"></label>'+departments+
   '<label class="field">'+filterName+'<select id="filter"><option value="">All '+filterName.toLowerCase()+' options</option>'+options(cfg.options[filterName])+'</select></label><button data-export>Export CSV</button></div>';
 return heading(cfg.title,cfg.subtitle,role==='staff'?'':'<button class="primary" data-add>+ Add '+cfg.singular+'</button>')+
   '<section class="panel">'+tools+'<div class="panelhead"><p class="sub" id="total" aria-live="polite"></p></div><div id="tableout"></div>'+
   '<div id="pagination" class="actions" aria-label="Table pages" hidden><button id="previous-page" type="button" data-page-step="-1">Previous</button><span id="page-number" aria-live="polite"></span><button id="next-page" type="button" data-page-step="1">Next</button></div></section>';

}
function departments(){
 return heading('Departments','Browse the teams that make up GODOL.')+'<div class="tiles">'+teams.map(t=>'<section class="panel"><span class="avatar">'+icon('departments')+'</span><h2>'+t+'</h2><p>'+count('employees',v=>v[2]===t)+' employees</p><button data-team="'+t+'">View team →</button></section>').join('')+'</div>';
}
function reports(){
 return heading('Reports','Download workforce records as CSV files.')+'<div class="tiles">'+Object.entries(fields).filter(([key])=>allowed.includes(key)).map(([key,cfg])=>'<section class="panel"><span class="avatar">'+icon(key)+'</span><h2>'+cfg.title+'</h2><p>'+records[key].length+' records available</p><button data-report="'+key+'">Download CSV</button></section>').join('')+'</div>';
}
function settings(){
 const admin = role==='admin' ? '<section class="panel"><div class="panelhead"><h2>Workspace access</h2></div><p>Assign a GODOL role to an employee email. HR can edit records except payroll. Linked, active Staff can read their own profile and published staff resources.</p><form id="member-form" class="formgrid"><label class="field">Account email<input type="email" name="email" required maxlength="160"></label><label class="field">Role<select name="role"><option value="staff">Staff</option><option value="hr">HR</option></select></label><div class="actions"><button class="primary">Save role</button></div></form><div id="members"></div></section><section class="panel"><div class="panelhead"><h2>Recent activity</h2></div><div id="audit"></div></section>' : '';
 const data = role==='admin' ? '<section class="panel"><div class="panelhead"><h2>Workspace data</h2></div><p>Records are stored on the server. The initial GODOL workforce dataset is fictional. You can edit or remove the sample entries from their respective pages.</p><br><div class="actions"><button data-import>Import browser records</button></div></section>' : '';
 return heading('Settings','Customize appearance and manage workspace access.')+'<div class="grid"><section class="panel"><div class="panelhead"><h2>Browser preferences</h2></div><form id="prefs" class="formgrid"><label class="field">Company display name<input name="name" required maxlength="30" value="'+esc(prefs.name)+'"></label><label class="field">Appearance<select name="theme"><option value="light" '+(prefs.theme==='light'?'selected':'')+'>Light</option><option value="dark" '+(prefs.theme==='dark'?'selected':'')+'>Dark</option></select></label><div class="actions"><button class="primary">Save preferences</button></div></form></section>'+data+admin+'</div>';
}
async function refreshAccess(){
 try{
   const data=await api('access');
   if(page!=='settings'||!$('#members'))return;
   $('#members').innerHTML=table(['Account','Role','Actions'],data.members.map(m=>[esc(m.email),esc(m.role),'<button class="rowbutton" data-revoke="'+esc(m.email)+'">Remove</button>']));
   $('#audit').innerHTML=table(['When (UTC)','Action','Account'],data.audit.map(a=>[esc(a.created_at),esc(a.action),esc(a.actor)]));
 }catch(error){notice(error.message);}
}
async function loadMyProfile(){
 const target=$('#my-profile');
 try{
   const profile=await api('my-profile');
   if($('#my-profile')!==target)return;
   const section=(key,label,rows)=>'<section class="panel person-summary"><h2>'+label+'</h2>'+table(fields[key].columns.slice(1),rows.map(row=>row.map((v,i)=>fields[key].columns[i+1]==='Status'?badge(v):esc(v)||'—')),true)+'</section>';
   const balance=profile.leaveBalance;
   const balancePanel=balance?'<section class="panel person-summary"><h2>Annual leave balance · '+esc(balance.year)+'</h2><dl><div><dt>Allowance</dt><dd>'+esc(balance.allowance??'Not set')+'</dd></div><div><dt>Approved days</dt><dd>'+esc(balance.used)+'</dd></div><div><dt>'+((balance.remaining??0)<0?'Days over allowance':'Days remaining')+'</dt><dd>'+esc(balance.remaining===null?'—':Math.abs(balance.remaining))+'</dd></div></dl><p class="sub">Approved annual leave is counted in calendar days.</p></section>':'';
   target.innerHTML='<section class="panel person-header">'+identity(profile.id,profile.name,profile.job+' · '+profile.team)+badge(profile.status)+'</section>'+
     '<section class="panel person-summary"><h2>Contact details</h2><p>'+esc(profile.email)+' · '+esc(profile.phone||'No phone recorded')+'</p></section>'+balancePanel+
     (profile.status==='Inactive'?'':'<section class="panel person-summary"><h2>Request leave</h2><form id="staff-leave" class="formgrid"><label class="field">Leave type<select name="type">'+fields.leave.options['Leave type'].map(type=>'<option>'+esc(type)+'</option>').join('')+'</select></label><label class="field">Start date<input type="date" name="start" required></label><label class="field">End date<input type="date" name="end" required></label><p class="contact-feedback" role="status"></p><div class="actions"><button class="primary">Submit request</button></div></form></section>')+
     section('leave','My leave requests',profile.leave)+section('attendance','My attendance',profile.attendance)+'<p class="sub">Only records linked to your employee ID appear here.</p>';
 }catch(error){if($('#my-profile')===target)target.innerHTML='<p>'+esc(error.message)+'</p>';}
}
function render(){
 const [key, search='']=location.hash.slice(1).split('?');
 page=sections.some(s=>s.slice(1).includes(key))&&canOpen(key)?key:role==='staff'?'my-profile':'overview';
 const params=new URLSearchParams(search);
 const team=params.get('department');
 department=page==='employees'&&teams.includes(team)?team:'';
 query=''; filter=''; tablePage=1;
 nav(); $('#crumb').textContent=title(page); document.title=title(page)+' | GODOL People';
 const person=page==='employees'?params.get('person'):null;
 $('#main').innerHTML=person?employeeProfile(person):fields[page]?modulePage(page):(page==='my-profile'?heading('My Profile','View your own employment records and request time off.')+'<div id="my-profile"><p>Loading profile…</p></div>':({overview,departments,reports,settings})[page]());
 if(person){$('#crumb').textContent='Employee profile';document.title='Employee profile | GODOL People';}
 if(fields[page]&&!person){$('#search').value=query;renderTable();}
 if(page==='my-profile')void loadMyProfile();
 if(page==='settings'&&role==='admin')void refreshAccess();
 $('#sidebar').classList.remove('open');$('#menu').setAttribute('aria-expanded','false');
 if(!person&&fields[page]&&key===page&&role!=='staff'&&params.get('action')==='add'){
   params.delete('action');
   history.replaceState(null,'','#'+page+(params.size?'?'+params.toString():''));
   editor();
 }
}
function editor(id){
 const key=page,cfg=fields[key],item=records[key].find(r=>r.id===id), modal=$('#modal');
 const inputs=cfg.columns.map((label,i)=>{
   const value=item?.v[i]??'', opts=cfg.options[label]??(label==='Employee'?records.employees.map(r=>r.v[0]):null);
   const type={'Date':'date','Start date':'date','End date':'date','Period':'month','Email':'email','Check-in':'time','Amount (USD)':'number','Link':'url'}[label]??'text';
   const allowed=opts?[...new Set(value&&!opts.includes(value)?[value,...opts]:opts)]:null;
   const input=allowed?'<select required name="'+i+'"><option value="">Select…</option>'+allowed.map(v=>'<option '+(v===value?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select>':label==='Message'?'<textarea required name="'+i+'" maxlength="500">'+esc(value)+'</textarea>':'<input '+(label==='Link'||label==='Check-in'?'':'required')+' name="'+i+'" type="'+type+'" value="'+esc(value)+'" '+(type==='number'?'min="0" step="0.01"':'maxlength="160"')+'>';
   return '<label class="field">'+label+input+'</label>';
 }).join('');
 modal.innerHTML='<div class="panelhead"><h2 id="dialog-title">'+(item?'Edit ':'Add ')+cfg.singular+'</h2><button type="button" data-close aria-label="Close">×</button></div><form class="formgrid">'+inputs+'<p role="alert" id="form-error" style="grid-column:1/-1"></p><div class="actions">'+(item?'<button type="button" data-delete>Delete</button>':'')+'<button type="button" data-close>Cancel</button><button class="primary" type="submit">Save record</button></div></form>';
 if(key==='employees'&&item){
   modal.querySelector('.panelhead').insertAdjacentHTML('afterend','<div class="employee-editor-identity">'+identity(id,item.v[0],item.v[1])+'</div>');
 }
 modal.setAttribute('aria-labelledby','dialog-title');
 modal.querySelector('form').onsubmit=async (e)=>{
   e.preventDefault();const fd=new FormData(e.target);const v=cfg.columns.map((_,i)=>String(fd.get(String(i))).trim());
   if(e.target.querySelector('button[type=submit]').disabled)return;
   const error=(msg)=>$('#form-error').textContent=msg;
   error('');
   if(cfg.columns.some((c,i)=>!v[i]&&!['Link','Check-in'].includes(c)))return error('Please fill in all required fields.');
   if(key==='leave'&&v[3]<v[2])return error('End date must be on or after the start date.');
   if(key==='attendance'&&records[key].some(r=>r.id!==id&&r.v[0]===v[0]&&r.v[1]===v[1]))return error('This employee already has a record for this date.');
   if(key==='employees'&&v[0].toLowerCase()!==item?.v[0].toLowerCase()&&records[key].some(r=>r.id!==id&&r.v[0].toLowerCase()===v[0].toLowerCase()))return error('This full name is already in use. Include an additional name to distinguish the employees.');
   if(key==='employees'&&records[key].some(r=>r.id!==id&&r.v[3].toLowerCase()===v[3].toLowerCase()))return error('This email address is already in use.');
   if(key==='documents'&&v[2]&&!/^https?:\/\//i.test(v[2]))return error('Enter a link beginning with https:// or http://.');
   const next={...records,[key]:item?records[key].map(r=>r.id===id?{id,v}:r):[...records[key],{id:crypto.randomUUID(),v}]};
   if(await commit(next,'Record saved.')){modal.close();if(page===key)renderTable();}
 };
 modal.oncancel=(event)=>{if(writing)event.preventDefault();};
 modal.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(!writing)modal.close();});
 const del=modal.querySelector('[data-delete]');
 if(del)del.onclick=async ()=>{if(confirm('Delete this record?')&&await commit({...records,[key]:records[key].filter(r=>r.id!==id)},'Record deleted.')){modal.close();if(page===key)renderTable();}};
 modal.showModal();
}
function exportCsv(key,rows){
 const quote=(value)=>{const s=String(value);return '"'+(/^[=+\-@\t\r\n]/.test(s)?"'"+s:s).replaceAll('"','""')+'"';};
 const data=[fields[key].columns,...rows.map(r=>r.v)].map(row=>row.map(quote).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='godol-'+key+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('CSV exported.');
}
function applyPrefs(next){if(!put('godol-prefs',next)){notice('Browser storage is unavailable.');return false;}prefs=next;setTheme();return true;}
function setTheme(){document.documentElement.dataset.theme=prefs.theme;$('#workspace-name').textContent=prefs.name+' · PEOPLE OPERATIONS';$('#theme').setAttribute('aria-pressed',String(prefs.theme==='dark'));}
$('#theme').onclick=()=>{if(applyPrefs({...prefs,theme:prefs.theme==='light'?'dark':'light'})&&role&&page==='settings')render();};
$('#menu').onclick=()=>$('#menu').setAttribute('aria-expanded',String($('#sidebar').classList.toggle('open')));
$('#close-menu').onclick=()=>{$('#menu').click();$('#menu').focus();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#sidebar').classList.contains('open'))$('#menu').click();});
$('#main').addEventListener('input',e=>{if(e.target.id==='search'){query=e.target.value;tablePage=1;renderTable();}});
$('#main').addEventListener('change',e=>{
 if(e.target.id==='filter'){filter=e.target.value;tablePage=1;renderTable();}
 if(e.target.id==='department-filter'){
   department=e.target.value;
   history.replaceState(null,'','#employees'+(department?'?department='+encodeURIComponent(department):''));
   tablePage=1;
   renderTable();
 }
});
$('#main').addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.pageStep){tablePage+=Number(b.dataset.pageStep);renderTable();}
 if(b.hasAttribute('data-add'))editor();
 if(b.dataset.edit)editor(b.dataset.edit);
 if(b.dataset.team)location.hash='employees?department='+encodeURIComponent(b.dataset.team);
 if(b.hasAttribute('data-export'))exportCsv(page,matchRows(page));
 if(b.dataset.report)exportCsv(b.dataset.report,records[b.dataset.report]);
 if(role==='admin'&&(b.hasAttribute('data-import'))){
   if(Object.values(records).some(rows=>rows.length))return notice('The server workspace must be empty before importing.');
   const incoming=get(storeKey,null);
   if(!incoming)return notice('No prior browser records found.');
   if(confirm('Copy prior browser records to the server?')){
     if(await commit({...records,...incoming},'Records imported.'))void refreshAccess();
   }
 }
 if(role==='admin'&&b.dataset.revoke&&confirm('Remove this GODOL role?')){
   try{await api('access','DELETE',{email:b.dataset.revoke});notice('Role removed.');void refreshAccess();}catch(error){notice(error.message);}
 }
});
$('#main').addEventListener('submit',async e=>{
 if(e.target.id==='staff-leave'){
   e.preventDefault();
   const form=e.target, button=form.querySelector('button'), feedback=form.querySelector('[role=status]');
   if(button.disabled)return;
   button.disabled=true;
   try{await api('my-profile','POST',Object.fromEntries(new FormData(form)));notice('Leave request submitted.');if(page==='my-profile')await loadMyProfile();}
   catch(error){feedback.textContent=error.message;}
   finally{button.disabled=false;}
   return;
 }
 if(e.target.id==='leave-allowance'){
   e.preventDefault();
   const form=e.target,id=form.dataset.employee;
   if(role!=='admin'||!allowed.includes('leaveAllowances')||writing)return;
   const raw=String(new FormData(form).get('days')??'');
   if(raw!==''&&(!Number.isInteger(Number(raw))||Number(raw)<0||Number(raw)>366)){notice('Enter 0 to 366 whole days.');return;}
   const year=leaveYear();
   const leaveAllowances=records.leaveAllowances.filter(row=>row.id!==id);
   if(raw!=='')leaveAllowances.push({id,v:[year,String(Number(raw))]});
   await commit({...records,leaveAllowances},raw===''?'Annual allowance cleared.':'Annual allowance saved.');
   return;
 }
 if(e.target.id==='staff-link'){
   e.preventDefault();
   const form=e.target,id=form.dataset.employee;
   const email=String(new FormData(form).get('email')).trim().toLowerCase();
   const staffLinks=records.staffLinks.filter(row=>row.id!==id);
   if(email)staffLinks.push({id,v:[email]});
   await commit({...records,staffLinks},email?'Staff account linked.':'Staff account unlinked.');
   return;
 }
 if(e.target.id==='employee-contact'){
   e.preventDefault();
   const form=e.target, id=form.dataset.employee, feedback=form.querySelector('.contact-feedback');
   if(writing||form.dataset.stale||!records.employees.some(row=>row.id===id))return;
   const data=new FormData(form), phone=String(data.get('phone')??'').trim();
   const bank=String(data.get('bank')??'').replace(/\s/g,'');
   if(phone&&(!/^\+?[0-9 ().-]{7,25}$/.test(phone)||!/^\d{7,15}$/.test(phone.replace(/\D/g,'')))){
     feedback.textContent='Enter a phone number with 7 to 15 digits.';return;
   }
   if(data.has('bank')&&bank&&!/^\d{4,34}$/.test(bank)){feedback.textContent='Enter a bank account number with 4 to 34 digits.';return;}
   const bankName=String(data.get('bank-name')??'');
   if(bankName&&!bank){feedback.textContent='Enter the bank account number before selecting a bank.';return;}
   const next={...records};
   for(const [key,value] of [['contacts',phone],['bank',bank]]){
     if(!allowed.includes(key)||key==='bank'&&(role!=='admin'||!data.has('bank')))continue;
     const existing=records[key].find(row=>row.id===id);
     const name=key==='bank'?bankName:'';
     if((existing?.v[0]??'')===value&&(existing?.v[1]??'')===name)continue;
     next[key]=records[key].filter(row=>row.id!==id);
     if(value)next[key].push({id,v:name?[value,name]:[value]});
   }
   if(next.contacts===records.contacts&&next.bank===records.bank){feedback.textContent='No changes to save.';return;}
   feedback.textContent='Saving…';
   const saveButton=form.querySelector('button[type=submit]');
   saveButton.disabled=true;
   const saved=await commit(next,'Employee details saved.');
   feedback.textContent=saved?'Details saved.':form.dataset.stale?'These details changed elsewhere. Your entries are still here. Copy them before reopening the profile.':'Details could not be saved. Review the message and try again.';
   saveButton.disabled=form.dataset.stale==='true';
   return;
 }
 if(e.target.id==='member-form'){
   e.preventDefault();
   const fd=new FormData(e.target);
   try{await api('access','PUT',{email:fd.get('email'),role:fd.get('role')});e.target.reset();notice('Role saved.');void refreshAccess();}catch(error){notice(error.message);}
 }
 if(e.target.id==='prefs'){
   e.preventDefault();
   const fd=new FormData(e.target),name=String(fd.get('name')).trim();
   if(!name)return notice('Enter a company display name.');
   if(applyPrefs({name,theme:fd.get('theme')}))notice('Preferences saved.');
 }
});
window.addEventListener('hashchange',()=>{if(role)render();});
setTheme();
$('#main').innerHTML='<section class="panel"><h1>Opening GODOL People</h1><p>Connecting to your workspace…</p></section>';
loadWorkspace().then(render).catch(error=>{
 const action=error.status===401?'<a class="button primary" href="/login" target="_top">Sign in</a>':'<a class="button" href="/">Try again</a>';
 $('#main').innerHTML=heading('GODOL People',esc(error.message),action);
});
