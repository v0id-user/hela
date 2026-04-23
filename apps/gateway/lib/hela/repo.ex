defmodule Hela.Repo do
  use Ecto.Repo,
    otp_app: :hela,
    adapter: Ecto.Adapters.Postgres
end
