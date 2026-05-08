-- LookupDomain/log/activity_type.sql
-- Lookup values for domain: log.activity_type
-- Idempotent: WHERE NOT EXISTS guard

INSERT INTO control.lookup_value
    (code, name, domain_code, description, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.description, v.sort_order, true, 'active',
       '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    -- document domain
    ('document.created',     'Document Created',          'log.activity_type', 'Document record created in draft state.',                            1),
    ('document.updated',     'Document Updated',          'log.activity_type', 'Document header fields updated.',                                    2),
    ('document.deleted',     'Document Deleted',          'log.activity_type', 'Document record deleted.',                                           3),
    ('document.item_created','Document Item Created',     'log.activity_type', 'Document line item added.',                                          4),
    ('document.item_updated','Document Item Updated',     'log.activity_type', 'Document line item fields updated.',                                 5),
    ('document.item_deleted','Document Item Deleted',     'log.activity_type', 'Document line item removed.',                                        6),
    ('document.ready',       'Document Ready',            'log.activity_type', 'Document completed draft checks and moved to ready state.',          7),
    ('document.submitted',   'Document Submitted',        'log.activity_type', 'Document submitted for approval or processing.',                     8),
    ('document.approved',    'Document Approved',         'log.activity_type', 'Document approved and advanced to next state.',                      9),
    ('document.rejected',    'Document Rejected',         'log.activity_type', 'Document rejected; returned to submitter.',                         10),
    ('document.cancelled',   'Document Cancelled',        'log.activity_type', 'Document cancelled and closed from further processing.',            11),
    ('document.reopened',    'Document Reopened',         'log.activity_type', 'Cancelled or rejected document reopened for editing.',              12),
    ('document.amended',     'Document Amended',          'log.activity_type', 'New amendment version created from an approved document.',          13),
    -- workflow domain
    ('workflow.initiated',   'Workflow Initiated',        'log.activity_type', 'Approval workflow routing initiated for the document.',              20),
    ('workflow.approved',    'Workflow Approved',         'log.activity_type', 'Approver approved the workflow step.',                              21),
    ('workflow.rejected',    'Workflow Rejected',         'log.activity_type', 'Approver rejected the workflow step.',                              22),
    ('workflow.delegated',   'Workflow Delegated',        'log.activity_type', 'Approval task delegated to another principal.',                     23),
    ('workflow.escalated',   'Workflow Escalated',        'log.activity_type', 'Approval task auto-escalated due to SLA breach.',                  24),
    ('workflow.recalled',    'Workflow Recalled',         'log.activity_type', 'Submitted workflow recalled by the originator.',                    25),
    -- accounting domain
    ('accounting.posted',    'Journal Posted',            'log.activity_type', 'Accounting journal entry posted to the ledger.',                     15),
    ('accounting.reversed',  'Journal Reversed',          'log.activity_type', 'Posted journal entry reversed.',                                     16),
    ('accounting.revalued',  'Currency Revalued',         'log.activity_type', 'Document revalued at a new exchange rate.',                          17),
    -- payment domain
    ('payment.initiated',    'Payment Initiated',         'log.activity_type', 'Payment run initiated for the document.',                            18),
    ('payment.cleared',      'Payment Cleared',           'log.activity_type', 'Payment confirmed cleared by bank.',                                 19),
    ('payment.reversed',     'Payment Reversed',          'log.activity_type', 'Payment reversed or recalled.',                                      20),
    -- system domain
    ('system.import',        'Record Imported',           'log.activity_type', 'Record created via bulk import.',                                    21),
    ('system.migration',     'Record Migrated',           'log.activity_type', 'Record migrated from a legacy system.',                              22),
    ('system.auto_action',   'Automated Action',          'log.activity_type', 'Background automation applied an action to the record.',             23),
    -- kpi domain
    ('kpi.calculation',      'KPI Calculation',        'log.activity_type', 'KPI value calculated for a period.',                        10),
    ('kpi.threshold_breach', 'KPI Threshold Breach',   'log.activity_type', 'KPI value breached a defined threshold.',                   20),
    ('kpi.published',        'KPI Published',          'log.activity_type', 'KPI result published to a report pack.',                    30),
    -- pack domain
    ('pack.generated',       'Pack Generated',         'log.activity_type', 'Report pack instance generated.',                          40),
    ('pack.published',       'Pack Published',         'log.activity_type', 'Report pack published to recipients.',                     50),
    ('pack.recalled',        'Pack Recalled',          'log.activity_type', 'Published pack recalled by author.',                       60),
    -- release domain
    ('release.submitted',    'Release Submitted',      'log.activity_type', 'Release submitted for approval.',                          70),
    ('release.approved',     'Release Approved',       'log.activity_type', 'Release approved by authorised reviewer.',                 80),
    ('release.rejected',     'Release Rejected',       'log.activity_type', 'Release rejected.',                                        90),
    -- planning domain
    ('planning.line_saved',  'Planning Line Saved',    'log.activity_type', 'Budget/forecast line created or updated.',                  100),
    ('planning.model_run',   'Planning Model Run',     'log.activity_type', 'Planning model calculation run triggered.',                 110),
    -- close domain
    ('close.step_completed', 'Close Step Completed',   'log.activity_type', 'A period-close checklist step completed.',                  120),
    ('close.step_waived',    'Close Step Waived',      'log.activity_type', 'A period-close checklist step waived by authorised user.',  130),
    -- approval domain
    ('approval.submitted',   'Approval Submitted',     'log.activity_type', 'Approval request submitted.',                              140),
    ('approval.approved',    'Approval Approved',      'log.activity_type', 'Approval request approved by reviewer.',                   150),
    ('approval.rejected',    'Approval Rejected',      'log.activity_type', 'Approval request rejected.',                               160),
    ('approval.escalated',   'Approval Escalated',     'log.activity_type', 'Approval request escalated due to SLA breach.',            170),
    -- user domain
    ('user.comment_read',    'Comment Read',           'log.activity_type', 'Principal read a comment. Migrated from log.comment_read.', 180),
    ('user.comment_response','Comment Response',       'log.activity_type', 'Principal responded to a comment.',                        190),
    ('user.record_view',     'Record Viewed',          'log.activity_type', 'Principal viewed a record. Replaces log.recent_activity.',  200),
    ('user.record_selected', 'Record Selected',        'log.activity_type', 'Principal selected a record from an entity picker. Feeds recently-used entity chooser sections.', 205),
    -- upupr domain
    ('upupr.submitted',           'UPUPR Submitted',              'log.activity_type', 'UPUPR request submitted by principal.',                   210),
    ('upupr.assigned',            'UPUPR Assigned to Supervisor', 'log.activity_type', 'UPUPR assigned to supervisor for review.',                220),
    ('upupr.approved',            'UPUPR Approved',               'log.activity_type', 'UPUPR request approved by supervisor.',                   230),
    ('upupr.rejected',            'UPUPR Rejected',               'log.activity_type', 'UPUPR request rejected by supervisor.',                   240),
    ('upupr.returned',            'UPUPR Returned for Revision',  'log.activity_type', 'UPUPR returned to requestor for revision.',               250),
    ('upupr.resubmitted',         'UPUPR Resubmitted',            'log.activity_type', 'UPUPR resubmitted after revision.',                      260),
    ('upupr.cancelled',           'UPUPR Cancelled',              'log.activity_type', 'UPUPR request cancelled.',                               270),
    ('upupr.provisioned',         'UPUPR Provisioned',            'log.activity_type', 'UPUPR changes provisioned to target tables.',             280),
    ('upupr.supervisor_fallback', 'UPUPR Supervisor Fallback',    'log.activity_type', 'UPUPR supervisor fallback triggered.',                    290)
) AS v(code, name, domain_code, description, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);
