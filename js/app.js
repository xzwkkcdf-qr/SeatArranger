/* ============================================================
 *  座位表编排工具 — 主逻辑
 *  纯原生 JS，依赖：SheetJS / html2canvas / jsPDF
 * ============================================================ */
(function(){
  "use strict";

  /* ---------- 状态 ---------- */
  const STORAGE_KEY = "seat-app:classes:v1";
  let uidSeq = 1;
  const newUid = () => "u" + (uidSeq++);

  const defaultLayout = { type:"grid", rows:6, cols:6, groupSize:6 };
  const defaultOptions = { showPodium:true, showId:false, showGrid:true };

  function blankClass(name){
    return {
      id: "c"+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
      name: name || "未命名班级",
      title: "",
      students: [],
      seating: [],
      layout: JSON.parse(JSON.stringify(defaultLayout)),
      options: JSON.parse(JSON.stringify(defaultOptions))
    };
  }

  let state = {
    classes: [],          // 班级数组
    currentId: null,      // 当前班级 id
  };

  function curClass(){
    return state.classes.find(c=>c.id===state.currentId) || null;
  }

  /* ---------- 持久化 ---------- */
  function load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(raw){
        const data = JSON.parse(raw);
        state.classes = Array.isArray(data.classes) ? data.classes : [];
        state.currentId = data.currentId || (state.classes[0] && state.classes[0].id) || null;
        // 恢复 uidSeq
        let maxUid = 0;
        state.classes.forEach(c=>c.students.forEach(s=>{ if(s.uid) {const n=parseInt(s.uid.slice(1)); if(!isNaN(n)&&n>maxUid)maxUid=n;} }));
        uidSeq = maxUid+1;
      }
    }catch(e){ console.warn("加载存档失败",e); }
    if(state.classes.length===0){
      const c = blankClass("示例班级");
      state.classes.push(c);
      state.currentId = c.id;
    }
  }
  function save(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch(e){ toast("保存失败：浏览器存储空间不足","error"); }
  }

  /* ---------- 工具函数 ---------- */
  const $ = (sel,root=document)=>root.querySelector(sel);
  const $$ = (sel,root=document)=>Array.from(root.querySelectorAll(sel));
  const escapeHtml = s => String(s==null?"":s).replace(/[&<>"']/g, m => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[m]));

  let toastTimer = null;
  function toast(msg, type){
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast show " + (type||"");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>{ el.className="toast hidden"; }, 2400);
  }

  function setStatus(msg, type){
    const el = $("#status-bar");
    el.textContent = msg;
    el.className = "chart-foot " + (type||"");
  }

  /* ---------- 座位数计算 ---------- */
  function seatCount(layout){
    if(layout.type==="grid") return Math.max(1, layout.rows*layout.cols);
    // group / roundtable: cols = 组/桌数, groupSize = 每组人数
    return Math.max(1, layout.cols*layout.groupSize);
  }

  /* ============================================================
   *  Excel 导入
   * ============================================================ */
  function handleFile(file){
    if(!file) return;
    const reader = new FileReader();
    const isCsv = /\.csv$/i.test(file.name);
    reader.onload = function(e){
      try{
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type:"array", codepage: 936 });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if(!sheet){ toast("工作簿中没有工作表","error"); return; }
        const rows = XLSX.utils.sheet_to_json(sheet, { header:1, defval:"", blankrows:false });
        if(!rows.length){ toast("Excel 中没有数据","error"); return; }

        // 列检测：第一行若全为字符串且包含关键字则视为表头
        const firstRow = rows[0];
        const headerKeys = ["姓名","name","学生","学生姓名","名字","学号","序号","id","no","备注","说明","特殊"];
        const isHeaderRow = firstRow.every(c=>typeof c==="string" && c.trim()!=="") &&
          firstRow.some(c=>headerKeys.some(k=>String(c).toLowerCase().includes(k)));
        let nameIdx=0, idIdx=1, noteIdx=-1;
        let dataRows = rows;
        if(isHeaderRow){
          dataRows = rows.slice(1);
          firstRow.forEach((c,i)=>{
            const lc = String(c).toLowerCase();
            if(headerIdxMatch(lc,"姓名","name","学生","名字")) nameIdx=i;
            else if(headerIdxMatch(lc,"学号","序号","id","no","学籍")) idIdx=i;
            else if(headerIdxMatch(lc,"备注","说明","特殊")) noteIdx=i;
          });
        } else {
          // 无表头：第0列姓名，第1列学号(若有)，找备注列
          if(firstRow.length>=2 && !/^\d+$/.test(String(firstRow[1]).trim()) === false) idIdx=1;
          // 尝试在第2列找备注
          if(firstRow.length>=3) noteIdx=2;
        }

        const c = curClass();
        if(!c){ toast("请先选择班级","error"); return; }
        const students = [];
        let skipped = 0;
        dataRows.forEach(r=>{
          if(!r || r.length===0) return;
          const name = String(r[nameIdx]==null?"":r[nameIdx]).trim();
          if(!name){ skipped++; return; }
          const sid = idIdx>=0 && r[idIdx]!=null ? String(r[idIdx]).trim() : "";
          const note = noteIdx>=0 && r[noteIdx]!=null ? String(r[noteIdx]).trim() : "";
          students.push({ uid:newUid(), name, sid, note });
        });
        if(!students.length){ toast("未解析到有效学生姓名","error"); return; }

        // 询问是追加还是覆盖
        const overwrite = c.students.length>0 ? confirm(
          `当前班级已有 ${c.students.length} 名学生。\n点击「确定」将覆盖原名单，点击「取消」则追加到现有名单。`
        ) : true;
        if(overwrite){ c.students = students; }
        else { c.students = c.students.concat(students); }
        // 重置入座（保留原座位中的学生，其余进入未入座）
        reseatAfterImport(c);
        save(); renderAll();
        toast(`成功导入 ${students.length} 名学生${skipped?`，跳过 ${skipped} 行空数据`:""}`,"ok");
      }catch(err){
        console.error(err);
        toast("导入失败："+err.message,"error");
      }
    };
    reader.onerror = ()=>toast("读取文件失败","error");
    if(isCsv){ reader.readAsText(file); }
    else { reader.readAsArrayBuffer(file); }
  }

  function headerIdxMatch(lc, ...keys){ return keys.some(k=>lc.includes(k)); }

  // 导入后：把不在学生列表里的旧座位清空，保持其余座位
  function reseatAfterImport(c){
    const validUids = new Set(c.students.map(s=>s.uid));
    c.seating = c.seating.map(uid=> (uid && validUids.has(uid)) ? uid : null);
    // 保证长度对齐当前布局
    const n = seatCount(c.layout);
    while(c.seating.length<n) c.seating.push(null);
    if(c.seating.length>n) c.seating.length=n;
  }

  /* ============================================================
   *  渲染：左侧名单 + 班级选择 + 座位表
   * ============================================================ */
  function renderAll(){
    renderClassSelect();
    renderSidebar();
    renderLayoutFields();
    renderChart();
    $("#saved-count").textContent = state.classes.length;
  }

  function renderClassSelect(){
    const sel = $("#class-select");
    const cur = curClass();
    sel.innerHTML = state.classes.map(c=>`<option value="${c.id}" ${c.id===state.currentId?"selected":""}>${escapeHtml(c.name)}</option>`).join("");
    $("#class-name").value = cur ? cur.name : "";
  }

  function renderSidebar(){
    const c = curClass();
    const list = $("#unseated-list");
    if(!c){ list.innerHTML = '<div class="empty-tip">请先选择班级</div>'; $("#unseated-count").textContent=0; return; }
    const seatedUids = new Set(c.seating.filter(Boolean));
    const q = ($("#search-student").value||"").trim().toLowerCase();
    const unseated = c.students.filter(s=>!seatedUids.has(s.uid) && (!q || s.name.toLowerCase().includes(q) || (s.sid||"").toLowerCase().includes(q)));
    $("#unseated-count").textContent = unseated.length;
    if(!unseated.length){
      list.innerHTML = `<div class="empty-tip">${q?"未找到匹配学生":"所有学生均已入座 🎉"}</div>`;
      return;
    }
    list.innerHTML = unseated.map(s=>`
      <div class="student-chip" draggable="true" data-uid="${s.uid}">
        <span class="sc-name">${escapeHtml(s.name)}</span>
        ${s.sid?`<span class="sc-id">${escapeHtml(s.sid)}</span>`:""}
        <button class="sc-del" data-uid="${s.uid}" title="删除该学生">✕</button>
      </div>`).join("");
  }

  /* ---------- 布局字段显隐与标签 ---------- */
  function renderLayoutFields(){
    const c = curClass(); if(!c) return;
    const L = c.layout;
    const typeSel = $("#layout-type");
    typeSel.value = L.type;
    const rowsWrap = $("#layout-rows").closest(".field");
    const colsWrap = $("#layout-cols").closest(".field");
    const groupWrap = $("#layout-groupsize").closest(".field");
    const colsLabel = colsWrap.querySelector(".field-label");
    const rowsLabel = rowsWrap.querySelector(".field-label");

    if(L.type==="grid"){
      rowsWrap.style.display="";
      colsWrap.style.display="";
      groupWrap.style.display="none";
      colsLabel.textContent="列数";
      rowsLabel.textContent="行数";
      $("#layout-rows").value=L.rows; $("#layout-cols").value=L.cols;
    } else {
      rowsWrap.style.display="none";
      colsWrap.style.display="";
      groupWrap.style.display="";
      colsLabel.textContent = L.type==="roundtable" ? "桌数" : "组数";
      $("#layout-cols").value=L.cols; $("#layout-groupsize").value=L.groupSize;
    }
  }

  /* ---------- 座位表渲染 ---------- */
  function renderChart(){
    const c = curClass(); if(!c) return;
    const titleInput = $("#chart-title");
    titleInput.value = c.title || c.name || "座位表";
    // 选项 checkbox
    $("#show-podium").checked = c.options.showPodium;
    $("#show-id").checked = c.options.showId;
    $("#show-grid").checked = c.options.showGrid;
    // 讲台
    $("#podium").classList.toggle("hidden-podium", !c.options.showPodium);

    const grid = $("#seat-grid");
    const L = c.layout;
    // 保证 seating 长度
    const n = seatCount(L);
    while(c.seating.length<n) c.seating.push(null);
    if(c.seating.length>n) c.seating.length=n;

    grid.innerHTML = "";
    grid.className = "seat-grid";
    if(L.type==="grid") renderGrid(grid, c);
    else if(L.type==="group") renderGroup(grid, c);
    else renderRound(grid, c);

    // 绑定座位事件
    bindSeatEvents(grid);
    updateStatusCount();
  }

  function updateStatusCount(){
    const c = curClass(); if(!c) return;
    const seated = c.seating.filter(Boolean).length;
    const total = c.students.length;
    setStatus(`已入座 ${seated} / ${total} 名学生 · 布局：${layoutLabel(c.layout)}`);
  }
  function layoutLabel(L){
    return L.type==="grid" ? `行列式 ${L.rows}×${L.cols}`
      : L.type==="group" ? `小组式 ${L.cols}组×${L.groupSize}人`
      : `圆桌式 ${L.cols}桌×${L.groupSize}人`;
  }

  function seatHtml(c, idx, seatNoText, style){
    const uid = c.seating[idx];
    const student = uid ? c.students.find(s=>s.uid===uid) : null;
    const isSpecial = c.options._special && c.options._special.includes(idx);
    const isPinned  = c.options._pinned  && c.options._pinned.includes(idx);
    let cls = "seat";
    if(!student) cls += " empty-seat";
    if(isSpecial) cls += " special";
    if(isPinned) cls += " pinned";
    const showGrid = c.options.showGrid;
    const showId = c.options.showId;
    const noText = showGrid ? `<span class="seat-no">${seatNoText||""}</span>` : "";
    let body = "";
    if(student){
      body = `<span class="seat-name">${escapeHtml(student.name)}</span>`
        + (showId && student.sid ? `<span class="seat-id">${escapeHtml(student.sid)}</span>`:"")
        + (student.note ? `<span class="seat-note">${escapeHtml(student.note)}</span>`:"");
    }
    const actions = `<span class="seat-actions">
        <button data-act="special" title="${isSpecial?"取消特殊标记":"标记为特殊座位"}">${isSpecial?"★":"☆"}</button>
        ${student?`<button data-act="clear" title="移回名单">✕</button>`:""}
      </span>`;
    const styleAttr = style ? ` style="${style}"` : "";
    return `<div class="${cls}" data-seat="${idx}" draggable="${student?'true':'false'}"${styleAttr}>${noText}${body}${actions}</div>`;
  }

  function renderGrid(grid, c){
    const {rows,cols} = c.layout;
    for(let r=0;r<rows;r++){
      const row = document.createElement("div");
      row.className = "seat-row";
      for(let col=0;col<cols;col++){
        const idx = r*cols+col;
        row.insertAdjacentHTML("beforeend", seatHtml(c, idx, String(idx+1)));
      }
      grid.appendChild(row);
    }
  }

  function renderGroup(grid, c){
    const {cols:groups, groupSize} = c.layout;
    const row = document.createElement("div");
    row.className = "group-row";
    for(let g=0; g<groups; g++){
      const group = document.createElement("div");
      group.className = "group";
      group.insertAdjacentHTML("beforeend", `<div class="group-label">第 ${g+1} 组</div>`);
      const desks = document.createElement("div");
      desks.className = "group-desks";
      for(let i=0;i<groupSize;i++){
        const idx = g*groupSize+i;
        desks.insertAdjacentHTML("beforeend", seatHtml(c, idx, `${g+1}-${i+1}`));
      }
      group.appendChild(desks);
      row.appendChild(group);
    }
    grid.appendChild(row);
  }

  function renderRound(grid, c){
    const {cols:tables, groupSize} = c.layout;
    const row = document.createElement("div");
    row.className = "table-row";
    for(let t=0; t<tables; t++){
      const table = document.createElement("div");
      table.className = "round";
      table.insertAdjacentHTML("beforeend", `<div class="round-label">桌${t+1}</div>`);
      const radius = 62;
      for(let i=0;i<groupSize;i++){
        const idx = t*groupSize+i;
        const angle = (Math.PI*2*i)/groupSize - Math.PI/2; // 从正上方开始
        const x = Math.cos(angle)*radius;
        const y = Math.sin(angle)*radius;
        const style = `left:calc(50% + ${x.toFixed(1)}px - 32px); top:calc(50% + ${y.toFixed(1)}px - 27px);`;
        table.insertAdjacentHTML("beforeend", seatHtml(c, idx, `${t+1}-${i+1}`, style));
      }
      row.appendChild(table);
    }
    grid.appendChild(row);
  }

  /* ---------- 座位交互 ---------- */
  let dragSource = null; // {type:'chip'|'seat', uid?, seatIdx?}

  function bindSeatEvents(grid){
    // 座位拖拽源
    $$(".seat", grid).forEach(seatEl=>{
      seatEl.addEventListener("dragstart", e=>{
        if(seatEl.classList.contains("empty-seat")){ e.preventDefault(); return; }
        const idx = +seatEl.dataset.seat;
        const uid = curClass().seating[idx];
        dragSource = { type:"seat", seatIdx:idx, uid };
        seatEl.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(idx));
      });
      seatEl.addEventListener("dragend", ()=>{
        seatEl.classList.remove("dragging");
        $$(".seat.drag-over",grid).forEach(s=>s.classList.remove("drag-over"));
      });
      // 作为放置目标
      seatEl.addEventListener("dragover", e=>{
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        seatEl.classList.add("drag-over");
      });
      seatEl.addEventListener("dragleave", ()=>seatEl.classList.remove("drag-over"));
      seatEl.addEventListener("drop", e=>{
        e.preventDefault(); e.stopPropagation();
        seatEl.classList.remove("drag-over");
        if(!dragSource) return;
        const targetIdx = +seatEl.dataset.seat;
        handleDropToSeat(dragSource, targetIdx);
        dragSource = null;
      });
      // 座位操作按钮
      seatEl.addEventListener("click", e=>{
        const btn = e.target.closest("button[data-act]");
        if(!btn) return;
        e.stopPropagation();
        const idx = +seatEl.dataset.seat;
        if(btn.dataset.act==="special") toggleSpecial(idx);
        else if(btn.dataset.act==="clear") clearSeat(idx);
      });
    });
  }

  function handleDropToSeat(src, targetIdx){
    const c = curClass(); if(!c) return;
    const targetUid = c.seating[targetIdx];
    if(src.type==="chip"){
      // 从名单拖入座位
      if(targetUid){
        // 目标有人 -> 交换：把目标的人放回名单（其实应交换座位更自然，这里目标有人就先移回名单）
        c.seating[targetIdx] = src.uid; // 新人入座
        // 原目标学生回到未入座名单（不强制交换，因为来自名单）
        // 这里采用：若目标已有人，则把原学生移回名单
      } else {
        c.seating[targetIdx] = src.uid;
      }
      // 若来源是某个座位（chip不会），无需处理
    } else if(src.type==="seat"){
      const fromIdx = src.seatIdx;
      if(fromIdx===targetIdx) return;
      // 交换两个座位
      c.seating[fromIdx] = targetUid; // 可能为 null
      c.seating[targetIdx] = src.uid;
    }
    save(); renderAll();
  }

  function clearSeat(idx){
    const c = curClass(); if(!c) return;
    c.seating[idx] = null;
    save(); renderAll();
  }

  function toggleSpecial(idx){
    const c = curClass(); if(!c) return;
    c.options._special = c.options._special || [];
    const i = c.options._special.indexOf(idx);
    if(i>=0) c.options._special.splice(i,1); else c.options._special.push(idx);
    save(); renderAll();
  }

  /* ---------- 名单（未入座）拖拽 ---------- */
  function bindSidebarEvents(){
    const list = $("#unseated-list");
    // 拖拽源
    list.addEventListener("dragstart", e=>{
      const chip = e.target.closest(".student-chip");
      if(!chip) return;
      dragSource = { type:"chip", uid: chip.dataset.uid };
      chip.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", chip.dataset.uid);
    });
    list.addEventListener("dragend", e=>{
      const chip = e.target.closest(".student-chip");
      chip && chip.classList.remove("dragging");
    });
    // 作为放置目标：把座位上的学生拖回名单
    list.addEventListener("dragover", e=>{
      if(dragSource && dragSource.type==="seat"){ e.preventDefault(); e.dataTransfer.dropEffect="move"; }
    });
    list.addEventListener("drop", e=>{
      if(dragSource && dragSource.type==="seat"){
        e.preventDefault();
        const c = curClass(); if(!c) return;
        c.seating[dragSource.seatIdx] = null;
        save(); renderAll();
        dragSource = null;
      }
    });
    // 删除学生
    list.addEventListener("click", e=>{
      const del = e.target.closest(".sc-del");
      if(!del) return;
      const uid = del.dataset.uid;
      const c = curClass(); if(!c) return;
      if(!confirm("确定从名单中删除该学生？")) return;
      c.students = c.students.filter(s=>s.uid!==uid);
      c.seating = c.seating.map(u=> u===uid?null:u);
      save(); renderAll();
    });
  }

  /* ============================================================
   *  排序 / 随机 / 清空
   * ============================================================ */
  function autoFill(sortedStudents){
    // 将排序后的学生依次填入空座位（保留已固定座位不动）
    const c = curClass(); if(!c) return;
    const n = c.seating.length;
    // 收集空位索引
    const emptyIdx = [];
    for(let i=0;i<n;i++) if(!c.seating[i]) emptyIdx.push(i);
    let queue = sortedStudents.slice();
    for(const idx of emptyIdx){
      if(!queue.length) break;
      c.seating[idx] = queue.shift().uid;
    }
    // 若还有剩余学生且座位不足，提示
    if(queue.length){ toast(`座位已满，${queue.length} 名学生未入座，请增加座位`,"error"); }
    save(); renderAll();
  }

  function sortBy(field){
    const c = curClass(); if(!c) return;
    if(!c.students.length){ toast("请先导入名单","error"); return; }
    const list = c.students.slice();
    if(field==="id"){
      list.sort((a,b)=> natCmp(a.sid||"", b.sid||"") || natCmp(a.name,b.name));
    } else { // name
      list.sort((a,b)=> a.name.localeCompare(b.name,"zh-Hans-CN") || natCmp(a.sid||"",b.sid||""));
    }
    // 先清空所有座位再依次填入
    c.seating = c.seating.map(()=>null);
    autoFill(list);
    toast("已按"+(field==="id"?"学号":"姓名")+"排序入座","ok");
  }

  function randomSeat(){
    const c = curClass(); if(!c) return;
    if(!c.students.length){ toast("请先导入名单","error"); return; }
    const list = c.students.slice();
    for(let i=list.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [list[i],list[j]]=[list[j],list[i]]; }
    c.seating = c.seating.map(()=>null);
    autoFill(list);
    toast("已随机排座","ok");
  }

  function clearAllSeats(){
    const c = curClass(); if(!c) return;
    c.seating = c.seating.map(()=>null);
    save(); renderAll();
    toast("已清空所有座位");
  }

  // 自然数比较（学号可能含字母）
  function natCmp(a,b){
    a=String(a); b=String(b);
    return a.localeCompare(b, "zh-Hans-CN", {numeric:true});
  }

  /* ---------- 载入示例数据 ---------- */
  const SAMPLE_NAMES = [
    "王思雨","李梓涵","张子轩","陈一诺","刘沐辰","杨欣怡","黄煜城","赵瑾萱",
    "周奕辰","吴雨桐","徐若汐","孙嘉懿","马俊熙","朱梓萱","胡皓宇","郭语桐",
    "林芷若","何子睿","高晨曦","罗紫宁","郑艺涵","梁俊豪","宋知夏","谢宇轩",
    "韩雨欣","唐文博","冯一帆","邓梓瑶","曹锦程","彭娅萱","袁牧之","许若男",
    "陆星辰","丁思源","沈嘉树","江语涵","任远舟","严梓涵","贾雨泽","秦晓月"
  ];
  const SAMPLE_NOTES = ["视力矫正","靠近讲台","听力辅助","靠前优先"];

  function loadSample(){
    const c = curClass(); if(!c) return;
    const overwrite = c.students.length>0 ? confirm(
      `当前班级已有 ${c.students.length} 名学生。\n点击「确定」用示例数据覆盖，点击「取消」则追加示例数据。`
    ) : true;
    const sample = SAMPLE_NAMES.map((name,i)=>({
      uid:newUid(),
      name,
      sid:"2024"+String(i+1).padStart(3,"0"),
      note: (i%10===5) ? SAMPLE_NOTES[i%SAMPLE_NOTES.length] : ""
    }));
    if(overwrite){
      c.students = sample;
      c.seating = c.seating.map(()=>null);
    } else {
      c.students = c.students.concat(sample);
    }
    // 把示例学生按学号顺序自动填入空座位，便于直观查看
    autoFill(sample.slice().sort((a,b)=>natCmp(a.sid,b.sid)));
    save(); renderAll();
    toast(`已载入 ${sample.length} 名示例学生${overwrite?"（覆盖）":"（追加）"}`,"ok");
  }

  /* ============================================================
   *  布局应用
   * ============================================================ */
  function applyLayout(){
    const c = curClass(); if(!c) return;
    const type = $("#layout-type").value;
    const cols = Math.max(1, parseInt($("#layout-cols").value)||1);
    const rows = Math.max(1, parseInt($("#layout-rows").value)||1);
    const groupSize = Math.max(2, parseInt($("#layout-groupsize").value)||6);
    // 切换布局前，先收集当前已入座的学生 uid（保持原顺序），避免学生因布局变更而“消失”
    const seatedUids = c.seating.filter(Boolean);
    c.layout = { type, rows, cols, groupSize };
    const n = seatCount(c.layout);
    // 重建 seating：把已入座学生按原顺序依次填入新布局的前若干座位，其余留空
    const newSeating = new Array(n).fill(null);
    const queue = seatedUids.slice();
    for(let i=0;i<n && queue.length;i++){
      newSeating[i] = queue.shift();
    }
    c.seating = newSeating;
    // 清理超出新座位范围的特殊标记
    if(c.options._special) c.options._special = c.options._special.filter(i=>i<n);
    if(c.options._pinned)  c.options._pinned  = c.options._pinned.filter(i=>i<n);
    save(); renderAll();
    toast("已应用新布局： "+layoutLabel(c.layout),"ok");
  }

  /* ============================================================
   *  班级管理
   * ============================================================ */
  function addClass(){
    const name = ($("#class-name").value||"").trim() || "新班级";
    const c = blankClass(name);
    state.classes.push(c);
    state.currentId = c.id;
    save(); renderAll();
    toast("已新建班级："+name,"ok");
  }
  function renameClass(){
    const c = curClass(); if(!c) return;
    const name = ($("#class-name").value||"").trim();
    if(!name){ toast("班级名称不能为空","error"); return; }
    c.name = name;
    save(); renderAll();
    toast("已重命名","ok");
  }
  function deleteClass(){
    const c = curClass(); if(!c) return;
    if(state.classes.length<=1){ toast("至少保留一个班级","error"); return; }
    if(!confirm(`确定删除班级「${c.name}」？此操作不可撤销。`)) return;
    state.classes = state.classes.filter(x=>x.id!==c.id);
    state.currentId = state.classes[0].id;
    save(); renderAll();
    toast("已删除班级");
  }
  function switchClass(id){
    state.currentId = id;
    save(); renderAll();
  }

  /* ============================================================
   *  手动添加学生
   * ============================================================ */
  function openAddModal(){
    $("#add-name").value=""; $("#add-id").value=""; $("#add-note").value="";
    $("#modal-add").classList.remove("hidden");
    setTimeout(()=>$("#add-name").focus(),50);
  }
  function closeAddModal(){ $("#modal-add").classList.add("hidden"); }
  function confirmAdd(){
    const c = curClass(); if(!c) return;
    const name = ($("#add-name").value||"").trim();
    if(!name){ toast("请填写姓名","error"); return; }
    const sid = ($("#add-id").value||"").trim();
    const note = ($("#add-note").value||"").trim();
    c.students.push({ uid:newUid(), name, sid, note });
    save(); closeAddModal(); renderAll();
    toast("已添加："+name,"ok");
  }

  /* ============================================================
   *  导出 / 打印
   * ============================================================ */
  function captureCanvas(){
    const target = $("#chart-wrap");
    const opts = {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      logging: false,
    };
    return html2canvas(target, opts);
  }

  function exportImage(){
    const c = curClass(); if(!c) return;
    setStatus("正在生成图片…");
    captureCanvas().then(canvas=>{
      const link = document.createElement("a");
      const title = (c.title||c.name||"座位表").replace(/[\\/:*?"<>|]/g,"_");
      link.download = title+".png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      setStatus("图片已导出","ok");
      toast("图片已导出","ok");
    }).catch(err=>{ console.error(err); toast("导出失败："+err.message,"error"); setStatus("导出失败","error"); });
  }

  function exportPDF(){
    const c = curClass(); if(!c) return;
    setStatus("正在生成 PDF…");
    captureCanvas().then(canvas=>{
      const { jsPDF } = window.jspdf;
      const imgData = canvas.toDataURL("image/png");
      const isLandscape = canvas.width >= canvas.height;
      const pdf = new jsPDF({
        orientation: isLandscape ? "landscape" : "portrait",
        unit: "pt",
        format: "a4"
      });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const maxW = pageW - margin*2;
      const maxH = pageH - margin*2 - 30; // 留标题
      let w = canvas.width, h = canvas.height;
      const scale = Math.min(maxW/w, maxH/h);
      w = w*scale; h = h*scale;
      const x = (pageW - w)/2;
      const y = margin + 30;
      // 标题
      pdf.setFontSize(16);
      pdf.text(c.title||c.name||"座位表", pageW/2, margin+18, { align:"center" });
      pdf.addImage(imgData, "PNG", x, y, w, h);
      const title = (c.title||c.name||"座位表").replace(/[\\/:*?"<>|]/g,"_");
      pdf.save(title+".pdf");
      setStatus("PDF 已导出","ok");
      toast("PDF 已导出","ok");
    }).catch(err=>{ console.error(err); toast("导出失败："+err.message,"error"); setStatus("导出失败","error"); });
  }

  function printChart(){
    // 让打印样式生效，标题可见
    const c = curClass(); if(!c) return;
    // 临时确保讲台与标题在打印中可见
    const titleInput = $("#chart-title");
    const prev = titleInput.value;
    // 把标题渲染为文本节点供打印
    window.print();
  }

  /* ============================================================
   *  事件绑定
   * ============================================================ */
  function bindEvents(){
    // 导入
    $("#btn-import").addEventListener("click", ()=>$("#file-input").click());
    $("#file-input").addEventListener("change", e=>{ handleFile(e.target.files[0]); e.target.value=""; });

    // 布局
    $("#layout-type").addEventListener("change", ()=>{
      const c = curClass(); if(!c) return;
      const type = $("#layout-type").value;
      c.layout.type = type;
      // 切换时设置合理默认
      if(type==="grid"){ c.layout.rows=6; c.layout.cols=6; }
      else { c.layout.cols = type==="roundtable"?6:8; c.layout.groupSize=6; }
      renderLayoutFields();
      applyLayout();
    });
    $("#btn-apply-layout").addEventListener("click", applyLayout);

    // 排序/随机/清空
    $("#btn-sort-id").addEventListener("click", ()=>sortBy("id"));
    $("#btn-sort-name").addEventListener("click", ()=>sortBy("name"));
    $("#btn-random").addEventListener("click", randomSeat);
    $("#btn-clear").addEventListener("click", clearAllSeats);
    $("#btn-sample").addEventListener("click", loadSample);

    // 班级
    $("#btn-add-class").addEventListener("click", addClass);
    $("#btn-rename-class").addEventListener("click", renameClass);
    $("#btn-del-class").addEventListener("click", deleteClass);
    $("#class-select").addEventListener("change", e=>switchClass(e.target.value));
    $("#btn-save-class").addEventListener("click", ()=>{ save(); toast("当前班级配置已保存","ok"); });

    // 搜索
    $("#search-student").addEventListener("input", renderSidebar);

    // 添加学生
    $("#btn-add-student").addEventListener("click", openAddModal);
    $("#btn-add-cancel").addEventListener("click", closeAddModal);
    $("#btn-add-confirm").addEventListener("click", confirmAdd);
    $("#modal-add").addEventListener("click", e=>{ if(e.target.id==="modal-add") closeAddModal(); });

    // 导出/打印
    $("#btn-export-img").addEventListener("click", exportImage);
    $("#btn-export-pdf").addEventListener("click", exportPDF);
    $("#btn-print").addEventListener("click", printChart);

    // 图表选项
    $("#chart-title").addEventListener("input", e=>{
      const c = curClass(); if(!c) return; c.title = e.target.value; save();
    });
    $("#show-podium").addEventListener("change", e=>{ const c=curClass(); if(!c)return; c.options.showPodium=e.target.checked; save(); renderChart(); });
    $("#show-id").addEventListener("change", e=>{ const c=curClass(); if(!c)return; c.options.showId=e.target.checked; save(); renderChart(); });
    $("#show-grid").addEventListener("change", e=>{ const c=curClass(); if(!c)return; c.options.showGrid=e.target.checked; save(); renderChart(); });

    // 键盘：Esc 关闭弹窗
    document.addEventListener("keydown", e=>{
      if(e.key==="Escape" && !$("#modal-add").classList.contains("hidden")) closeAddModal();
    });

    bindSidebarEvents();
  }

  /* ---------- 初始化 ---------- */
  function init(){
    load();
    bindEvents();
    renderAll();
    // 首次引导
    if(curClass() && curClass().students.length===0){
      setStatus("开始使用：点击右上「导入名单」上传 Excel，或点击「+ 手动添加学生」");
    }
  }

  // 入口
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
  else init();

})();
