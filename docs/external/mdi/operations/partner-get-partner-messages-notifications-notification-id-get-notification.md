# GET /partner/messages/notifications/:notification_id

Generated from `docs/external/MD Integrations API.postman_collection.json`. The raw Postman collection remains authoritative.

## Index

- Operation slug: `partner-get-partner-messages-notifications-notification-id-get-notification`
- Surface: `partner`
- Method: `GET`
- Path: `/partner/messages/notifications/:notification_id`
- Raw URL template: `{{baseUrl}}/partner/messages/notifications/:notification_id`
- Source folders: `Partners` / `Messages`
- Source request: `Get Notification`

## Implementation Guidance

Default implementation candidate for Apoth server-side MDI integration. Keep PHI out of logs and persist only minimal linkage/status locally.

## Request Shape

- Auth type in source: `bearer`
- Path params: `notification_id`
- Query params: `none`
- Header names: `Accept`, `Content-Type`
- Body mode: `none`
- Body note: No request body in source.

- No generated body fields.

## Response Shape

### Response 1 (200)

Shape summary only. Source scalar examples are intentionally omitted.

- created_at: string
- deleted_at: null
- dismissed_at: string
- dismissed_by_model_id: null
- dismissed_by_model_type: null
- event: string
- expires_at: null
- id: string
- metadata: object
- metadata.channel: string
- metadata.patient_id: string
- metadata.primary_clinician_id: null
- metadata.recent_encounter_id: null
- notified: null
- notified_model_id: null
- notified_model_type: string
- notifier: object
- notifier.abbreviated_name: string
- notifier.active: boolean
- notifier.address_id: string
- notifier.allergies: string
- notifier.blood_pressure: null
- notifier.clinician_id: null
- notifier.created_at: string
- notifier.current_medications: null
- notifier.date_of_birth: string
- notifier.deleted_at: null
- notifier.dosespot: object
- notifier.dosespot.dosespot_id: null
- notifier.dosespot.eligibilities: array
- notifier.dosespot.metadata: null
- notifier.dosespot.sync_status: null
- notifier.dosespot.synced_at: null
- notifier.driver_license_id: null
- notifier.email: string
- notifier.environment: object
- notifier.environment.created_at: string
- notifier.environment.deleted_at: null
- notifier.environment.id: string
- notifier.environment.identifier: string
- notifier.environment.updated_at: string
- notifier.environment_id: string
- notifier.exam_id: string
- notifier.first_name: string
- notifier.full_name: string
- notifier.gender: number
- notifier.gender_label: string
- notifier.height: number
- notifier.id: string
- notifier.important_offering_case_id: null
- notifier.intro_video_file_id: null
- notifier.intro_video_id: null
- notifier.is_live: boolean
- notifier.last_name: string
- notifier.medical_conditions: string
- notifier.metadata: null
- notifier.metafields: array
- notifier.middle_name: null
- notifier.partner_id: string
- notifier.patient_id: string
- notifier.phone_number: string
- notifier.phone_type: string
- notifier.prefix: null
- notifier.pregnancy: boolean
- notifier.recent_encounter_id: null
- notifier.ssn: null
- notifier.updated_at: string
- notifier.weight: number
- notifier_model_id: string
- notifier_model_type: string
- notify_at: null
- partner_id: string
- preview: string
- source: object
- source.channel: string
- source.created_at: string
- source.deleted_at: null
- source.dismissed_at: null
- source.dismissed_by_user_id: null
- source.dismissed_by_user_name: null
- source.dismissed_by_user_type: null
- source.emailed_at: null
- source.id: string
- source.on_behalf_user_id: null
- source.on_behalf_user_name: null
- source.on_behalf_user_type: null
- source.partner_id: string
- source.patient: object
- source.patient.abbreviated_name: string
- source.patient.active: boolean
- source.patient.address_id: string
- source.patient.allergies: string
- source.patient.blood_pressure: null
- source.patient.clinician_id: null
- source.patient.created_at: string
- source.patient.current_medications: null
- source.patient.date_of_birth: string
- source.patient.deleted_at: null
- source.patient.dosespot: object
- source.patient.dosespot.dosespot_id: null
- source.patient.dosespot.eligibilities: array
- source.patient.dosespot.metadata: null
- source.patient.dosespot.sync_status: null
- source.patient.dosespot.synced_at: null
- source.patient.driver_license_id: null
- source.patient.email: string
- source.patient.environment: object
- source.patient.environment.created_at: string
- source.patient.environment.deleted_at: null
- source.patient.environment.id: string
- source.patient.environment.identifier: string
- source.patient.environment.updated_at: string
- source.patient.environment_id: string
- source.patient.exam_id: string
- source.patient.first_name: string
- source.patient.full_name: string
- source.patient.gender: number
- source.patient.gender_label: string
- source.patient.height: number
- source.patient.id: string

## PHI Handling

Generated docs contain schema shape only. Do not log or persist MDI payloads beyond opaque IDs and minimal status/linkage records required by Apoth.
