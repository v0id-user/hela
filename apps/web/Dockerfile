# Railway deploys this with --path-as-root=apps/web. The build happens
# locally (or in CI) via `bun run build`, producing ./dist/. This image
# just serves the static output behind nginx.
FROM nginx:1.27-alpine
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
