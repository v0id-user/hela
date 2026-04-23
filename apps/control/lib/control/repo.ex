defmodule Control.Repo do
  use Ecto.Repo, otp_app: :control, adapter: Ecto.Adapters.Postgres
end
