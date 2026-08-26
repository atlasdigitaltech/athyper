import { notificationServiceWorkerSource } from "@athyper/platform-communications-notifications-client/service-worker";
export function GET(){return new Response(notificationServiceWorkerSource,{headers:{"content-type":"text/javascript; charset=utf-8","cache-control":"no-cache","service-worker-allowed":"/"}});}
