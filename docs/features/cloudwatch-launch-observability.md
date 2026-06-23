# CloudWatch Launch Observability

## Scope

The launch stack uses AWS-native CloudWatch dashboards and alarms for supervised
operations. The baseline covers API errors, webhook queue health, scheduled job
failures, reconciliation drift/review metrics, and contract-only application
metrics for Stripe webhooks, MDI outbound failures, onboarding failures, and
webhook processing failures.

## Safety Contract

- Dashboard widgets and custom metrics are aggregate-only.
- Custom metric dimensions are limited to `Stage`, `Provider`, `Outcome`,
  `ReasonCode`, and `RouteGroup`.
- Alarm descriptions include owner `launch-ops`, the manual CloudWatch watch
  channel, and the serverless runbook alarm map.
- Alarm actions remain unset until an approved ops contact path exists.
- No dashboards, alarms, metrics, or logs may include questionnaire content,
  clinical content, raw provider payloads, workflow URLs, tokens, payment
  instruments, or free-text support/clinical notes.

## Operator Entry Points

- Dashboard: `apoth-{stage}-launch-observability`
- Runbook: `docs/runbooks/serverless-iac.md#alarm-map`
- Metric namespace: `Apoth/Application`
