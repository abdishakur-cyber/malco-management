const demoFirstNames = ['Ayaan','Omar','Hodan','Nadia','Abdi','Farah','Samira','Yusuf','Maryan','Said','Hibo','Ahmed'];
const legacyParentNames = ['Warsame','Hassan','Yusuf','Ibrahim','Noor'];
const demoParentNames = [
  'Cabdiraxmaan','Maxamed','Cumar','Cali','Cabdullaahi','Axmed','Bashiir','Ismaaciil','Xuseen','Mustafe',
  'Siciid','Faarax','Cusmaan','Mahad','Zakariye','Xasan','Cabdifataax','Khaalid','Yaasiin','Aadan',
  'Sharmaarke','Bile','Muuse','Suldaan','Cabdicasiis','Hanad','Cabdikariim','Asad','Ilyaas','Idiris',
  'Xamza','Mukhtaar','Khadar','Guuleed','Samatar','Faysal','Cige','Jibriil','Daahir','Sahal',
  'Cabdiqaadir','Cawil','Jaamac','Mursal','Salmaan','Xirsi','Siraad','Cabdiwali','Najax','Abshir',
  'Ilkacase','Cigaal','Daa’uud','Qaasim','Nuuradiin','Najiib','Amiin','Liibaan','Burhaan','Iimaan'
];
const demoEmployeeEmail = index => 'demo.'+String(index+1).padStart(3,'0')+'@godol.example';
const demoEmployeeName = (index,parent) => demoFirstNames[index%demoFirstNames.length]+' '+parent;

function diversifyDemoEmployees(employees) {
  const occupied = new Map();
  for (const {v:[name]} of employees) occupied.set(name,(occupied.get(name)??0)+1);
  let changed=false;
  const next=employees.map(row=>{
    const index=Number(row.id.replace(/^employees(\d+)$/,'$1'));
    if(!Number.isInteger(index)||index<0||index>=demoParentNames.length||row.id!=='employees'+index)return row;
    const [oldName]=row.v;
    if(row.v[3]!==demoEmployeeEmail(index)||oldName!==demoEmployeeName(index,legacyParentNames[Math.floor(index/demoFirstNames.length)])||occupied.get(oldName)!==1)return row;
    const name=demoEmployeeName(index,demoParentNames[index]);
    if(occupied.has(name))return row;
    changed=true;
    return {...row,v:[name,...row.v.slice(1)]};
  });
  return changed?next:employees;
}

// Fictional operational records for the GODOL construction equipment workspace.
function makeDemoRecords(now = new Date()) {
  const units = [
    ['Manufacturing',['Production Supervisor','Fabrication Technician','Machine Operator','Assembly Technician']],
    ['Quality & Safety',['Quality Inspector','Safety Coordinator','Test Technician']],
    ['Warehouse',['Warehouse Supervisor','Inventory Clerk','Parts Handler']],
    ['Sales',['Sales Lead','Equipment Sales Advisor','Customer Support Associate']],
    ['Field Service',['Field Service Supervisor','Maintenance Technician','Service Coordinator']],
    ['Logistics',['Dispatch Coordinator','Fleet Assistant','Delivery Scheduler']],
    ['Engineering',['Mechanical Engineer','Product Designer','Electrical Technician']],
    ['Finance',['Finance Lead','Accounts Officer','Payroll Clerk']],
    ['People',['HR Coordinator','Training Officer','Recruitment Associate']],
    ['Operations',['Operations Lead','Procurement Officer','Facilities Coordinator']]
  ];
  const lastNames = ['Warsame','Hassan','Yusuf','Ibrahim','Noor','Osman'];
  const people = Array.from({length:60},(_,i)=>{
    const [team,roles]=units[i%units.length];
    const name=demoEmployeeName(i,demoParentNames[i]);
    return [name,roles[Math.floor(i/units.length)%roles.length],team,demoEmployeeEmail(i),i%19===0?'On leave':i===59?'Inactive':'Active'];
  });
  const active = people.filter(person=>person[4]==='Active');
  const date = offset => {
    const day=new Date(now);
    day.setUTCDate(day.getUTCDate()+offset);
    return day.toISOString().slice(0,10);
  };
  const candidates = ['Iman','Muna','Abshir','Halima','Nasir','Nimco','Fadumo','Khalid','Idil','Mahir','Sumaya','Anwar'];
  const data = {
    employees:people,
    attendance:Array.from({length:3},(_,day)=>active.slice(0,44).map(([name],i)=>{
      const status=i%13===0?'Absent':i%9===0?'Late':'Present';
      const checkIn=status==='Absent'?'':status==='Late'?'08:25':'07:'+String(30+i%27);
      return [name,date(-day),checkIn,status];
    })).flat(),
    leave:active.slice(0,16).map(([name],i)=>[name,['Annual','Sick','Personal'][i%3],date(i-3),date(i-2),['Approved','Pending','Pending','Declined'][i%4]]),
    payroll:people.slice(0,59).map(([name],i)=>[name,date(0).slice(0,7),String(425+(i*37)%1100)+'.00',i%4===0?'Draft':'Processed']),
    recruitment:candidates.map((name,i)=>{
      const [team,roles]=units[i%7];
      return [name+' '+lastNames[i%lastNames.length],roles[i%roles.length],team,['Applied','Interview','Offer','Hired'][i%4]];
    }),
    performance:active.slice(0,24).map(([name],i)=>[name,date(0).slice(0,4)+' Equipment Operations Review',active[24+i%8][0],['Scheduled','In progress','Completed'][i%3]]),
    announcements:[
      ['Factory shift handover','Manufacturing and Quality & Safety teams review pending equipment checks before handover.',date(0),'Published'],
      ['Equipment showroom demonstration','Sales and Field Service will run a sample demonstration covering concrete mixers and plate compactors.',date(-1),'Published'],
      ['Warehouse cycle count','Count spare parts, fasteners and machine accessories by shelf zone and reconcile differences.',date(-2),'Published'],
      ['Preventive maintenance week','Field Service will review service logs and follow the inspection schedule for demonstration units.',date(-4),'Published'],
      ['Dispatch checklist update','Logistics should confirm item quantities, packing condition and handover signatures before departure.',date(-6),'Published'],
      ['Workshop induction plan','Review the draft induction agenda for new production and service team members.',date(-7),'Draft']
    ],
    documents:[
      ['Employee handbook','Handbook','','Draft'],['Workshop safety induction','Policy','','Draft'],
      ['Equipment inspection checklist','Template','','Draft'],['Warehouse stock count sheet','Template','','Draft'],
      ['Dispatch handover form','Template','','Draft'],['Sales demonstration checklist','Template','','Draft'],
      ['Service call report','Template','','Draft'],['Quality incident record','Template','','Draft']
    ]
  };
  return Object.fromEntries(Object.entries(data).map(([key,rows])=>[key,rows.map((v,i)=>({id:key+i,v}))]));
}
export {makeDemoRecords, diversifyDemoEmployees};
