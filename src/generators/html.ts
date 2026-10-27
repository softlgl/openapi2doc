import type { ApiDocument } from '../types'

export type ThemeMode = 'light' | 'dark'

export interface HtmlOptions {
  /** 显示接口勾选框（用于父页面收集所选接口） */
  selection?: boolean
  /** 初始主题；嵌入到管理界面时由外层传入，独立打开时留空以跟随系统 */
  theme?: ThemeMode
  /** 内嵌模式：作为独立可滚动 iframe 视口嵌入管理界面（滚动/锚点/返回顶部均原生处理，
   *  仅勾选与主题通过 postMessage 与父页面单向/反向同步） */
  embed?: boolean
}

function escapeHtml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function esc(obj: unknown): string {
  return escapeHtml(typeof obj === 'string' ? obj : JSON.stringify(obj ?? ''))
}

const RENDER_FN = `
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function methodBadge(m){var cm={GET:'#2563eb',POST:'#059669',PUT:'#d97706',DELETE:'#dc2626',PATCH:'#7c3aed',OPTIONS:'#0ea5e9',HEAD:'#9333ea',TRACE:'#64748b'};var bg=cm[m.toUpperCase()]||'#64748b';return '<span class="method" style="background:'+bg+'">'+m.toUpperCase()+'</span>';}
function toggleBox(title){ title.parentNode.classList.toggle('collapsed'); }

// 认证方案展示：拼接类型/位置/参数名等细节
function authDetail(d){
  var bits=[];
  if(d.type==='apiKey'){ bits.push('apiKey'); if(d.in) bits.push('位于 '+d.in); if(d.param) bits.push('参数名 '+d.param); }
  else if(d.type==='http'){ bits.push('HTTP '+(d.scheme||'basic')); }
  else if(d.type==='oauth2'||d.type==='openIdConnect'){ bits.push(d.type==='oauth2'?'OAuth2':'OpenID Connect'); }
  else if(d.type){ bits.push(d.type); }
  return bits.join(' · ');
}
function authLabel(d){ return d.label||d.displayName||d.schemeId||'认证'; }
// 概览区胶囊：短标签+细节，长 description 悬停提示（不内联，避免长句撑破行）
function authChipHtml(d){
  var detail=authDetail(d);
  // tip 已自行转义，外层不再 esc
  var tip=d.description?(esc(d.description)+'<br>'+esc(detail)):esc(detail);
  return '<span class="auth-chip" title="'+tip+'"><span class="auth-lock">🔒</span>'+esc(authLabel(d))+(detail?'<span class="auth-detail">'+esc(detail)+'</span>':'')+'</span>';
}
// 接口标题行的紧凑标签：只显首个方案短标签，多方案以 +N 计数；未声明 security 不展示
function authOpHtml(op){
  if(op.auth===undefined||op.auth===null) return '';
  if(!op.auth.length) return '<span class="auth-mini none" title="此接口无需认证">无需认证</span>';
  var names=op.auth.map(authLabel).join(' / ');
  var more=op.auth.length>1?'<span class="auth-more">+'+(op.auth.length-1)+'</span>':'';
  return '<span class="auth-mini" title="认证：'+esc(names)+'（任选其一）"><span class="auth-lock">🔒</span>'+esc(authLabel(op.auth[0]))+more+'</span>';
}

function enumLabels(s){
  var map={};
  var d=String(s.description||'');
  var re=/(?:^|[\\r\\n;；])\\s*([0-9a-zA-Z_-]+)\\s*(?:[-–= ]+|\\s+is\\s+)\\s*(.+?)\\s*(?=$|[\\r\\n;；])/g;
  var m; while((m=re.exec(d))!==null){ map[String(m[1]).trim()]=String(m[2]).trim(); }
  return map;
}
function renderEnum(s){
  var raw; try{ raw=JSON.parse(s.enum); }catch(e){ raw=[s.enum]; }
  if(!Array.isArray(raw)) raw=[raw];
  var labels=enumLabels(s);
  var palette=['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6','#ec4899'];
  var list='';
  for(var i=0;i<raw.length;i++){
    var k=String(raw[i]);
    var lbl=labels[k]?' — '+labels[k]:'';
    list+='<span class="enumVal" style="--c:'+palette[i%palette.length]+'">'+esc(raw[i])+'<span class="enum-label">'+lbl+'</span></span>';
  }
  return '<span class="enum-wrap"><span class="enum-lbl">枚举取值</span>'+list+'</span>';
}
// 将 C# 泛型全名展示为可读形式：去掉命名空间、泛型外壳与程序集版本信息（返回纯文本）
function plainName(n){
  var s=String(n==null?'':n).trim();
  var outer=s, inner=[];
  var gm=s.match(/^(.*?)\x60\\d+\\[\\[(.*)\\]\\]\\s*$/) || s.match(/^(.*?)\x60\\d+/);
  if(gm){ outer=gm[1]; var add=s.match(/\\[\\[(.*)\\]\\]/); if(add){ var re=/\\[([^,\\]]+)/g; var m; while((m=re.exec(add[1]))!==null) inner.push(m[1]); } }
  var arr=outer.slice(-2)==='[]'?'[]':''; outer=outer.replace(/\\[\\]$/,'');
  var gi=outer.search(/(?:\x60\\d+|\\[\\[)/); if(gi>=0) outer=outer.slice(0,gi);
  var dot=outer.lastIndexOf('.'); if(dot>=0&&dot<outer.length-1) outer=outer.slice(dot+1);
  var innerStr=inner.map(function(t){ var d=t.lastIndexOf('.'); return d>=0?t.slice(d+1):t; }).join(', ');
  return outer+(innerStr?'<'+innerStr+'>':'')+arr;
}
// displayName 统一返回已转义 HTML，调用点直接拼接（修复 objectChip/arrayChain 双重转义）
function displayName(n){ return esc(plainName(n)); }
function objectChip(sch, SCM){
  var name='对象', count=null, t=sch;
  if(sch.ref){ if(SCM[sch.ref]&&SCM[sch.ref].properties) t=SCM[sch.ref]; else t=sch.properties?sch:null; name=displayName(sch.ref); }
  else if(sch.properties){ t=sch; name=sch.title?displayName(sch.title):'对象'; }
  if(t&&t.properties) count=Object.keys(t.properties).length;
  return '<span class="obj-badge"><span class="obj-name">'+name+'</span>'+(count===null?'':'<span class="obj-count">'+count+' 字段</span>')+'</span>';
}
function arrayChip(s, SCM){
  var item=s.items||{};
  var name='对象', count=null;
  if(item.ref){ name=displayName(item.ref); var ss=SCM[item.ref]; if(ss&&ss.properties) count=Object.keys(ss.properties).length; }
  else if(item.properties){ name=item.title?displayName(item.title):'对象'; count=Object.keys(item.properties).length; }
  return '<span class="obj-badge"><span class="arr-tag">[]</span><span class="obj-name">'+name+'</span>'+(count===null?'':'<span class="obj-count">'+count+' 字段</span>')+'</span>';
}
// 由 schema 生成纯净的 JSON 示例结构（不含描述），上层用 JSON.stringify 排版
function sampleValue(sch, SCM, depth){
  depth=depth||0; if(depth>9) return '...';
  var t=sch||{};
  if(sch&&sch.ref) t=SCM[sch.ref]||{};
  if(t.enum){ var a; try{a=JSON.parse(t.enum);}catch(e){a=[t.enum];} if(!Array.isArray(a))a=[a]; return a.length?a[0]:null; }
  if(t.type==='array'){ var it=t.items||{}; return [ sampleValue(it,SCM,depth+1) ]; }
  if(t.properties){ var o={}; Object.keys(t.properties).forEach(function(k){ o[k]=sampleValue(t.properties[k].schema||{},SCM,depth+1); }); return o; }
  var ty=(''+(t.type||'string')).toLowerCase();
  if(ty==='integer'||ty==='number') return 0;
  if(ty==='boolean') return false;
  if(sch&&sch.ref) return plainName(sch.ref); // 未解析的引用显示可读短名而非 C# 全名
  return 'string';
}
function escapeH(x){ return String(x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
// 轻量 JSON 高亮：键/字符串/数字/布尔 分别着色
function hlJson(s){
  var out='', i=0, n=s.length;
  while(i<n){
    var c=s.charAt(i);
    if(c===' '||c==='\\n'){ out+=c; i++; continue; }
    if(c===':'||c===','||c==='{'||c==='}'||c==='['||c===']'){ out+=escapeH(c); i++; continue; }
    if(c==='"'){ var j=i+1, buf='"'; while(j<n){ var d=s.charAt(j); buf+=d; if(d==='\\\\'){ buf+=s.charAt(j+1)||''; j+=2; continue; } if(d==='"'){ j++; break; } j++; } var k=j; while(k<n&&/\\s/.test(s.charAt(k))) k++; i=j; if(s.charAt(k)===':') out+='<span class="jk">'+escapeH(buf)+'</span>'; else out+='<span class="jstr">'+escapeH(buf)+'</span>'; continue; }
    var num=/^-?\\d+(\\.\\d+)?([eE][+-]?\\d+)?/.exec(s.slice(i));
    if(num){ out+='<span class="jnum">'+escapeH(num[0])+'</span>'; i+=num[0].length; continue; }
    var wm=/^(true|false|null)/.exec(s.slice(i));
    if(wm){ out+='<span class="jbool">'+escapeH(wm[0])+'</span>'; i+=wm[0].length; continue; }
    out+=escapeH(c); i++;
  }
  return out;
}
function renderInlineType(s){
  if(!s) return '';
  if(s.ref) return '<code class="itype">'+esc(s.ref)+'</code>';
  if(s.type==='array'&&s.items) return '<code class="itype">array of '+(s.items.ref?esc(s.items.ref):esc(s.items.type||'any'))+'</code>';
  if(s.enum) return renderEnum(s);
  return s.type?'<code class="itype">'+esc(s.type)+'</code>':'';
}
function renderSchema(s, indent, SCM){
  indent = indent || 0; SCM = SCM || {};
  if(!s) return '';
  if(indent>8) return renderInlineType(s); // 深度保护，避免循环引用递归过深
  if(s.ref){
    var sub=SCM[s.ref];
    if(sub && sub.properties) return renderSchema(sub, indent, SCM); // 展开引用模型
    return '<code class="itype">'+esc(s.ref)+'</code>';
  }
  if(s.type==='array' && s.items){
    var item=s.items;
    var itemSub=(item.ref&&SCM[item.ref]&&SCM[item.ref].properties)?SCM[item.ref]:(item.properties?item:null);
    var itemEnum=(item.ref&&SCM[item.ref]&&SCM[item.ref].enum)?SCM[item.ref]:null;
    var html='<div class="schema">';
    html+='<div class="prop"><div class="prop-top"><span class="arr-tag">[]</span>'+(itemSub?arrayChip(s,SCM):(itemEnum?renderEnum(itemEnum):renderInlineType(item)))+(itemSub?'':' <span class="tag-chip tag-req">数组元素</span>')+'</div></div>';
    if(itemSub){ html+=renderSchema(itemSub, indent+1, SCM); }
    html+='</div>';
    return html;
  }
  if(s.type==='object' && s.properties){
    var keys=Object.keys(s.properties); if(!keys.length) return '<code class="itype">object</code>';
    var html='<div class="schema">';
    keys.forEach(function(k){
      var p=s.properties[k];
      var sch=p.schema||{};
      var req=p.required?'<span class="tag-chip tag-req">必填</span>':'<span class="tag-chip tag-opt">可选</span>';
      var schEnum=(sch.ref&&SCM[sch.ref]&&SCM[sch.ref].enum)?SCM[sch.ref]:null;
      var needSub=false;
      if(sch.ref&&SCM[sch.ref]&&SCM[sch.ref].properties) needSub=true;
      else if(sch.properties) needSub=true;
      else if(sch.type==='array'&&((sch.items&&sch.items.ref&&SCM[sch.items.ref]&&SCM[sch.items.ref].properties)||(sch.items&&sch.items.properties))) needSub=true;
      var meta=(sch.default!==undefined&&sch.default!==''?'<span class="pmeta">默认值: '+esc(sch.default)+'</span>':'');
      var desc=sch.description?('<div class="pdesc">'+esc(sch.description)+'</div>'):'';
      html+='<div class="prop"><div class="prop-top"><span class="pname">'+esc(k)+'</span>'+(needSub?objectChip(sch,SCM):(schEnum?renderEnum(schEnum):renderInlineType(sch)))+req+(meta?'<span class="pmeta">默认值: '+esc(sch.default)+'</span>':'')+'</div>'+desc+'</div>';
      if(needSub){ html+='<div class="sub">'+renderSchema(sch, indent+1, SCM)+'</div>'; }
    });
    html+='</div>';
    return html;
  }
  return renderInlineType(s);
}

function renderParams(params, title){
  if(!params||!params.length) return '';
  var h='';
  if(title) h+='<h4 class="sec">'+title+'</h4>';
  h+='<div class="tbl-wrap"><table class="tbl"><thead><tr><th>名称</th><th>位置</th><th>必填</th><th>类型</th><th>说明</th></tr></thead><tbody>';
  params.forEach(function(p){
    var type=p.schemaType||p.type||'-';
    h+='<tr><td class="c-name"><code>'+esc(p.name)+'</code></td><td class="c-in"><span class="in-tag">'+esc(p.in)+'</span></td><td>'+(p.required?'<span class="req">必填</span>':'<span class="opt">可选</span>')+'</td><td><code class="itype">'+esc(type)+'</code></td><td class="c-desc">'+esc(p.description)+'</td></tr>';
  });
  h+='</tbody></table></div>';
  return h;
}

// 从类型字符串中解析出可能在 SCM 中命中的模型名（含带泛型/反引号的 C# 完整 $ref 名）
function modelNames(s, SCM){
  var out=[]; var added={};
  function add(n){ n=String(n==null?'':n).trim(); if(n && SCM[n] && !added[n]){ added[n]=1; out.push(n);} }
  var str=String(s==null?'':s).trim();
  add(str);                                 // 完整名称直接命中（C# 泛型 definitions 键即为完整名）
  add(str.replace(/^array\\s+of\\s+/i,'').replace(/\\[\\]$/,'')); // 数组/前缀
  return out;
}
// 类型列的统一样式：显示纯模型名 + 可选的 []，与请求参数列保持一致。
// 去掉 C# 泛型的类型参数（如 ServiceResultDto-T1-[[...]] -> ServiceResultDto），any -> object
function typeName(s){
  var str=String(s==null?'':s).trim().replace(/^array\\s+of\\s+/i,'');
  if(!str||str==='any') return '<code class="itype">object</code>';
  var arr=str.slice(-2)==='[]'?'[]':'';
  var base=str.replace(/\\[\\]$/,'');
  var idx=base.search(/(?:\\x60\\d+|\\[\\[)/);
  if(idx>=0) base=base.slice(0,idx);
  return '<code class="itype">'+esc(base)+arr+'</code>';
}
function renderRefFields(name, SCM){
  var sch=SCM[name];
  if(!sch) return '';
  var json=hlJson(JSON.stringify(sampleValue(sch,SCM,0), null, 2));
  var html='<div class="resptitle">'+displayName(name)+'</div>';
  html+='<div class="vtabs"><span class="vtab on" data-v="t">结构树</span><span class="vtab" data-v="j">JSON示例</span><button class="copy-json">复制JSON</button></div>';
  html+='<div class="vpanes"><div class="vpanet respbody">'+renderSchema(sch,0,SCM)+'</div><div class="vpanet jsonbody"><pre class="jsonpre">'+json+'</pre></div></div>';
  return html;
}

function renderResponses(resp, SCM){
  if(!resp||!resp.length) return '';
  var h='<h4 class="sec">响应</h4>';
  h+='<div class="tbl-wrap"><table class="tbl"><thead><tr><th>状态码</th><th>说明</th><th>响应类型</th></tr></thead><tbody>';
  var seen={};
  resp.forEach(function(r){
    h+='<tr><td><span class="code">'+esc(r.status)+'</span></td><td class="c-desc">'+esc(r.description)+'</td><td>'+(r.schema?typeName(r.schema):'-')+'</td></tr>';
    modelNames(r.schema||'',SCM).forEach(function(n){ if(SCM[n]) seen[n]=true; });
  });
  h+='</tbody></table></div>';
  var first=true;
  Object.keys(seen).forEach(function(name){
    if(first){ h+='<div class="sec">响应体结构</div>'; first=false; }
    h+='<div class="respbox">'+renderRefFields(name,SCM)+'</div>';
  });
  return h;
}

// 复制文本到剪贴板：优先 Clipboard API，沙箱环境失败时回退 execCommand；btn 显示短暂"已复制"反馈
function copyText(txt, btn){
  function done(){ if(!btn) return; btn.classList.add('ok'); var old=btn.textContent; btn.textContent='已复制'; setTimeout(function(){ btn.textContent=old; btn.classList.remove('ok'); },1200); }
  function fallback(){ var ta=document.createElement('textarea'); ta.value=txt; ta.style.cssText='position:fixed;top:-999px;opacity:0'; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); done(); }catch(e){} document.body.removeChild(ta); }
  if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(done, fallback); } else { fallback(); }
}
// shell 单引号包裹（内部 ' 转义为 '\''）
function shq(s){ return "'"+String(s).replace(/'/g,"'\\\\''")+"'"; }
// 参数示例值：优先 example/default，否则按类型给占位值
function paramSample(p){
  if(p.example!==undefined&&p.example!==null&&p.example!=='') return String(p.example);
  if(p.default!==undefined&&p.default!==null&&p.default!=='') return String(p.default);
  var t=String(p.type||'').toLowerCase();
  if(t.indexOf('int')>=0||t.indexOf('number')>=0||t.indexOf('float')>=0||t.indexOf('double')>=0) return '0';
  if(t==='boolean'||t==='bool') return 'true';
  return 'string';
}
// 生成 cURL 示例：拼接 query 参数，请求体取首个引用模型的 JSON 示例
function buildCurl(op, serverUrl, SCM){
  var base=String(serverUrl||'').replace(/\\/$/,'');
  var url=base+op.path;
  var qs=[];
  (op.parameters||[]).forEach(function(p){ if(p.in==='query') qs.push(p.name+'='+encodeURIComponent(paramSample(p))); });
  if(qs.length) url+=(url.indexOf('?')>=0?'&':'?')+qs.join('&');
  var parts=['curl'];
  var m=op.method.toUpperCase();
  if(m!=='GET') parts.push('-X '+m);
  parts.push(shq(url));
  if(op.requestBody){
    var names=modelNames(op.requestBody.schemaType||op.requestBody.type||'',SCM);
    var body=null;
    if(names.length&&SCM[names[0]]) body=JSON.stringify(sampleValue(SCM[names[0]],SCM,0));
    if(body!==null){
      parts.push("-H 'Content-Type: application/json'");
      parts.push('-d '+shq(body));
    }
  }
  return parts.join(' ');
}
function renderOperation(op, basePath, serverUrl, SCM){
  var fullPath=(basePath||'')+op.path;
  var h='<div class="op card" id="'+op.id+'">';
  h+='<div class="op-head">';
  if(window.O2D_SELECT){ h+='<label class="op-chk" title="勾选此接口用于单独导出"><input type="checkbox" class="op-checkbox" data-id="'+op.id+'" /></label>'; }
  h+=methodBadge(op.method)+' <code class="path">'+esc(fullPath)+'</code><span class="osum">'+esc(op.summary)+'</span>'+(op.deprecated?'<span class="dep">已废弃</span>':'')+authOpHtml(op)+'<button class="copy-path" data-c="'+esc(fullPath)+'" title="复制完整路径">复制路径</button></div>';
  h+='<div class="op-body">';
  if(op.description) h+='<p class="odesc">'+esc(op.description)+'</p>';
  h+=renderParams(op.parameters,'请求参数');
  h+=renderParams(op.requestBody?[op.requestBody]:[],'请求体');
  if(op.requestBody){
    var rbNames=modelNames(op.requestBody.schemaType||op.requestBody.type||'',SCM);
    if(rbNames.length){ h+='<div class="sec">请求体结构</div>'; }
    rbNames.forEach(function(rn){ h+='<div class="respbox">'+renderRefFields(rn,SCM)+'</div>'; });
  }
  var curl=buildCurl(op, serverUrl, SCM);
  h+='<h4 class="sec">cURL<button class="copy-curl" data-c="'+esc(curl)+'">复制</button></h4>';
  h+='<pre class="jsonpre curlpre">'+esc(curl)+'</pre>';
  h+=renderResponses(op.responses,SCM);
  h+='</div></div>';
  return h;
}

function init(){
  var doc=DOC;
  var basePath=doc.basePath||'';
  var main=document.getElementById('main');
  var SCM={};
  doc.schemas.forEach(function(s){ SCM[s.name]=s.schema; });
  var opsByTag={};
  var order=[];
  doc.operations.forEach(function(op){
    var tag=(op.tags&&op.tags[0])||'其他';
    if(!opsByTag[tag]){ opsByTag[tag]=[]; order.push(tag); }
    opsByTag[tag].push(op);
  });
  doc.tags.forEach(function(t){ if(!opsByTag[t.name]){ opsByTag[t.name]=[]; order.push(t.name); } });
  if(!opsByTag['其他']){ opsByTag['其他']=[]; if(order.indexOf('其他')<0) order.push('其他'); }

  var h='<div class="doc">';
  h+='<div class="hero"><h1>'+esc(doc.title||'接口文档')+'</h1>';
  h+='<div class="meta">';
  if(doc.version) h+='<span class="badge">v'+esc(doc.version)+'</span>';
  if(doc.operations) h+='<span class="badge ghost">'+doc.operations.length+' 个接口</span>';
  h+='</div>';
  if(doc.serverUrl) h+='<div class="server"><span class="lbl">服务地址</span><code>'+esc(doc.serverUrl)+'</code></div>';
  if(doc.securitySchemes&&doc.securitySchemes.length){
    h+='<div class="authrow"><span class="lbl">认证方式</span>';
    for(var ai=0;ai<doc.securitySchemes.length;ai++){ h+=authChipHtml(doc.securitySchemes[ai]); }
    h+='</div>';
  }
  if(doc.description) h+='<p class="gdesc">'+esc(doc.description)+'</p>';
  h+='</div>';

  order.forEach(function(tag){
    if(!opsByTag[tag]||!opsByTag[tag].length) return;
    h+='<h2 class="tag" id="grp-'+esc(tag)+'">'+esc(tag)+'<span class="tag-count">'+opsByTag[tag].length+'</span></h2>';
    opsByTag[tag].forEach(function(op){ h+=renderOperation(op, basePath, doc.serverUrl||'', SCM); });
  });
  h+='</div>';
  main.innerHTML=h;

  var toc=document.getElementById('toc');
  var th='';
  order.forEach(function(tag){
    if(!opsByTag[tag]||!opsByTag[tag].length) return;
    th+='<div class="toc-group">';
    th+='<a href="#grp-'+esc(tag)+'" class="toc-tag"><span class="chev">▾</span><span class="tt">'+esc(tag)+'</span><span class="cnt">'+opsByTag[tag].length+'</span></a>';
    opsByTag[tag].forEach(function(op){
      var fp=(basePath||'')+op.path;
      var s=((op.summary||'')+' '+fp+' '+op.method).toLowerCase();
      th+='<a href="#'+op.id+'" class="toc-op" data-m="'+op.method.toUpperCase()+'" data-s="'+esc(s)+'" title="'+esc(op.summary||fp)+'"><span class="m-dot" style="background:'+mColor(op.method)+'"></span><span class="t-path">'+esc(fp)+'</span></a>';
    });
    th+='</div>';
  });
  toc.innerHTML=th;
  document.title=doc.title||'接口文档';

  // 主题切换：优先采用外层传入的主题，其次 localStorage，最后跟随系统偏好
  var root=document.documentElement, ttBtn=document.getElementById('themeToggle');
  var savedTheme=null; try{ savedTheme=localStorage.getItem('o2d-theme'); }catch(e){}
  var injected=(window.O2D_THEME==='dark'||window.O2D_THEME==='light')?window.O2D_THEME:null;
  var darkTheme=injected ? injected==='dark' : (savedTheme ? savedTheme==='dark' : !!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches));
  function applyTheme(){ root.setAttribute('data-theme', darkTheme?'dark':'light'); if(ttBtn) ttBtn.textContent=darkTheme?'亮色':'暗色'; }
  function persistTheme(){ try{ localStorage.setItem('o2d-theme', darkTheme?'dark':'light'); }catch(e){} }
  applyTheme();
  if(ttBtn) ttBtn.addEventListener('click', function(){
    darkTheme=!darkTheme; applyTheme(); persistTheme();
    // 被嵌在管理界面时，把切换同步回外层，保证内外一致
    try{ if(window.parent!==window) window.parent.postMessage({type:'o2d-theme', value: darkTheme?'dark':'light'}, '*'); }catch(e){}
  });
  // 外层主题变化时同步（不重新加载文档，保留勾选与滚动位置）
  window.addEventListener('message', function(e){
    var d=e.data;
    if(d && d.type==='o2d-theme'){ darkTheme = d.value==='dark'; applyTheme(); }
  });

  // 目录搜索：按路径/摘要/方法过滤，隐藏无匹配的分组
  var search=document.getElementById('tocSearch');
  if(search){
    search.addEventListener('input', function(){
      var q=search.value.trim().toLowerCase();
      var groups=toc.querySelectorAll('.toc-group');
      for(var g=0; g<groups.length; g++){
        var grp=groups[g];
        if(q) grp.classList.remove('closed'); // 搜索时展开分组以便显示匹配项
        var ops=grp.querySelectorAll('.toc-op'), visible=0;
        for(var i=0;i<ops.length;i++){
          var hit=!q||(ops[i].getAttribute('data-s')||'').indexOf(q)>=0;
          ops[i].classList.toggle('hide', !hit);
          if(hit) visible++;
        }
        grp.classList.toggle('hide', !!q && visible===0);
      }
    });
  }

  // scrollspy：滚动时高亮当前接口对应的目录项并保持在目录内可见
  var opEls=[].slice.call(main.querySelectorAll('.op[id]'));
  var curToc=null, navEl=document.querySelector('nav');
  function spy(){
    var cur=null;
    if(document.body.classList.contains('focus-on') && focusOp){
      cur=document.getElementById(focusOp); // 专注模式：只认当前选中的接口
    } else {
      var y=window.scrollY+140;
      for(var i=0;i<opEls.length;i++){ if(opEls[i].offsetTop<=y) cur=opEls[i]; else break; }
    }
    var el=cur?toc.querySelector('.toc-op[href="#'+cur.id+'"]'):null;
    if(el===curToc) return;
    if(curToc) curToc.classList.remove('cur');
    curToc=el;
    if(el){
      el.classList.add('cur');
      var grp=el.parentNode;
      if(grp.classList.contains('closed')) grp.classList.remove('closed');
      // 仅当目录项不在可视区内时滚动目录（不影响主页面滚动）
      if(navEl && (el.offsetTop<navEl.scrollTop+60 || el.offsetTop>navEl.scrollTop+navEl.clientHeight-60)){
        navEl.scrollTop=el.offsetTop-navEl.clientHeight/2;
      }
    }
  }
  // 返回顶部按钮显隐
  var backTop=document.getElementById('backTop');
  function bt(){ if(backTop) backTop.classList.toggle('show', window.scrollY>500); }
  var ticking=false;
  window.addEventListener('scroll', function(){
    if(ticking) return; ticking=true;
    requestAnimationFrame(function(){ spy(); bt(); ticking=false; });
  });
  spy(); bt();

  // 专注模式：切到专注后，点左侧接口只展示当前一条；点分组或切回整篇则显示全部
  var focusOp=null, mainEl=main, focusBtn=document.getElementById('focusMode');
  function showAll(){ var all=mainEl.querySelectorAll('.op[id]'); for(var i=0;i<all.length;i++) all[i].classList.remove('hd'); }
  function collapseTo(el){ focusOp=el?el.id:null; var all=mainEl.querySelectorAll('.op[id]'); for(var i=0;i<all.length;i++) if(all[i].id!==focusOp) all[i].classList.add('hd'); if(el) el.classList.remove('hd'); }
  function updateFocusBtn(){ var on=document.body.classList.contains('focus-on'); if(focusBtn){ focusBtn.textContent=on?'整篇':'专注'; focusBtn.classList.toggle('on', on); } }
  function focusNav(href){
    if(!href||href.charAt(0)!=='#') return;
    if(href.indexOf('grp-')===1){ document.body.classList.remove('focus-on'); focusOp=null; showAll(); updateFocusBtn(); return; } // 点分组退出专注
    if(document.body.classList.contains('focus-on')){ var tgt=document.getElementById(href.slice(1)); if(tgt&&tgt.classList&&tgt.classList.contains('op')) collapseTo(tgt); }
  }
  if(focusBtn) focusBtn.addEventListener('click', function(){
    if(document.body.classList.toggle('focus-on')){
      var hr=curToc?curToc.getAttribute('href'):''; var el=hr?document.getElementById(hr.slice(1)):null;
      collapseTo(el||mainEl.querySelector('.op[id]'));
    } else { showAll(); }
    updateFocusBtn();
  });

  // 委托监听：.copy-path/.copy-curl 复制、.resptitle 折叠响应体、.vtab 切换结构树/JSON、
  // TOC 锚点平滑滚动、.op-head 折叠接口卡片、.chev 折叠目录分组、#backTop 返回顶部
  document.addEventListener('click', function(e){
    var t=e.target;
    while(t && t!==document){
      if(t.classList && (t.classList.contains('copy-path')||t.classList.contains('copy-curl'))){ e.preventDefault(); e.stopPropagation(); copyText(t.getAttribute('data-c')||'', t); return; }
      // 复制 JSON 示例：取所在 respbox 的 jsonbody 纯文本，并自动切到 JSON 视图
      if(t.classList && t.classList.contains('copy-json')){
        e.preventDefault(); e.stopPropagation();
        var panes=t.parentNode? t.parentNode.nextElementSibling : null;
        var pre=panes? panes.querySelector('.jsonbody pre') : null;
        if(pre&&panes){
          copyText(pre.textContent||'', t);
          panes.classList.add('showj');
          var tb2=t.parentNode.querySelectorAll('.vtab');
          for(var q=0;q<tb2.length;q++){ tb2[q].classList.toggle('on', tb2[q].getAttribute('data-v')==='j'); }
        }
        return;
      }
      if(t.id==='backTop'){ e.preventDefault(); window.scrollTo({top:0,behavior:'smooth'}); return; }
      if(t.classList && (t.classList.contains('op-checkbox')||t.classList.contains('op-chk'))){ e.stopPropagation(); return; } // 勾选框不触发折叠，且不阻止默认的选中切换
      if(t.classList && t.classList.contains('chev')){ e.preventDefault(); e.stopPropagation(); var grp=t.parentNode.parentNode; if(grp.classList&&grp.classList.contains('toc-group')) grp.classList.toggle('closed'); return; }
      if(t.classList && t.classList.contains('op-head')){ t.parentNode.classList.toggle('collapsed'); return; }
      if(t.classList && t.classList.contains('resptitle')){ e.preventDefault(); t.parentNode.classList.toggle('collapsed'); return; }
      if(t.classList && t.classList.contains('vtab')){ e.preventDefault(); var vp=t.parentNode.nextElementSibling; var showJ=t.getAttribute('data-v')==='j'; if(vp){ vp.classList.toggle('showj', showJ); var tabs=t.parentNode.querySelectorAll('.vtab'); for(var b=0;b<tabs.length;b++){ tabs[b].classList.toggle('on', (tabs[b].getAttribute('data-v')==='j')===showJ); } } return; }
      if(t.tagName==='A'){ var h=t.getAttribute('href'); if(h && h.charAt(0)==='#'){ var el=document.getElementById(h.slice(1)); if(el){ e.preventDefault(); focusNav(h); el.scrollIntoView({behavior:'smooth',block:'start'}); } } return; }
      t=t.parentNode;
    }
  });
  // 勾选框状态变化 → 通知父页面（用于单独导出所选接口）
  document.addEventListener('change', function(e){
    var t=e.target;
    if(t && t.classList && t.classList.contains('op-checkbox')){
      var id=t.getAttribute('data-id');
      if(window.parent) window.parent.postMessage({type:'o2d-select', id:id, checked:!!t.checked}, '*');
    }
  });
}
function mColor(m){var cm={GET:'#2563eb',POST:'#059669',PUT:'#d97706',DELETE:'#dc2626',PATCH:'#7c3aed',OPTIONS:'#0ea5e9',HEAD:'#9333ea',TRACE:'#64748b'};return cm[m.toUpperCase()]||'#64748b';}
window.addEventListener('DOMContentLoaded', init);
`

function injectDocScript(doc: ApiDocument, selection?: boolean, theme?: ThemeMode, embed?: boolean): string {
  const json = JSON.stringify({
    title: doc.title,
    version: doc.version,
    description: doc.description,
    serverUrl: doc.serverUrl,
    basePath: doc.basePath,
    tags: doc.tags,
    operations: doc.operations,
    schemas: doc.schemas,
    securitySchemes: doc.securitySchemes,
    security: doc.security,
  }).replace(/</g, '\\u003c')
  const themeLiteral = theme === 'dark' || theme === 'light' ? JSON.stringify(theme) : 'null'
  return `window.DOC=${json};\nwindow.O2D_SELECT=${selection ? true : false};\nwindow.O2D_THEME=${themeLiteral};\nwindow.O2D_EMBED=${embed ? true : false};`
}

const CSS = `
:root{
  --side-bg:#0f1729; --side-fg:#94a3b8; --side-hover:#e2e8f0;
  --accent:#4f46e5;
  --bg:#f8fafc; --fg:#0f172a; --fg2:#475569; --muted:#94a3b8;
  --line:#e5e7eb; --code-bg:#f1f5f9;
  --card:#fff; --head-bg:#fbfcfe; --head-line:#eef0f3;
  --th-bg:#f8fafc; --td-line:#f1f5f9;
  --chip-bg:#eef2ff; --chip-line:#e0e7ff; --chip-fg:#4f46e5; --chip-fg2:#4338ca;
  --pname:#1d4ed8; --tbl-code-fg:#334155;
  --prop-bg:linear-gradient(90deg,#fafbff,transparent 70%); --prop-hover:#f1f5f9;
  --opt-bg:#f1f5f9; --opt-line:#e2e8f0; --opt-fg:#64748b;
  --req-bg:#fef2f2; --req-line:#fecaca; --req-fg:#dc2626;
  --panel:#fcfcfd;
}
[data-theme=dark]{
  color-scheme:dark;
  --bg:#0b1220; --fg:#e2e8f0; --fg2:#94a3b8; --muted:#64748b;
  --line:#1e293b; --code-bg:#1a2334;
  --card:#111a2b; --head-bg:#0e1626; --head-line:#1b2740;
  --th-bg:#0e1626; --td-line:#182338;
  --chip-bg:rgba(99,102,241,.14); --chip-line:rgba(99,102,241,.35); --chip-fg:#a5b4fc; --chip-fg2:#c7d2fe;
  --pname:#93b4fd; --tbl-code-fg:#cbd5e1;
  --prop-bg:linear-gradient(90deg,#131d31,transparent 70%); --prop-hover:#182440;
  --opt-bg:#182440; --opt-line:#2a3a5c; --opt-fg:#94a3b8;
  --req-bg:rgba(220,38,38,.14); --req-line:rgba(220,38,38,.4); --req-fg:#f87171;
  --panel:#0e1626;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased}
.wrap{display:flex;min-height:100vh}

/* ===== 左侧目录 ===== */
nav{width:280px;flex:0 0 280px;background:var(--side-bg);color:var(--side-fg);position:sticky;top:0;height:100vh;overflow-y:auto;padding:20px 10px}
nav::-webkit-scrollbar{width:6px}
nav::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}
.nav-top{display:flex;align-items:center;gap:8px;padding:0 4px 16px;border-bottom:1px solid #1e293b;margin-bottom:8px}
.brand{flex:1;min-width:0;color:#f8fafc;font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#themeToggle,#focusMode{flex:0 0 auto;background:#1e293b;border:1px solid #334155;color:#94a3b8;border-radius:8px;font-size:11px;padding:4px 10px;cursor:pointer;transition:all .15s}
#focusMode.on{background:var(--accent);border-color:var(--accent);color:#fff}
#themeToggle:hover,#focusMode:hover{color:#e2e8f0;border-color:var(--accent)}
.toc-search{padding:8px 6px 10px}
.toc-search input{width:100%;background:#1e293b;border:1px solid #334155;color:#e2e8f0;border-radius:8px;padding:7px 10px;font-size:12.5px;outline:none;transition:border-color .15s}
.toc-search input::placeholder{color:#64748b}
.toc-search input:focus{border-color:var(--accent)}
.toc-group .chev{flex:0 0 auto;color:#64748b;font-size:10px;transition:transform .15s}
.toc-group.closed .chev{transform:rotate(-90deg)}
.toc-group.closed .toc-op{display:none}
.toc-group.closed .tt{color:#94a3b8}
.toc-op.hide,.toc-group.hide{display:none}
.toc-tag{display:flex;align-items:center;gap:7px;color:#e2e8f0;text-decoration:none;font-size:13px;font-weight:600;padding:10px 10px 6px;letter-spacing:.2px;cursor:pointer}
.toc-tag .tt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.toc-tag .cnt{flex:0 0 auto;font-size:10.5px;font-weight:600;color:#94a3b8;background:#1e293b;border-radius:999px;padding:1px 7px}
.toc-op{display:flex;align-items:center;gap:8px;color:#94a3b8;text-decoration:none;font-size:12.5px;padding:5px 10px;border-radius:6px;margin:1px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:2px solid transparent}
.toc-op:hover{color:var(--side-hover);background:#1e293b}
.toc-op.cur{color:#f8fafc;background:#1e293b;border-left-color:var(--accent)}
.m-dot{flex:0 0 8px;width:8px;height:8px;border-radius:2px}
.t-path{overflow:hidden;text-overflow:ellipsis;font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace}

/* ===== 右侧内容 ===== */
main{flex:1;padding:40px 36px;min-width:0;max-width:1280px;margin:0 auto;width:100%}
.doc{animation:fade .3s ease}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1}}

.hero{padding:12px 4px 28px;border-bottom:1px solid var(--line);margin-bottom:24px}
.hero h1{margin:0 0 14px;font-size:30px;font-weight:700;letter-spacing:.3px}
.meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.badge{background:var(--accent);color:#fff;font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px}
.badge.ghost{background:var(--chip-bg);color:var(--chip-fg)}
.server{margin-top:16px;color:var(--fg2);font-size:13px}
.server .lbl{font-size:12px;color:var(--muted);margin-right:8px}
.server code{background:var(--code-bg);padding:3px 8px;border-radius:6px;font-size:12.5px;color:var(--fg)}
.authrow{margin-top:12px;color:var(--fg2);font-size:13px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.authrow .lbl{font-size:12px;color:var(--muted);margin-right:2px}
.auth-chip{display:inline-flex;align-items:center;gap:6px;background:var(--chip-bg);border:1px solid var(--chip-line);color:var(--chip-fg2);border-radius:999px;padding:2px 10px;font-size:12px;font-weight:600;line-height:1.7}
.auth-chip .auth-detail{font-weight:500;font-size:11px;color:var(--chip-fg);opacity:.85}
.auth-mini{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;background:var(--chip-bg);border:1px solid var(--chip-line);color:var(--chip-fg2);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:600;line-height:1.7;max-width:220px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.auth-mini.none{background:var(--opt-bg);border-color:var(--opt-line);color:var(--opt-fg)}
.auth-more{font-weight:700;opacity:.75}
.auth-lock{font-size:11px}
.gdesc{color:var(--fg2);font-size:14px;line-height:1.7;margin:14px 0 0;max-width:720px}

.tag{font-size:20px;font-weight:700;margin:36px 0 14px;padding-bottom:8px;border-bottom:2px solid var(--line);display:flex;align-items:center;gap:10px;scroll-margin-top:12px}
.tag-count{font-size:12px;font-weight:600;color:var(--muted);background:var(--code-bg);padding:2px 9px;border-radius:999px}

.card{background:var(--card);border:1px solid var(--line);border-radius:14px;margin:14px 0;overflow:hidden;transition:box-shadow .2s,border-color .2s}
.card:hover{box-shadow:0 8px 24px rgba(15,23,42,.06);border-color:#d4d6da}
[data-theme=dark] .card:hover{box-shadow:0 8px 24px rgba(0,0,0,.45);border-color:#2a3a5c}
.op.hd{display:none}
.op-head{display:flex;align-items:center;gap:12px;padding:14px 18px;background:var(--head-bg);border-bottom:1px solid var(--head-line);flex-wrap:nowrap;cursor:pointer;user-select:none}
.op-head::after{content:"▾";flex:0 0 auto;margin-left:4px;font-size:12px;color:var(--muted);transition:transform .15s}
.op.collapsed .op-head::after{transform:rotate(-90deg)}
.op.collapsed .op-head{border-bottom-color:transparent}
.op.collapsed .op-body{display:none}
.op.collapsed:hover{box-shadow:none}
.method{flex:0 0 auto;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;letter-spacing:.6px;min-width:58px;text-align:center;color:#fff}
.path{font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;font-size:14.5px;font-weight:600;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.osum{font-weight:500;color:var(--fg2);font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;text-align:right}
.dep{background:var(--req-bg);color:var(--req-fg);border:1px solid var(--req-line);border-radius:6px;padding:1px 8px;font-size:11px;font-weight:600;flex:0 0 auto}
.copy-path{flex:0 0 auto;margin-left:4px;background:transparent;border:1px solid var(--opt-line);color:var(--opt-fg);border-radius:6px;font-size:11px;padding:2px 9px;cursor:pointer;transition:all .15s}
.copy-path:hover{color:var(--chip-fg);border-color:var(--chip-line);background:var(--chip-bg)}
.op-chk{flex:0 0 auto;display:inline-flex;align-items:center;cursor:pointer;line-height:1}
.op-checkbox{width:16px;height:16px;accent-color:var(--accent);cursor:pointer;margin:0}
.op-body{padding:18px}
.op-body .sec{margin:0 0 12px;font-size:14px;font-weight:600;color:var(--fg);display:flex;align-items:center;gap:8px}
.op-body .sec::before{content:"";width:4px;height:14px;background:var(--accent);border-radius:2px}
.odesc{color:var(--fg2);font-size:13.5px;line-height:1.7;margin:0 0 16px}

/* 复制 cURL */
.copy-curl{margin-left:auto;background:var(--opt-bg);border:1px solid var(--opt-line);color:var(--opt-fg);border-radius:6px;font-size:11px;font-weight:600;padding:2px 10px;cursor:pointer;transition:all .15s}
.copy-path.ok,.copy-curl.ok{color:#fff;background:#059669;border-color:#059669}
.curlpre{max-height:200px;margin:0 0 16px}

/* 表格 */
.tbl-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;margin-bottom:16px}
.tbl{border-collapse:collapse;width:100%;font-size:13px}
.tbl th{background:var(--th-bg);text-align:left;padding:9px 14px;font-weight:600;color:var(--fg2);white-space:nowrap;border-bottom:1px solid var(--line);font-size:12px}
.tbl td{padding:9px 14px;border-bottom:1px solid var(--td-line);vertical-align:top;white-space:nowrap}
.tbl tr:last-child td{border-bottom:none}
.tbl td.c-desc{white-space:normal}
.tbl code{font-family:"SFMono-Regular",Consolas,monospace;background:var(--code-bg);padding:2px 7px;border-radius:5px;font-size:12px;color:var(--tbl-code-fg)}
.tbl .itype{color:var(--chip-fg2)}
.in-tag{display:inline-block;background:var(--chip-bg);color:var(--chip-fg);font-size:11px;border-radius:5px;padding:2px 8px;font-weight:600}
.code{background:var(--req-bg);color:var(--req-fg);padding:2px 8px;border-radius:5px;font-weight:700;font-size:12px}

/* 数据结构树 */
.itype{display:inline-block;background:var(--chip-bg);color:var(--chip-fg);border:1px solid var(--chip-line);padding:1px 9px;border-radius:999px;font-size:11px;font-family:"SFMono-Regular",Consolas,monospace;font-weight:600;line-height:1.7}
.schema{font-size:13px;display:flex;flex-direction:column;gap:2px}
.prop{position:relative;padding:9px 12px;border-radius:10px;border-left:2px solid var(--chip-line);margin:4px 0 4px 14px;background:var(--prop-bg)}
.prop:hover{background:var(--prop-hover);border-left-color:var(--accent)}
.prop-top{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.pname{font-weight:700;color:var(--pname);font-family:"SFMono-Regular",Consolas,monospace;font-size:12.5px;min-width:130px}
.arr-tag{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:22px;border-radius:6px;background:var(--chip-bg);color:var(--chip-fg);font-family:"SFMono-Regular",Consolas,monospace;font-weight:700;font-size:11px}
.sub{margin-left:16px;padding-left:6px;border-left:2px dashed var(--chip-line);margin-top:2px}
.tag-chip{display:inline-block;font-size:11px;font-weight:600;border-radius:999px;padding:1px 9px}
.tag-req{background:var(--req-bg);color:var(--req-fg);border:1px solid var(--req-line)}
.tag-opt{background:var(--opt-bg);color:var(--opt-fg);border:1px solid var(--opt-line)}
.obj-badge{display:inline-flex;align-items:center;gap:6px;background:var(--chip-bg);border:1px solid var(--chip-line);border-radius:8px;padding:1px 9px;line-height:1.8}
.obj-name{font-family:"SFMono-Regular",Consolas,monospace;font-size:12px;font-weight:600;color:var(--chip-fg2)}
.obj-count{font-size:10.5px;font-weight:600;color:var(--chip-fg);background:var(--card);border:1px solid var(--chip-line);border-radius:999px;padding:0 7px}
.enum-wrap{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px}
.enum-lbl{font-size:11px;font-weight:700;color:var(--opt-fg);letter-spacing:.5px;margin-right:2px}
.enumVal{display:inline-flex;align-items:center;gap:6px;background:var(--c);color:#fff;border-radius:999px;padding:2px 12px;font-size:12px;font-family:"SFMono-Regular",Consolas,monospace;font-weight:700;box-shadow:0 2px 6px rgba(15,23,42,.14),inset 0 1px 0 rgba(255,255,255,.25);line-height:1.7}
.enumVal::before{content:"";width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.85);flex:0 0 auto}
.enumVal .enum-label{font-size:10.5px;font-weight:500;opacity:.88;font-family:inherit}
.pdesc{color:var(--fg2);font-size:12.5px;line-height:1.6;margin-top:4px}
.pmeta{display:inline-block;font-size:11px;color:var(--muted);background:var(--card);border:1px solid var(--opt-line);padding:0 7px;border-radius:5px}
.muted{color:var(--muted)}


.respbox{border:1px solid var(--line);border-radius:12px;padding:6px 10px 10px;margin-bottom:16px;background:var(--panel)}
.resptitle{font-weight:600;color:var(--pname);font-family:"SFMono-Regular",Consolas,monospace;font-size:13px;padding:6px 22px 6px 2px;display:flex;align-items:center;gap:8px;cursor:pointer;position:relative;user-select:none}
.resptitle:hover{color:var(--fg)}
.resptitle::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--accent);flex:0 0 auto}
.resptitle::after{content:"▾";position:absolute;right:6px;font-size:11px;color:var(--muted);transition:transform .15s}
.respbox.collapsed .resptitle::after{transform:rotate(-90deg)}
.respbody{transition:opacity .2s}
.respbox.collapsed .respbody,
.respbox.collapsed .vtabs,
.respbox.collapsed .vpanes{display:none}
.copy-json{margin-left:auto;background:var(--opt-bg);border:1px solid var(--opt-line);color:var(--opt-fg);border-radius:6px;font-size:11px;font-weight:600;padding:3px 11px;cursor:pointer;transition:all .15s}
.copy-json:hover{color:var(--chip-fg);border-color:var(--chip-line);background:var(--chip-bg)}
.copy-json.ok{color:#fff;background:#059669;border-color:#059669}
.vtabs{display:flex;align-items:center;gap:6px;margin:2px 0 10px}
.vtab{font-size:11px;font-weight:600;padding:3px 12px;border-radius:999px;background:var(--opt-bg);color:var(--opt-fg);border:1px solid var(--opt-line);cursor:pointer;user-select:none;transition:all .12s}
.vtab:hover{color:var(--pname);border-color:var(--chip-line)}
.vtab.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.vpanes{position:relative}
.vpanet.jsonbody{display:none}
.vpanes.showj .respbody{display:none}
.vpanes.showj .jsonbody{display:block}
.jsonpre{background:#0f172a;color:#e2e8f0;border:1px solid var(--line);border-radius:8px;padding:12px 14px;overflow:auto;font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.55;white-space:pre;max-height:480px}
.jk{color:#7dd3fc;font-weight:600}
.jstr{color:#86efac}
.jnum{color:#fcd34d}
.jbool{color:#f9a8d4}

/* 返回顶部 */
#backTop{position:fixed;right:26px;bottom:30px;width:40px;height:40px;border-radius:10px;border:1px solid var(--chip-line);background:var(--card);color:var(--chip-fg);font-size:16px;line-height:1;cursor:pointer;box-shadow:0 6px 18px rgba(15,23,42,.14);opacity:0;pointer-events:none;transform:translateY(8px);transition:opacity .2s,transform .2s,background .15s,color .15s;z-index:50}
#backTop.show{opacity:1;pointer-events:auto;transform:none}
#backTop:hover{background:var(--accent);color:#fff}
@media (max-width:720px){
  .wrap{display:block}
  nav{position:static;width:100%;flex:none;height:auto;max-height:280px}
  main{padding:24px 14px}
  .op-head{flex-wrap:wrap}
  .osum{text-align:left;flex:1 0 100%}
}
`

export function generateHtml(doc: ApiDocument, opts?: HtmlOptions): string {
  const script = injectDocScript(doc, opts?.selection, opts?.theme, opts?.embed)
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(doc.title || '接口文档')}</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <nav>
    <div class="nav-top">
      <div class="brand">${esc(doc.title)}</div>
      <button id="focusMode" title="专注查看单个接口（点接口只展示这一条）">专注</button>
      <button id="themeToggle" title="切换深浅主题">暗色</button>
    </div>
    <div class="toc-search"><input id="tocSearch" type="text" placeholder="搜索接口路径 / 名称…" autocomplete="off" /></div>
    <div id="toc"></div>
  </nav>
  <main id="main"></main>
</div>
<button id="backTop" title="返回顶部">↑</button>
<script>
${script}
</script>
<script>
${RENDER_FN}
</script>
</body>
</html>`
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function buildHtmlFile(doc: ApiDocument, opts?: HtmlOptions): Blob {
  const html = generateHtml(doc, opts)
  return new Blob([html], { type: 'text/html;charset=utf-8' })
}