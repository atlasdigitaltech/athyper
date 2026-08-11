import pg from "pg";
const {Client}=pg;

export interface PostgresNotificationListenerConfig {
  readonly connectionString:string;readonly channel:string;readonly connectionMode:"direct";
  readonly reconnectMinMs?:number;readonly reconnectMaxMs?:number;
  readonly onError?:(error:Error)=>void;
}
export interface PostgresNotificationListener { start(onWake:()=>void,onReconnect:()=>void):Promise<void>;close():Promise<void>; }

/** Dedicated PostgreSQL session listener. Never use a transaction-pooled PgBouncer URL. */
export function createPostgresNotificationListener(config:PostgresNotificationListenerConfig):PostgresNotificationListener{
  if(config.connectionMode!=="direct")throw new TypeError("LISTEN requires a direct PostgreSQL session connection");
  if(!/^[a-z_][a-z0-9_]{0,62}$/.test(config.channel))throw new TypeError("Invalid PostgreSQL notification channel");
  const min=config.reconnectMinMs??500;const max=config.reconnectMaxMs??30000;
  if(!Number.isInteger(min)||!Number.isInteger(max)||min<100||max<min)throw new TypeError("Invalid listener reconnect policy");
  let client:pg.Client|undefined;let closed=false;let reconnectTimer:ReturnType<typeof setTimeout>|undefined;let attempt=0;let wake=()=>{};let reconnected=()=>{};
  const connect=async():Promise<void>=>{
    if(closed)return;const next=new Client({connectionString:config.connectionString,application_name:`athyper-listener-${config.channel}`});client=next;
    next.on("notification",message=>{if(message.channel===config.channel)wake();});
    next.on("error",error=>{config.onError?.(error);scheduleReconnect();});
    next.on("end",()=>scheduleReconnect());
    try{await next.connect();await next.query(`LISTEN ${config.channel}`);const wasReconnect=attempt>0;attempt=0;if(wasReconnect)reconnected();wake();}
    catch(error){config.onError?.(error instanceof Error?error:new Error(String(error)));try{await next.end();}catch{}scheduleReconnect();}
  };
  const scheduleReconnect=()=>{if(closed||reconnectTimer)return;client=undefined;const delay=Math.min(max,min*2**Math.min(attempt++,8));reconnectTimer=setTimeout(()=>{reconnectTimer=undefined;void connect();},delay);(reconnectTimer as {unref?:()=>void}).unref?.();};
  return {async start(onWake,onReconnect){if(client||reconnectTimer)return;closed=false;wake=onWake;reconnected=onReconnect;await connect();},async close(){closed=true;if(reconnectTimer){clearTimeout(reconnectTimer);reconnectTimer=undefined;}const current=client;client=undefined;if(current)await current.end();}};
}
