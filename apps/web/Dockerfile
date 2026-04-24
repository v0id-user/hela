# Railway uploads apps/web as the build context (service root is
# apps/web). CI builds dist/ with `bun run build` before `railway
# up`, and apps/web/.railwayignore force-includes dist/ since the
# repo-root .gitignore excludes it.
#
# Rationale for not multi-stage-building inside the container: the
# vite build needs workspace-resolved `@hela/sdk` + `@hela/sdk-types`,
# which live outside apps/web. Switching Railway to monorepo-root
# context requires a dashboard change (Root Directory = "/") — see
# RESUME.md → "switch to in-container build" if we want that.
#
# The CI `/version` commit-match gate catches staleness — a failed
# build that serves a cached old image will fail CI now, not ship
# silently like it did on the first launch attempt.

FROM nginx:1.29-alpine
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
