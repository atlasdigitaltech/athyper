/*
 * Decorative global-network background for the Mesh story panel.
 * Approximate real coastlines and city coordinates only -- no account,
 * tenant, or transaction data belongs here (see _iam-header.ftl).
 */
(function () {
  "use strict";

  var LAND = [
    [-168,65.5,-165,60.5,-162,58,-156,57.5,-152,59,-148,60.5,-140,59.5,-135,57,-131,53,-127,50,
     -124,46,-122,37,-118,33.5,-115,31,-113,28,-111,25.5,-109,23.5,-106,22,-101,18.5,-96,16,
     -92,15,-89,13.5,-84,10,-79,9,-77,8,-80,9.5,-83,11,-86,14,-88,16,-91,18.5,-95,18.5,
     -97,21,-97,25.5,-94,29.5,-90,29,-86,30.5,-83,29.5,-81,25.5,-80.5,28,-81,31.5,-78,33.5,
     -76,35.5,-75,38.5,-71,41.5,-67,44.5,-64,45.5,-60,46.5,-56,50.5,-60,54,-64,56,-63,58.5,
     -66,61,-70,62.5,-78,62.5,-80,66,-85,70,-95,70,-105,68.5,-115,70,-125,70,-133,69,
     -141,70,-156,71,-164,68],
    [-45,60,-50,63.5,-54,67,-58,71,-66,76,-70,79,-62,82.5,-45,83,-25,82,-20,77,-22,72,-30,68.5,-38,65,-43,60],
    [-77,8,-72,11.5,-66,10.5,-60,8.5,-52,5,-50,0.5,-44,-2,-38,-5,-35,-8,-37,-12,-39,-18,-43,-23,
     -48,-25.5,-53,-33,-58,-35,-62,-39,-63,-42,-66,-45,-69,-50,-71,-54.5,-74,-53,-75,-48,-74,-42,
     -73,-37,-71,-30,-70,-23,-71,-18,-76,-14,-79,-8,-81,-5,-80.5,-2,-78,1,-77,4],
    [-6,36,-3,35.5,3,37,10,37,15,32.5,20,32,25,32,32,31.5,34,29,35,27,37,22,38.5,17.5,40,15,43,12,
     47,11.5,51,11.8,51,9,48,5,45,3,42,-1,40,-8,41,-13,36,-18,35,-22,33,-26,30,-31,27,-33.5,
     20,-34.8,17,-29,15,-22,12,-17,11,-13,13,-9,12,-6,9,-1,9,3,6,4,3,6.5,-2,5,-8,4.5,-12,7.5,
     -16,12,-17,14.5,-17,21,-14,26,-10,30],
    [43,-12,48,-13,50,-17,50,-24,46,-25.5,44,-21,43,-16],
    [-9,38,-9,43,-1,46,-2,48.5,3,51,8,54,10,57.5,13,55,19,55,22,60,25,65,21,66,25,70,31,70,
     40,66,50,68,60,71,70,72,80,73,90,75,100,76,110,74,120,73,130,72,140,72,150,70,160,69,
     170,68,179,66,179,62,172,60,163,58,160,54,155,50,143,45,140,42,133,42,128,40,122,38,
     120,35,122,30,118,24,110,21,107,12,105,9,100,6,98,12,94,16,90,22,87,21,80,15,77,8,
     73,15,72,20,70,23,65,25,60,25,57,26,56,22,52,18,48,15,43,12.5,41,17,38,22,35,28,34,31,
     36,36,32,36,30,36,27,37,26,40,23,40,23,37,21,38,19,40,19,42,14,45.5,16,42,18,40,16,38,
     12,42,10,44,7,44,4,43,3,42,-1,37,-6,36],
    [-5,50,-6,53,-5,55,-3,58.5,-2,57.5,0,53.5,1,51.5,-4,50],
    [-10.5,51.7,-10,55,-6,55.3,-6,52],
    [-24,65,-22,66.5,-14,66.3,-13.5,64.5,-18,63.4,-22,63.9],
    [130,31.5,135,34,140,35,142,39,145,43.5,142,45,140,39,137,36,133,35,129,33],
    [80,9.8,81.9,7.5,81,6,79.7,8],
    [95,5.5,99,3,104,-2,106,-6,103,-6,99,-1,96,2,94,4.5],
    [105,-6,111,-7,114,-8,114,-8.8,108,-8,105,-7.2],
    [109,2,113,4.5,117,5,119,3,118,-2,114,-3.5,110,-3,109,0],
    [119,1,121,1.5,125,1.5,125,-2,122,-3,121,-5,119,-5,120,-2],
    [131,-1,136,-2.5,141,-3,146,-6,150,-9,146,-9,141,-8,137,-8,133,-4],
    [120,18,122,17,124,13,126,9,126,6,123,6,121,12,119,15],
    [-85,22,-80,23,-75,20.5,-78,20,-84,21.5],
    [-74,19.5,-69,19.5,-68,18.5,-73,18],
    [113,-22,113,-26,115,-34,118,-35,123,-34,129,-32,134,-33,137,-35,140,-38,145,-38.5,
     150,-37.5,153,-32,153,-27,149,-21,146,-19,142,-11,137,-12,132,-11,129,-15,125,-14,122,-18,117,-21],
    [145,-41,148,-41,148,-43.5,145,-43.5],
    [172,-34.5,175,-37,178,-38,176,-41,172,-41,170,-44,167,-46.5,166,-45,170,-42,172,-38]
  ];

  var WATER = [
    [-95,58.5,-88,55.5,-80,55.5,-77,60,-79,64,-86,66.5,-95,64],
    [-92,48,-87,47,-82,45.5,-77,44,-79,43,-85,42,-90,44.5],
    [28,41,34,42,41,41,41,45,37,47,31,46.5,28,43],
    [47,37.5,53,38,53.5,45,51,47,47.5,45,48.5,41]
  ];

  var NODES = [
    {id:"kul", lon:101.7, lat:3.1,  hub:true, main:true},
    {id:"sin", lon:103.8, lat:1.3,  hub:true},
    {id:"tyo", lon:139.7, lat:35.7, hub:true},
    {id:"sha", lon:121.5, lat:31.2},
    {id:"syd", lon:151.2, lat:-33.9},
    {id:"bom", lon:72.9,  lat:19.1},
    {id:"dxb", lon:55.3,  lat:25.2, hub:true},
    {id:"lon", lon:-0.1,  lat:51.5, hub:true},
    {id:"fra", lon:8.7,   lat:50.1},
    {id:"jnb", lon:28.0,  lat:-26.2},
    {id:"nyc", lon:-74.0, lat:40.7, hub:true},
    {id:"tor", lon:-79.4, lat:43.7},
    {id:"sfo", lon:-122.4,lat:37.8, hub:true},
    {id:"gru", lon:-46.6, lat:-23.5}
  ];
  var LINKS = [
    ["kul","sin"],["kul","tyo"],["kul","bom"],["kul","syd"],["kul","dxb"],
    ["sin","sha"],["sin","syd"],["sha","tyo"],
    ["dxb","bom"],["dxb","fra"],["fra","lon"],["lon","nyc"],["lon","jnb"],
    ["nyc","sfo"],["nyc","tor"],["nyc","gru"],["tyo","sfo"]
  ];

  function inRing(lon, lat, r){
    var inside=false, n=r.length/2;
    for(var i=0,j=n-1;i<n;j=i++){
      var xi=r[i*2], yi=r[i*2+1], xj=r[j*2], yj=r[j*2+1];
      if(((yi>lat)!==(yj>lat)) && (lon < (xj-xi)*(lat-yi)/(yj-yi)+xi)) inside=!inside;
    }
    return inside;
  }
  function isLand(lon, lat){
    var k;
    for(k=0;k<WATER.length;k++) if(inRing(lon,lat,WATER[k])) return false;
    for(k=0;k<LAND.length;k++) if(inRing(lon,lat,LAND[k])) return true;
    return false;
  }

  var LAT_TOP=79, LAT_BOT=-57, LAT_SPAN=LAT_TOP-LAT_BOT;

  function mount(cvs){
    var ctx=cvs.getContext("2d");
    var W=0,H=0,dpr=1,mapW=0,mapH=0,offX=0,offY=0,dots=null,paths=[],pts=[];
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function px(lon,lat){
      return [offX + (lon+180)/360*mapW, offY + (LAT_TOP-lat)/LAT_SPAN*mapH];
    }
    function vec(lon,lat){
      var a=lon*Math.PI/180, b=lat*Math.PI/180, c=Math.cos(b);
      return [c*Math.cos(a), c*Math.sin(a), Math.sin(b)];
    }
    function ll(v){
      return [Math.atan2(v[1],v[0])*180/Math.PI, Math.asin(Math.max(-1,Math.min(1,v[2])))*180/Math.PI];
    }
    function arcPoints(a,b){
      var va=vec(a.lon,a.lat), vb=vec(b.lon,b.lat);
      var d=Math.max(-1,Math.min(1,va[0]*vb[0]+va[1]*vb[1]+va[2]*vb[2]));
      var om=Math.acos(d), so=Math.sin(om), steps=64, out=[], prevX=null;
      var p0=px(a.lon,a.lat), p1=px(b.lon,b.lat);
      var span=Math.hypot(p1[0]-p0[0],p1[1]-p0[1]);
      var lift=Math.min(0.30*span, mapH*0.34);
      for(var i=0;i<=steps;i++){
        var t=i/steps, v;
        if(so<1e-6){ v=va; }
        else{
          var s1=Math.sin((1-t)*om)/so, s2=Math.sin(t*om)/so;
          v=[va[0]*s1+vb[0]*s2, va[1]*s1+vb[1]*s2, va[2]*s1+vb[2]*s2];
        }
        var g=ll(v), p=px(g[0],g[1]);
        if(prevX!==null && Math.abs(p[0]-prevX)>mapW*0.5) out.push(null);
        prevX=p[0];
        out.push([p[0], p[1]-Math.sin(Math.PI*t)*lift]);
      }
      return out;
    }
    function buildDots(){
      var step=Math.max(4.6, Math.min(9, mapW/205));
      var cols=Math.round(mapW/step), rows=Math.round(mapH/step);
      var r=Math.max(0.85, step*0.165);
      var oc=document.createElement("canvas");
      oc.width=Math.round(W*dpr); oc.height=Math.round(H*dpr);
      var g=oc.getContext("2d"); g.scale(dpr,dpr);
      for(var y=0;y<=rows;y++){
        var lat=LAT_TOP-(y/rows)*LAT_SPAN;
        for(var x=0;x<=cols;x++){
          var lon=-180+(x/cols)*360;
          if(!isLand(lon,lat)) continue;
          var p=px(lon,lat);
          if(p[0]<-20||p[0]>W+20||p[1]<-20||p[1]>H+20) continue;
          var depth=1-Math.min(1, Math.abs(lat)/95);
          var a=0.20+depth*0.20;
          g.beginPath();
          g.arc(p[0],p[1],r,0,6.2832);
          g.fillStyle="rgba(150,182,226,"+a.toFixed(3)+")";
          g.fill();
        }
      }
      dots=oc;
    }
    function layout(){
      dpr=Math.min(window.devicePixelRatio||1, 2);
      W=cvs.clientWidth; H=cvs.clientHeight;
      if (W === 0 || H === 0) return;
      cvs.width=Math.round(W*dpr); cvs.height=Math.round(H*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);

      mapW=W*1.06;
      mapH=mapW*LAT_SPAN/360;
      offX=(W-mapW)/2;
      offY=H*0.62-mapH/2;
      if(offY+mapH>H-8) offY=H-8-mapH;

      buildDots();
      pts=NODES.map(function(n){ var p=px(n.lon,n.lat); return {n:n,x:p[0],y:p[1]}; });
      var byId={}; NODES.forEach(function(n){ byId[n.id]=n; });
      paths=LINKS.map(function(l,i){
        return {pts:arcPoints(byId[l[0]],byId[l[1]]), phase:(i*0.37)%1, speed:0.06+((i*7)%5)*0.012};
      });
    }
    function strokePath(pl, from, to, style, width){
      ctx.beginPath();
      var started=false;
      for(var i=from;i<=to && i<pl.length;i++){
        var p=pl[i];
        if(!p){ started=false; continue; }
        if(!started){ ctx.moveTo(p[0],p[1]); started=true; }
        else ctx.lineTo(p[0],p[1]);
      }
      ctx.strokeStyle=style; ctx.lineWidth=width; ctx.lineCap="round"; ctx.stroke();
    }
    function frame(ts){
      ctx.clearRect(0,0,W,H);
      if(dots) ctx.drawImage(dots,0,0,W,H);

      var t=(ts||0)/1000;
      ctx.save();
      for(var i=0;i<paths.length;i++){
        var pa=paths[i], pl=pa.pts, n=pl.length;
        strokePath(pl,0,n-1,"rgba(158,192,236,0.17)",0.9);
        if(reduced) continue;
        var prog=((t*pa.speed+pa.phase)%1);
        var head=Math.floor(prog*(n-1));
        var tail=Math.max(0, head-Math.round(n*0.17));
        strokePath(pl,tail,head,"rgba(206,229,255,0.72)",1.25);
        var hp=pl[head];
        if(hp){
          var gr=ctx.createRadialGradient(hp[0],hp[1],0,hp[0],hp[1],9);
          gr.addColorStop(0,"rgba(226,240,255,0.85)");
          gr.addColorStop(1,"rgba(226,240,255,0)");
          ctx.fillStyle=gr; ctx.beginPath(); ctx.arc(hp[0],hp[1],9,0,6.2832); ctx.fill();
        }
      }
      ctx.restore();

      for(var k=0;k<pts.length;k++){
        var d=pts[k], n2=d.n;
        var rr=n2.main?5.2:(n2.hub?4.2:3.4);
        if(n2.hub){
          var g2=ctx.createRadialGradient(d.x,d.y,0,d.x,d.y,rr*5);
          g2.addColorStop(0,"rgba(180,214,255,0.34)");
          g2.addColorStop(1,"rgba(180,214,255,0)");
          ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(d.x,d.y,rr*5,0,6.2832); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(d.x,d.y,rr,0,6.2832);
        if(n2.hub){ ctx.fillStyle="rgba(232,242,255,0.96)"; ctx.fill(); }
        else{ ctx.strokeStyle="rgba(206,228,255,0.82)"; ctx.lineWidth=1.4; ctx.stroke(); }
      }
      requestAnimationFrame(frame);
    }

    var rt;
    window.addEventListener("resize",function(){ clearTimeout(rt); rt=setTimeout(layout,140); });

    layout();
    requestAnimationFrame(frame);
  }

  function init(){
    var cvs = document.getElementById("kc-story-network-canvas");
    if (cvs && cvs.getContext) mount(cvs);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
