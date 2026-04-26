# Railway uploads apps/docs as the build context (service root is
# apps/docs). CI builds dist/ with `bun run build` before `railway
# up`, and apps/docs/.railwayignore force-includes dist/ since the
# repo-root .gitignore excludes it.
#
# Same shape as apps/web — static dist served by nginx. The vite
# build needs the workspace's `docs/` folder, so the build step has
# to run from monorepo root with the workspace lockfile in scope.
# That's done in CI before `railway up apps/docs`.

FROM nginx:1.29-alpine
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
