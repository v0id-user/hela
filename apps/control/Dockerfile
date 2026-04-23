ARG ELIXIR_VERSION=1.17.3
ARG OTP_VERSION=27.1.2
ARG DEBIAN_VERSION=bookworm-20241016-slim

FROM hexpm/elixir:${ELIXIR_VERSION}-erlang-${OTP_VERSION}-debian-${DEBIAN_VERSION} AS builder
RUN apt-get update -y && apt-get install -y build-essential git && apt-get clean
WORKDIR /app
RUN mix local.hex --force && mix local.rebar --force
ENV MIX_ENV=prod
COPY mix.exs mix.lock ./
RUN mix deps.get --only $MIX_ENV
RUN mkdir config
COPY config/config.exs config/prod.exs config/
RUN mix deps.compile
COPY priv priv
COPY lib lib
RUN mix compile
COPY config/runtime.exs config/
COPY rel rel
RUN mix release

FROM debian:bookworm-20241016-slim
RUN apt-get update -y && apt-get install -y libstdc++6 openssl libncurses5 locales ca-certificates && apt-get clean
RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen
ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
WORKDIR /app
ENV MIX_ENV=prod
COPY --from=builder --chown=nobody:root /app/_build/prod/rel/control ./
USER nobody
CMD ["/app/bin/server"]
