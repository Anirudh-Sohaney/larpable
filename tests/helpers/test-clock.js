// Fixture time only: exercise real publication limits without a production bypass.
module.exports=function installClock(start=Date.now()){
  const NativeDate=Date;let now=Number(new NativeDate(start));
  global.Date=class extends NativeDate{
    constructor(...args){super(...(args.length ? args : [now]));}
    static now(){return now;}
  };
  return {advance(ms=24*60*60*1000){now+=ms;},set(value){now=Number(new NativeDate(value));},restore(){global.Date=NativeDate;},
    afterPublication(method,route,status){if(method==='POST' && status>=200 && status<300 && (/^\/api\/(posts|opportunities)$/.test(route) || /\/publish$/.test(route)))now+=24*60*60*1000;}
  };
};
