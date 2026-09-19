// Called by the local-only maintenance CLI. No audit/outbox deletion or secret output.
export const PILOT_TENANT='44444444-4444-4444-8444-444444444444';
export const LOCAL_TEMPLATE='master.contact.local-verification';
export const terminalSql = alias => `(${alias}.status IN ('delivered','cancelled','bounced') OR (${alias}.status='failed' AND (${alias}.attempt_count>=${alias}.max_attempts OR ${alias}.error_category='permanent')))`;
export function retentionSql() { return `
WITH candidates AS (
 SELECT m.id FROM event.notification_message m WHERE m.tenant_id='${PILOT_TENANT}' AND m.template_key='${LOCAL_TEMPLATE}'
 AND m.created_at<now()-interval '7 days'
 AND (m.payload ? 'localVerification' OR EXISTS(SELECT 1 FROM event.notification_delivery d WHERE d.tenant_id=m.tenant_id AND d.message_id=m.id AND d.channel_detail ? 'localVerification'))
 AND NOT EXISTS(SELECT 1 FROM event.notification_delivery d WHERE d.tenant_id=m.tenant_id AND d.message_id=m.id AND (NOT ${terminalSql('d')} OR d.locked_until>now()))
 ORDER BY m.created_at LIMIT 500 FOR UPDATE SKIP LOCKED
), scrub_deliveries AS (
 UPDATE event.notification_delivery d SET channel_detail=channel_detail-'localVerification',updated_at=now(),updated_by=created_by
 WHERE d.tenant_id='${PILOT_TENANT}' AND d.message_id IN(SELECT id FROM candidates) AND channel_detail ? 'localVerification' RETURNING id
), scrub_messages AS (
 UPDATE event.notification_message m SET payload=payload-'localVerification',updated_at=now(),updated_by=created_by WHERE m.tenant_id='${PILOT_TENANT}' AND m.id IN(SELECT id FROM candidates) RETURNING id
), expired AS (
 SELECT c.id FROM master.local_contact_challenge c WHERE c.tenant_id='${PILOT_TENANT}' AND c.expires_at<now()-interval '7 days'
 AND NOT EXISTS(SELECT 1 FROM event.notification_message m JOIN event.notification_delivery d ON d.tenant_id=m.tenant_id AND d.message_id=m.id WHERE m.tenant_id=c.tenant_id AND m.entity_id=c.id AND m.template_key='${LOCAL_TEMPLATE}' AND (NOT ${terminalSql('d')} OR d.locked_until>now()))
 ORDER BY c.expires_at LIMIT 500 FOR UPDATE SKIP LOCKED
), deleted AS (
 DELETE FROM master.local_contact_challenge c WHERE c.tenant_id='${PILOT_TENANT}' AND c.id IN(SELECT id FROM expired) RETURNING id
), old_windows AS (
 SELECT tenant_id,principal_id,operation FROM master.local_contact_challenge_limit WHERE tenant_id='${PILOT_TENANT}' AND window_start<now()-interval '1 day' LIMIT 500 FOR UPDATE SKIP LOCKED
), limits AS (
 DELETE FROM master.local_contact_challenge_limit l USING old_windows w WHERE (l.tenant_id,l.principal_id,l.operation)=(w.tenant_id,w.principal_id,w.operation) RETURNING l.principal_id
) SELECT jsonb_build_object('challengeRowsDeleted',(SELECT count(*) FROM deleted),'encryptedMessagesScrubbed',(SELECT count(*) FROM scrub_messages),'encryptedDeliveriesScrubbed',(SELECT count(*) FROM scrub_deliveries),'oldRateWindowsDeleted',(SELECT count(*) FROM limits));`; }
export function queueHealthSql() {return `SELECT jsonb_build_object(
 'pending',count(*) FILTER(WHERE NOT ${terminalSql('d')}),
 'oldestPendingSeconds',coalesce(max(extract(epoch FROM now()-d.created_at)) FILTER(WHERE NOT ${terminalSql('d')}),0),
 'expiredPending',count(*) FILTER(WHERE NOT ${terminalSql('d')} AND c.expires_at<=now()),
 'terminalFailuresLastDay',count(*) FILTER(WHERE d.status='failed' AND ${terminalSql('d')} AND coalesce(d.updated_at,d.created_at)>now()-interval '1 day'),
 'expiredLeases',count(*) FILTER(WHERE d.status='sending' AND d.locked_until<=now())
 ) FROM event.notification_delivery d JOIN event.notification_message m ON m.tenant_id=d.tenant_id AND m.id=d.message_id
 LEFT JOIN master.local_contact_challenge c ON c.tenant_id=m.tenant_id AND c.id=m.entity_id
 WHERE m.tenant_id='${PILOT_TENANT}' AND m.template_key='${LOCAL_TEMPLATE}';`;}
export function queueAlerts(queue) {const alerts=[];if(queue.oldestPendingSeconds>120)alerts.push('delivery_wait_over_120_seconds');if(queue.expiredPending)alerts.push('expired_proofs_pending');if(queue.terminalFailuresLastDay)alerts.push('terminal_delivery_failures');if(queue.expiredLeases)alerts.push('expired_worker_leases');return alerts;}
