# Deployment variables

GitHub Actions deploy and post-deploy checks read public service URLs from
GitHub variables. Do not hardcode Railway URLs in `.github/workflows/ci.yml`.

Required production variables:

- `PROD_HELA_GATEWAY_URL`
- `PROD_HELA_CONTROL_URL`
- `PROD_HELA_APP_URL`
- `PROD_HELA_WEB_URL`
- `PROD_HELA_DOCS_URL`

Required dev variables:

- `DEV_HELA_GATEWAY_URL`
- `DEV_HELA_CONTROL_URL`
- `DEV_HELA_APP_URL`
- `DEV_HELA_WEB_URL`
- `DEV_HELA_DOCS_URL`

These are intentionally public URLs, not secrets. Keep credentials in GitHub
environment secrets or Railway variables.
