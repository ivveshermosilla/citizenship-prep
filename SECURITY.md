# Security

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/ivveshermosilla/citizenship-prep/security/advisories/new)
for this repository. Do not report credentials, personal information, or account
access details in public issues, pull requests, or comments.

Describe the affected component and a minimal reproduction with all sensitive
values removed. Do not access another person's data to demonstrate a finding.

## Handling an exposed credential

Stop further publication. Notify the owner privately with the provider and file
location, without repeating the value. Revoke or rotate the affected credential,
review access/activity, and update authorized consumers. Removing a file alone
does not revoke a credential or remove it from existing clones and Git history.
Coordinate history changes with the owner; never force-push as an automatic fix.

## Current boundaries

The repository contains documentation and security tooling only. There is no
application deployment or user-data flow to assess yet. Local hooks, GitHub
Actions, secret scanning, and push protection are complementary checks and do
not detect every possible secret or data exposure.

Future application work must validate database authorization and private-data
isolation independently of repository secret checks.
