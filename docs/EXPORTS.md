# Export format

All exports use the current edited job card. Unknown values are empty. No full raw message is included. Structured JSON retains short field evidence quotes, issues and extracted/user-entered status. Both formats include source mode, review status and warnings. A review acknowledgment is not an identity check, signature, booking or approval of work.

CSV is UTF-8, one header row and one data row, generated with PapaParse. Every cell is quoted, embedded quotes are doubled, and CRLF separates records. Commas, Unicode and line breaks are preserved. Before serialization, a literal apostrophe is added when a cell begins with `=`, `+`, `-` or `@` after whitespace/control/format characters, or begins with tab/newline. This deliberately includes international phone numbers beginning with `+`. Spreadsheet software may display the apostrophe as text; do not remove it before importing untrusted content. Plain CSV quoting does not neutralize formulas.

Stable v1 headers in order:

```text
source_mode,review_status,required_checks_satisfied,required_checks_total,contactName,company,phone,email,contactPreference,addressRaw,addressStreet,addressCity,addressRegion,addressPostalCode,propertyType,suggestedTrade,requestedServices,summary,requestedTiming,requestedDate,urgency,accessNotes,budget,dimensions,warnings
```

JSON `schemaVersion:1` includes `sourceMode`, `modeDescription`, `reviewed`, `reviewStatus`, `multipleRequests`, `requiredChecks`, `fields` and `warnings`. Each field contains nullable value, status, literal source evidence and issues. The human-corrected record is authoritative for these exports; the separate original snapshot remains visible in the browser.
