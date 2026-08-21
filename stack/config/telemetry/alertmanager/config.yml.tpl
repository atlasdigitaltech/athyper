global:
  resolve_timeout: 5m
  smtp_smarthost: "__ALERTMANAGER_SMTP_SMARTHOST__"
  smtp_from: "__ALERTMANAGER_SMTP_FROM__"
  smtp_require_tls: __ALERTMANAGER_SMTP_REQUIRE_TLS__
  smtp_auth_username: "__ALERTMANAGER_SMTP_AUTH_USERNAME__"
  smtp_auth_password: "__ALERTMANAGER_SMTP_AUTH_PASSWORD__"

route:
  receiver: platform-email
  group_by: ["alertname", "team", "severity", "tenant", "service"]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - matchers:
        - severity="critical"
      receiver: critical-email
      continue: true
    - matchers:
        - team="finance"
      receiver: finance-email
    - matchers:
        - team="compliance"
      receiver: compliance-email
    - matchers:
        - team="security"
      receiver: security-email
    - matchers:
        - team="platform"
      receiver: platform-email

inhibit_rules:
  - source_matchers:
      - severity="critical"
    target_matchers:
      - severity="warning"
    equal: ["alertname", "tenant", "service", "team"]

receivers:
  - name: platform-email
    email_configs:
      - to: "__ALERTMANAGER_PLATFORM_EMAIL__"
        send_resolved: true
        headers:
          subject: "[athyper {{ .CommonLabels.severity }}] {{ .CommonLabels.alertname }}"

  - name: critical-email
    email_configs:
      - to: "__ALERTMANAGER_CRITICAL_EMAIL__"
        send_resolved: true
        headers:
          subject: "[athyper CRITICAL] {{ .CommonLabels.alertname }}"

  - name: finance-email
    email_configs:
      - to: "__ALERTMANAGER_FINANCE_EMAIL__"
        send_resolved: true
        headers:
          subject: "[athyper finance {{ .CommonLabels.severity }}] {{ .CommonLabels.alertname }}"

  - name: compliance-email
    email_configs:
      - to: "__ALERTMANAGER_COMPLIANCE_EMAIL__"
        send_resolved: true
        headers:
          subject: "[athyper compliance {{ .CommonLabels.severity }}] {{ .CommonLabels.alertname }}"

  - name: security-email
    email_configs:
      - to: "__ALERTMANAGER_SECURITY_EMAIL__"
        send_resolved: true
        headers:
          subject: "[athyper security {{ .CommonLabels.severity }}] {{ .CommonLabels.alertname }}"
