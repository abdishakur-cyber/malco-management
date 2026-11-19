import {makeDemoRecords, diversifyDemoEmployees} from './demo.js';

const types = {'index.html':'text/html; charset=utf-8','style.css':'text/css; charset=utf-8','app.js':'application/javascript; charset=utf-8','godol-logo.svg':'image/svg+xml','salaam-bank.jpg':'image/jpeg'};
const teams = ['People','Operations','Finance','Engineering','Sales','Manufacturing','Quality & Safety','Warehouse','Field Service','Logistics'];
const rules = {
  contacts: ['phone'],
  staffLinks: ['email'],
  leaveAllowances: ['year','days'],
  bank: ['account',['salaam-somali-bank']],
  employees: ['text','text',teams,'email',['Active','On leave','Inactive']],
  attendance: ['text','date','time',['Present','Remote','Late','Absent']],
  leave: ['text',['Annual','Sick','Personal','Other'],'date','date',['Pending','Approved','Declined']],
  payroll: ['text','month','amount',['Draft','Processed']],
  recruitment: ['text','text',teams,['Applied','Interview','Offer','Hired']],
  performance: ['text','text','text',['Scheduled','In progress','Completed']],
  announcements: ['text','message','date',['Draft','Published']],
  documents: ['text',['Policy','Template','Handbook','Other'],'url',['Draft','Published']]
};
const allKeys = Object.keys(rules);
const security = {
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'same-origin',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
function json(data,status=200){return Response.json(data,{status,headers:security});}
const fail = (message,status) => json({error:message},status);
const validEmail = value => value.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const readKeys = role => role === 'admin' ? allKeys : role === 'hr' ? allKeys.filter(key=>key!=='payroll'&&key!=='bank'&&key!=='staffLinks'&&key!=='leaveAllowances') : ['announcements','documents'];
function linkedEmployee(records,email){
  const link=(records.staffLinks??[]).find(row=>row.v[0].toLowerCase()===email);
  return link&&(records.employees??[]).find(row=>row.id===link.id);
}
async function identity(request,env){
  const id = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (!id || !email) return null;
  if (email === env.GODOL_OWNER_EMAIL?.trim().toLowerCase()) return {id,email,role:'admin'};
  const row = await env.DB.prepare('SELECT role FROM members WHERE email = ?').bind(email).first();
  return {id,email,role:row?.role??null};
}
function validValue(rule,value){
  if (typeof value !== 'string' || value.trim() !== value || value.length > (rule==='message'?500:160)) return false;
  if (Array.isArray(rule)) return rule.includes(value);
  switch(rule){
    case 'year': return /^20\d{2}$/.test(value);
    case 'days': return /^(0|[1-9]\d{0,2})$/.test(value)&&Number(value)<=366;
    case 'phone': return /^\+?[0-9 ().-]{7,25}$/.test(value)&&/^\d{7,15}$/.test(value.replace(/\D/g,''));
    case 'account': return /^\d{4,34}$/.test(value);
    case 'email': return validEmail(value);
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
    case 'month': return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
    case 'time': return !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    case 'amount': return /^\d{1,9}(\.\d{1,2})?$/.test(value);
    case 'url': return !value || (/^https?:\/\//i.test(value) && URL.canParse(value));
    default: return value.length > 0;
  }
}
function validRows(key,rows){
  if (!Array.isArray(rows) || rows.length > 2000) return false;
  const ids = new Set(), unique = new Set();
  for(const row of rows){
    if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(row.id) || ids.has(row.id) ||
        !Array.isArray(row.v) || (row.v.length !== rules[key].length && !(key==='bank'&&row.v.length===1)) || !row.v.every((v,i)=>validValue(rules[key][i],v))) return false;
    ids.add(row.id);
    if(key==='leave' && row.v[3]<row.v[2])return false;
    const value = key==='employees'?row.v[3].toLowerCase():key==='staffLinks'?row.v[0].toLowerCase():key==='attendance'?JSON.stringify(row.v.slice(0,2)):null;
    if(value!==null){if(unique.has(value))return false;unique.add(value);}
  }
  return true;
}
function hasNewDuplicateEmployeeName(previous,next){
  const counts=new Map();
  for(const {v:[name]} of previous){
    const key=name.toLowerCase();
    counts.set(key,(counts.get(key)??0)+1);
  }
  const seen=new Map();
  for(const {v:[name]} of next){
    const key=name.toLowerCase();
    const count=(seen.get(key)??0)+1;
    if(count>Math.max(1,counts.get(key)??0))return true;
    seen.set(key,count);
  }
  return false;
}
async function body(request){
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
  const stream = request.body?.getReader();
  if(!stream)return null;
  const decoder = new TextDecoder();
  let size=0, source='';
  while(true){
    const {done,value}=await stream.read();
    if(done)break;
    size+=value.byteLength;
    if(size>900000){await stream.cancel();return null;}
    source+=decoder.decode(value,{stream:true});
  }
  try { return JSON.parse(source+decoder.decode()); } catch { return null; }
}
// Older records reference employees by name. Only propagate unambiguous renames.
function propagateEmployeeRenames(previous,next){
  const oldEmployees=previous.employees??[];
  const names=new Map(next.employees.map(row=>[row.id,row.v[0]]));
  const renames=new Map();
  for(const {id,v:[oldName]} of oldEmployees){
    const newName=names.get(id);
    if(newName&&newName!==oldName&&
        oldEmployees.filter(row=>row.v[0]===oldName).length===1&&
        !oldEmployees.some(row=>row.v[0]===newName)&&
        next.employees.filter(row=>row.v[0]===newName).length===1&&
        !next.employees.some(row=>row.v[0]===oldName)){
      renames.set(oldName,newName);
    }
  }
  if(!renames.size)return;
  for(const key of ['attendance','leave','payroll','performance']){
    next[key]=next[key].map(row=>{
      const v=[...row.v];
      v[0]=renames.get(v[0])??v[0];
      if(key==='performance')v[2]=renames.get(v[2])??v[2];
      return v.some((value,index)=>value!==row.v[index])?{...row,v}:row;
    });
  }
}
async function workspace(request,env,user){
  const select = env.DB.prepare('SELECT revision, records FROM workspace WHERE id = 1');
  let current = await select.first();
  if(request.method==='GET' && user.role==='admin' && current?.revision===0 && Object.keys(JSON.parse(current.records)).length===0){
    const demo=makeDemoRecords();
    const created=await env.DB.prepare("UPDATE workspace SET records = ?, revision = 1, actor = ?, action = ? WHERE id = 1 AND revision = 0 AND records = '{}' RETURNING revision, records")
      .bind(JSON.stringify(demo),user.email,'Loaded fictional GODOL construction equipment dataset').first();
    current=created??await select.first();
  }
  if(!current)return fail('The workspace database is unavailable.',503);
  let records = JSON.parse(current.records);
  if(request.method==='GET'&&user.role==='admin'&&records.employees){
    const employees=diversifyDemoEmployees(records.employees);
    if(employees!==records.employees){
      const next={...records,employees};
      for(const key of ['attendance','leave','payroll','performance'])next[key]??=[];
      propagateEmployeeRenames(records,next);
      if(validRows('attendance',next.attendance)){
        const updated=await env.DB.prepare('UPDATE workspace SET records = ?, revision = revision + 1, actor = ?, action = ? WHERE id = 1 AND revision = ? RETURNING revision, records')
          .bind(JSON.stringify(next),user.email,'Diversified fictional employee names',current.revision).first();
        current=updated??await select.first();
        records=JSON.parse(current.records);
      }
    }
  }
  const allowed = readKeys(user.role);
  if(request.method==='GET'){
    if(user.role==='staff'){
      const employee=linkedEmployee(records,user.email);
      const visible=employee&&employee.v[4]!=='Inactive'?allowed:[];
      return json({user:{role:user.role},revision:current.revision,records:Object.fromEntries(visible.map(key=>[
        key,(records[key]??[]).filter(row=>row.v[3]==='Published').map(({id,v})=>({id,v:v.slice(0,4)}))
      ]))});
    }
    return json({user:{role:user.role},revision:current.revision,records:Object.fromEntries(allowed.map(key=>[key,records[key]??[]]))});
  }
  if(request.method!=='PATCH')return fail('Method not allowed.',405);
  if(user.role==='staff')return fail('This account has read-only access.',403);
  const input = await body(request);
  if(!input||!Number.isSafeInteger(input.revision)||!input.changes||typeof input.changes!=='object'||Array.isArray(input.changes))return fail('Invalid update.',400);
  if(input.revision!==current.revision)return fail('Someone changed the workspace. Reload and try again.',409);
  const keys=Object.keys(input.changes);
  if(!keys.length || keys.some(key=>!allowed.includes(key)))return fail('You do not have access to update those records.',403);
  if(keys.some(key=>!validRows(key,input.changes[key])))return fail('One or more records contain invalid values.',400);
  const next = Object.fromEntries(allKeys.map(key=>[key,input.changes[key]??records[key]??[]]));
  const employeeIds=new Set(next.employees.map(row=>row.id));
  for(const key of ['contacts','bank','staffLinks','leaveAllowances']){
    if(!next[key].some(row=>!employeeIds.has(row.id)))continue;
    if(keys.includes(key))return fail('The employee record no longer exists.',400);
    next[key]=next[key].filter(row=>employeeIds.has(row.id));
  }
  if(keys.includes('attendance')){
    const original=new Map((records.attendance??[]).map(row=>[row.id,row]));
    next.attendance=next.attendance.map(({id,v})=>{
      const existing=original.get(id);
      if(existing?.employeeId&&existing.v[0]===v[0])return {id,v,employeeId:existing.employeeId};
      if(existing&&existing.v[0]===v[0])return {id,v};
      const matches=next.employees.filter(row=>row.v[0]===v[0]);
      return matches.length===1?{id,v,employeeId:matches[0].id}:{id,v};
    });
  }
  if(keys.includes('leave')){
    const original=new Map((records.leave??[]).map(row=>[row.id,row]));
    next.leave=next.leave.map(({id,v})=>{
      const linked=original.get(id);
      if(!linked?.employeeId)return {id,v};
      return {id,v:[linked.v[0],...v.slice(1)],employeeId:linked.employeeId};
    });
  }
  if(keys.includes('employees')){
    if(hasNewDuplicateEmployeeName(records.employees??[],next.employees))return fail('Employee full names must distinguish individual records.',400);
    propagateEmployeeRenames(records,next);
    if(!validRows('attendance',next.attendance))return fail('The name change conflicts with existing attendance records.',400);
  }
  if(JSON.stringify(next).length>800000)return fail('The workspace has reached its record capacity.',413);
  const updated = await env.DB.prepare('UPDATE workspace SET records = ?, revision = revision + 1, actor = ?, action = ? WHERE id = 1 AND revision = ? RETURNING revision')
    .bind(JSON.stringify(next),user.email,'Updated '+keys.join(', '),current.revision).first();
  const changes=Object.fromEntries(allowed.filter(key=>next[key]!==records[key]).map(key=>[key,next[key]]));
  return updated ? json({...updated,changes}) : fail('Someone changed the workspace. Reload and try again.',409);
}
function annualLeaveBalance(records,employeeId,leave){
  const year=new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Africa/Mogadishu'}).format(new Date());
  const entry=(records.leaveAllowances??[]).find(row=>row.id===employeeId&&row.v[0]===year);
  const allowance=entry?Number(entry.v[1]):null;
  const first=year+'-01-01',last=year+'-12-31';
  const ranges=leave.filter(({v})=>v[1]==='Annual'&&v[4]==='Approved'&&v[2]<=last&&v[3]>=first)
    .map(({v})=>[Date.parse(v[2]<first?first:v[2])/86400000,Date.parse(v[3]>last?last:v[3])/86400000])
    .sort((a,b)=>a[0]-b[0]);
  let used=0,coveredUntil=-Infinity;
  for(const [start,end] of ranges){
    used+=Math.max(0,end-Math.max(start,coveredUntil+1)+1);
    coveredUntil=Math.max(coveredUntil,end);
  }
  return {year,allowance,used,remaining:allowance===null?null:allowance-used};
}
async function staffProfile(request,env,user){
  if(user.role!=='staff')return fail('Staff access is required.',403);
  if(!['GET','POST'].includes(request.method))return fail('Method not allowed.',405);
  const current=await env.DB.prepare('SELECT revision, records FROM workspace WHERE id = 1').first();
  if(!current)return fail('The workspace database is unavailable.',503);
  const records=JSON.parse(current.records);
  const employee=linkedEmployee(records,user.email);
  if(!employee)return fail('Ask Admin to link your ChatGPT email to your employee profile.',404);
  const [name,job,team,email,status]=employee.v;
  if(status==='Inactive')return fail('This employee profile is inactive. Contact Admin for access.',403);
  const leave=(records.leave??[]).filter(row=>row.employeeId===employee.id);
  if(request.method==='GET'){
    const attendance=(records.attendance??[]).filter(row=>row.employeeId===employee.id);
    return json({id:employee.id,name,job,team,email,status,phone:(records.contacts??[]).find(row=>row.id===employee.id)?.v[0]??'',
      attendance:attendance.map(row=>row.v.slice(1)),leave:leave.map(row=>row.v.slice(1)),leaveBalance:annualLeaveBalance(records,employee.id,leave)});
  }
  const input=await body(request);
  const {type,start,end}=input??{};
  if(!validValue(rules.leave[1],type)||!validValue('date',start)||!validValue('date',end)||end<start)return fail('Choose a leave type and a valid date range.',400);
  if(leave.some(({v})=>['Pending','Approved'].includes(v[4])&&v[2]<=end&&v[3]>=start))return fail('A pending or approved request already overlaps those dates.',409);
  const requests=[...(records.leave??[]),{id:crypto.randomUUID(),v:[name,type,start,end,'Pending'],employeeId:employee.id}];
  const next=JSON.stringify({...records,leave:requests});
  if(requests.length>2000||next.length>800000)return fail('The workspace has reached its record capacity.',413);
  const saved=await env.DB.prepare("UPDATE workspace SET records = ?, revision = revision + 1, actor = ?, action = ? WHERE id = 1 AND revision = ? AND EXISTS (SELECT 1 FROM members WHERE email = ? AND role = 'staff') RETURNING revision")
    .bind(next,user.email,'Submitted leave request',current.revision,user.email).first();
  return saved?json({ok:true},201):fail('The workspace changed. Review your request and try again.',409);
}
async function access(request,env,user){
  if(user.role!=='admin')return fail('Admin access is required.',403);
  if(request.method==='GET'){
    const [members,audit] = await env.DB.batch([
      env.DB.prepare('SELECT email, role FROM members ORDER BY email'),
      env.DB.prepare('SELECT actor, action, created_at FROM audit_log ORDER BY id DESC LIMIT 20')
    ]);
    return json({members:members.results,audit:audit.results});
  }
  if(!['PUT','DELETE'].includes(request.method))return fail('Method not allowed.',405);
  const input = await body(request);
  const email = typeof input?.email==='string'?input.email.trim().toLowerCase():'';
  if(!validEmail(email)||email===user.email)return fail('Enter a valid member email other than the owner account.',400);
  if(request.method==='PUT'&&!['hr','staff'].includes(input.role))return fail('Choose HR or Staff.',400);
  const removing=request.method==='DELETE';
  const mutation=removing?env.DB.prepare('DELETE FROM members WHERE email = ?').bind(email):
    env.DB.prepare('INSERT INTO members (email,role) VALUES (?,?) ON CONFLICT (email) DO UPDATE SET role=excluded.role').bind(email,input.role);
  await env.DB.batch([mutation,env.DB.prepare('INSERT INTO audit_log (actor,action) VALUES (?,?)').bind(user.email,removing?'Removed member '+email:'Set '+input.role+' role for '+email)]);
  return json({ok:true});
}
export default {
  async fetch(request,env){
    const url = new URL(request.url);
    if(!url.pathname.startsWith('/api/')){
      const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
      if(!Object.hasOwn(types,file))return new Response('Not found',{status:404,headers:security});
      if(request.method!=='GET'&&request.method!=='HEAD')return fail('Method not allowed.',405);
      const asset=request.method==='HEAD'?null:file==='salaam-bank.jpg'?Uint8Array.from(atob(assets[file]),char=>char.charCodeAt(0)):assets[file];
      return new Response(asset,{headers:{...security,'Content-Type':types[file]}});
    }
    if(!['GET','HEAD'].includes(request.method)){
      const origin=request.headers.get('Origin');
      if(origin!==url.origin)return fail('Request origin is not allowed.',403);
    }
    try{
      if(!env.DB||!env.GODOL_OWNER_EMAIL)return fail('The GODOL server is not configured.',503);
      const user=await identity(request,env);
      if(!user)return fail('Sign in to open the workspace.',401);
      if(!user.role)return fail('Your account does not have a GODOL workspace role.',403);
      if(url.pathname==='/api/workspace')return await workspace(request,env,user);
      if(url.pathname==='/api/my-profile')return await staffProfile(request,env,user);
      if(url.pathname==='/api/access')return await access(request,env,user);
      return fail('Not found.',404);
    }catch(error){
      console.error('GODOL API:',error?.name);
      return fail('The server could not complete the request.',500);
    }
  }
};
