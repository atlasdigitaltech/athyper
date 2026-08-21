import type { DispatchNotificationCommand, NotificationDispatcher } from "@athyper/server-contract-notifications";
import type { JobExecutionResult, JobHandler, JobPublisher } from "@athyper/server-contract-jobs";
import { createHash } from "node:crypto";

export const NOTIFICATION_QUEUE="notifications.delivery";
export const DISPATCH_NOTIFICATION_JOB="notifications.dispatch";
export interface QueuedNotificationCommand extends DispatchNotificationCommand { readonly idempotencyKey:string; }

export function createNotificationDispatchScheduler(jobs:JobPublisher){return {async schedule(command:QueuedNotificationCommand){validate(command);const digest=createHash("sha256").update(`${command.planeKey}:${command.tenantId}:${command.idempotencyKey}`).digest("hex");await jobs.enqueue(NOTIFICATION_QUEUE,DISPATCH_NOTIFICATION_JOB,command,{jobId:`notification-${digest}`,maxAttempts:5,removeOnComplete:5000,removeOnFail:10000});}};}
export function createNotificationDispatchHandler(dispatcher:NotificationDispatcher):JobHandler<typeof DISPATCH_NOTIFICATION_JOB,QueuedNotificationCommand>{return {async handle(job):Promise<JobExecutionResult>{const command=validate(job.data);const result=await dispatcher.dispatch(command);const failed=result.deliveries.filter(delivery=>delivery.status==="failed");if(failed.length>0)throw new AggregateError(failed.map(delivery=>new Error(delivery.error??`${delivery.channel} delivery failed`)),"One or more notification deliveries failed");return {status:"completed",output:{delivered:result.deliveries.filter(delivery=>delivery.status==="delivered").length,skipped:result.deliveries.filter(delivery=>delivery.status==="skipped").length}};}};}
function validate<T extends QueuedNotificationCommand>(command:T):T{if(!["studio","neon","mesh"].includes(command.planeKey)||!uuid(command.tenantId)||!uuid(command.principalId)||!command.idempotencyKey.trim()||command.channels.length===0)throw new TypeError("Invalid queued notification command");return command;}
function uuid(value:string){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);}
