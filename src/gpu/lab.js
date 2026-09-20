export function frameSummary(intervals){
  if(!intervals.length)return null;
  const sorted=[...intervals].sort((a,b)=>a-b),mean=intervals.reduce((a,b)=>a+b,0)/intervals.length;
  return{fps:1000/mean,median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],frames:intervals.length};
}

export function attachLab({simulation,canvas,isPaused,getView,getWeather}){
  const result=document.querySelector('#lab-result'),measure=document.querySelector('#measure-frames'),check=document.querySelector('#check-gpu'),spray=document.querySelector('#spray-toggle');
  const wind=document.querySelector('#wind-strength'),fps=document.querySelector('#live-fps');
  document.querySelector('#particle-count').textContent=`${simulation.count.toLocaleString('en-US')} GPU particles`;
  let previous=0,sample=[],measurement=null,lastDisplay=0,inspection=0;
  function cancelMeasure(message){if(measurement){measurement=null;measure.disabled=false;result.textContent=message;}}
  spray.addEventListener('click',()=>{
    simulation.setEnabled(!simulation.enabled);spray.setAttribute('aria-pressed',String(simulation.enabled));spray.textContent=simulation.enabled?'GPU spray on':'GPU spray off';
    cancelMeasure('Particle setting changed. Start a new measurement.');
  });
  wind.addEventListener('input',()=>{simulation.windScale.value=Number(wind.value);document.querySelector('#wind-value').textContent=`×${Number(wind.value).toFixed(1)}`;cancelMeasure('Wind changed. Start a new measurement.');});
  check.addEventListener('click',async()=>{
    check.disabled=true;const request=++inspection;
    try{
      const s=await simulation.inspect();if(request!==inspection)return;
      result.textContent=!s.initialized?'GPU initialization has not produced a falling stream.':s.invalid?`GPU validation failed: ${s.invalid} invalid states.`:`GPU state valid · ${s.falling.toLocaleString('en-US')} falling · ${s.splash.toLocaleString('en-US')} splashes · ${s.mist.toLocaleString('en-US')} mist · ${s.dispatches} simulation steps · height ${s.minY.toFixed(1)}–${s.maxY.toFixed(1)} m.`;
      result.dataset.valid=String(s.invalid===0&&s.initialized);result.dataset.dispatches=String(s.dispatches);
    }catch(error){result.textContent='GPU state could not be read. Try again.';console.error(error);}finally{check.disabled=false;}
  });
  measure.addEventListener('click',()=>{
    if(isPaused()){result.textContent='Resume the water animation before measuring.';return;}
    measurement={start:performance.now(),frames:[],view:getView(),weather:getWeather(),width:canvas.width,height:canvas.height};measure.disabled=true;
    result.textContent='Measuring 6 seconds. Keep this view and tab visible…';
  });
  document.addEventListener('visibilitychange',()=>{previous=0;sample=[];if(document.hidden)cancelMeasure('Measurement stopped while the tab was hidden. Tap Measure to retry.');});
  return{frame(now){
    const interval=previous?now-previous:0;previous=now;
    if(interval>0)sample.push(interval);
    if(sample.length>90)sample.shift();
    if(now-lastDisplay>650){const summary=frameSummary(sample);fps.textContent=summary?`${summary.fps.toFixed(0)} fps`:'— fps';lastDisplay=now;}
    if(measurement){
      if(isPaused()||getView()!==measurement.view||getWeather()!==measurement.weather||canvas.width!==measurement.width||canvas.height!==measurement.height){cancelMeasure('Scene changed. Start a new measurement.');return;}
      if(interval>0)measurement.frames.push(interval);
      if(now-measurement.start>=6000){
        const s=frameSummary(measurement.frames);
        result.textContent=`${s.fps.toFixed(1)} fps · median ${s.median.toFixed(1)} ms · p95 ${s.p95.toFixed(1)} ms · ${measurement.width}×${measurement.height}. Whole-scene frame timing, not GPU-only time.`;
        measurement=null;measure.disabled=false;
      }
    }
  }};
}
